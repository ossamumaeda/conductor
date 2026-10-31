import { watch, type FSWatcher } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { PROJECTS_DIR } from './paths'
import type { TranscriptLine } from './types'

/**
 * Histórico a partir de `~/.claude/projects/<cwd>/<sessionId>.jsonl` (D-004, fase 4).
 *
 * Os arquivos chegam a dezenas de MB. Em vez de ler tudo, cada arquivo é lido em dois trechos:
 * - início (HEAD_BYTES): diretório, primeiro prompt e título dado por `--name`. Lido uma vez só,
 *   porque o .jsonl só cresce no fim;
 * - fim (TAIL_BYTES): título mais recente, última atividade e branch. Relido quando o arquivo muda.
 * O cache usa (tamanho, mtime) para saber o que mudou.
 */

const HEAD_BYTES = 256 * 1024
const TAIL_BYTES = 256 * 1024
const UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i
const TITLE_MAX = 80

export interface SessionRecord {
  sessionId: string
  title: string
  cwd: string
  lastActivity: number
  branch: string | null
}

interface HeadInfo {
  cwd: string | null
  firstPrompt: string | null
  customTitle: string | null
  aiTitle: string | null
  firstTimestamp: number | null
}

interface TailInfo {
  customTitle: string | null
  aiTitle: string | null
  lastTimestamp: number | null
  branch: string | null
  cwd: string | null
}

interface CacheEntry {
  size: number
  mtimeMs: number
  head: HeadInfo
  tail: TailInfo
}

async function readRange(path: string, start: number, length: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, start)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

/** Linhas completas de um trecho: descarta a parcial do começo (se não for o início do arquivo) e a do fim. */
function completeLines(chunk: string, fromStart: boolean, toEnd: boolean): string[] {
  const lines = chunk.split('\n')
  if (!fromStart) lines.shift()
  if (!toEnd) lines.pop()
  return lines.filter((l) => l.length > 0)
}

function parse(line: string): TranscriptLine | null {
  try {
    return JSON.parse(line) as TranscriptLine
  } catch {
    return null
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

function toMs(timestamp: unknown): number | null {
  const ms = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN
  return Number.isFinite(ms) ? ms : null
}

/** Texto do primeiro prompt humano, sem comandos internos (<command-name>, <system-reminder>…). */
function promptText(line: TranscriptLine): string | null {
  if (line.type !== 'user' || line.isMeta || line.isSidechain) return null
  const content = line.message?.content
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content) ? content.find((c) => c.type === 'text' && typeof c.text === 'string')?.text : undefined
  if (!text) return null
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean || clean.startsWith('<')) return null
  return clean
}

/** Filtro barato antes do JSON.parse: linhas de API chegam a centenas de KB. */
const INTERESTING = ['"custom-title"', '"ai-title"', '"type":"user"', '"cwd"']

function scanHead(lines: string[]): HeadInfo {
  const info: HeadInfo = { cwd: null, firstPrompt: null, customTitle: null, aiTitle: null, firstTimestamp: null }
  for (const raw of lines) {
    if (!INTERESTING.some((k) => raw.includes(k))) continue
    const line = parse(raw)
    if (!line) continue
    info.cwd ??= str(line.cwd)
    info.firstTimestamp ??= toMs(line.timestamp)
    info.firstPrompt ??= promptText(line)
    if (line.type === 'custom-title') info.customTitle = str(line.customTitle) ?? info.customTitle
    if (line.type === 'ai-title') info.aiTitle = str(line.aiTitle) ?? info.aiTitle
  }
  return info
}

const TIMESTAMP = /"timestamp":"([^"]+)"/
const BRANCH = /"gitBranch":"([^"]*)"/
const CWD = /"cwd":"((?:[^"\\]|\\.)*)"/

function scanTail(lines: string[]): TailInfo {
  const info: TailInfo = { customTitle: null, aiTitle: null, lastTimestamp: null, branch: null, cwd: null }
  // De trás para frente: o primeiro valor achado é o mais recente.
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i] as string
    if (info.lastTimestamp === null) {
      const m = TIMESTAMP.exec(raw)
      if (m) info.lastTimestamp = toMs(m[1])
    }
    if (info.branch === null) {
      const m = BRANCH.exec(raw)
      if (m && m[1]) info.branch = m[1]
    }
    if (info.cwd === null) {
      const m = CWD.exec(raw)
      if (m) info.cwd = str(parse(`"${m[1]}"`) as unknown)
    }
    if (info.customTitle === null && raw.includes('"custom-title"')) info.customTitle = str(parse(raw)?.customTitle)
    if (info.aiTitle === null && raw.includes('"ai-title"')) info.aiTitle = str(parse(raw)?.aiTitle)
    if (info.lastTimestamp !== null && info.branch !== null && info.cwd !== null && info.customTitle !== null) break
  }
  return info
}

function truncate(text: string): string {
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text
}

export class HistoryIndex {
  private readonly cache = new Map<string, CacheEntry>()

  /** Varre todas as sessões. Só relê os arquivos que mudaram desde a última varredura. */
  async scan(): Promise<SessionRecord[]> {
    let projects: string[]
    try {
      projects = await readdir(PROJECTS_DIR)
    } catch {
      return []
    }

    const seen = new Set<string>()
    const records: SessionRecord[] = []
    for (const project of projects) {
      const dir = join(PROJECTS_DIR, project)
      let files: string[]
      try {
        files = (await readdir(dir)).filter((f) => UUID_FILE.test(f))
      } catch {
        continue // não é pasta
      }
      for (const file of files) {
        const path = join(dir, file)
        seen.add(path)
        const record = await this.read(path, file.slice(0, -'.jsonl'.length))
        if (record) records.push(record)
      }
    }
    for (const key of this.cache.keys()) if (!seen.has(key)) this.cache.delete(key)
    return records.sort((a, b) => b.lastActivity - a.lastActivity)
  }

  private async read(path: string, sessionId: string): Promise<SessionRecord | null> {
    let info
    try {
      info = await stat(path)
    } catch {
      return null
    }
    let entry = this.cache.get(path)
    if (!entry || entry.size !== info.size || entry.mtimeMs !== info.mtimeMs) {
      try {
        // O início só muda enquanto o arquivo é menor que HEAD_BYTES; depois disso, reaproveita.
        const headDone = entry !== undefined && (entry.size >= HEAD_BYTES || (entry.head.cwd !== null && entry.head.firstPrompt !== null))
        const head = headDone ? entry!.head : scanHead(
          completeLines(await readRange(path, 0, Math.min(HEAD_BYTES, info.size)), true, info.size <= HEAD_BYTES)
        )
        const tailStart = Math.max(0, info.size - TAIL_BYTES)
        const tail = scanTail(completeLines(await readRange(path, tailStart, info.size - tailStart), tailStart === 0, true))
        entry = { size: info.size, mtimeMs: info.mtimeMs, head, tail }
        this.cache.set(path, entry)
      } catch {
        return null
      }
    }

    const { head, tail } = entry
    const cwd = head.cwd ?? tail.cwd
    const title = tail.customTitle ?? head.customTitle ?? tail.aiTitle ?? head.aiTitle ?? head.firstPrompt
    // Sem diretório ou sem nenhum prompt: sessão vazia ou interna, não entra no histórico.
    if (!cwd || !title) return null
    return {
      sessionId,
      title: truncate(title),
      cwd,
      lastActivity: tail.lastTimestamp ?? head.firstTimestamp ?? info.mtimeMs,
      branch: tail.branch
    }
  }
}

/** Observa `~/.claude/projects` (recursivo) e chama `onChange` com debounce. */
export function watchProjects(onChange: () => void, debounceMs = 600): () => void {
  let timer: NodeJS.Timeout | undefined
  let watcher: FSWatcher | undefined
  try {
    watcher = watch(PROJECTS_DIR, { recursive: true }, (_event, file) => {
      if (file && !String(file).endsWith('.jsonl')) return
      clearTimeout(timer)
      timer = setTimeout(onChange, debounceMs)
    })
  } catch {
    // Sem a pasta ainda: nada a observar.
  }
  return () => {
    clearTimeout(timer)
    watcher?.close()
  }
}
