import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ContextUsage, RateLimit } from '../shared/ipc'
import { CLAUDE_DIR } from './claude-data/paths'

/**
 * Status line injetada via `--settings` (D-005, revisada na fase 5).
 *
 * O comando é uma linha de shell, sem script: `cat` grava o JSON recebido em
 * `<stateDir>/<terminalId>.json` (tmp + mv, escrita atômica). Assim não depende de `node`
 * no PATH nem de arquivos dentro do .asar no app empacotado. O arquivo é por terminal,
 * não por sessão, porque `/clear` troca o session_id dentro do mesmo processo.
 *
 * Se o usuário tiver uma status line própria em ~/.claude/settings.json, ela roda em
 * seguida com o mesmo JSON e continua aparecendo na TUI. Sem ela, nada é impresso e a
 * TUI fica igual à de sempre.
 */

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`

async function userStatusLineCommand(): Promise<string | null> {
  try {
    const settings = JSON.parse(await readFile(join(CLAUDE_DIR, 'settings.json'), 'utf8')) as {
      statusLine?: { type?: string; command?: string }
    }
    const command = settings.statusLine?.type === 'command' ? settings.statusLine.command : undefined
    return typeof command === 'string' && command.trim() ? command : null
  } catch {
    return null
  }
}

export async function statusLineSettings(stateDir: string, terminalId: string): Promise<Record<string, unknown>> {
  const file = shellQuote(join(stateDir, `${terminalId}.json`))
  const tmp = shellQuote(join(stateDir, `${terminalId}.json.tmp`))
  const save = `cat > ${tmp} && mv -f ${tmp} ${file}`
  const user = await userStatusLineCommand()
  const command = user ? `${save}; ( ${user} ) < ${file}` : save
  return { statusLine: { type: 'command', command, padding: 0 } }
}

// ---------- Leitura dos payloads ----------

/** Campos usados do payload (formato capturado na fase 0, docs/fontes-de-dados.md). */
interface StatusPayload {
  session_id?: string
  session_name?: string
  model?: { display_name?: string; id?: string }
  context_window?: {
    context_window_size?: number
    current_usage?: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | null
  }
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number }
    seven_day?: { used_percentage?: number; resets_at?: number }
  }
}

export interface StatusUpdate {
  terminalId: string
  sessionId: string | null
  name: string | null
  model: string | null
  context: ContextUsage | null
  fiveHour: RateLimit | null
  sevenDay: RateLimit | null
  /** mtime do arquivo, em ms. */
  at: number
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function rateLimit(raw: { used_percentage?: number; resets_at?: number } | undefined): RateLimit | null {
  const used = num(raw?.used_percentage)
  const resets = num(raw?.resets_at)
  if (used === null || resets === null) return null
  return { usedPercentage: used, resetsAt: resets * 1000 } // resets_at vem em segundos Unix
}

function toUpdate(terminalId: string, payload: StatusPayload, at: number): StatusUpdate {
  const usage = payload.context_window?.current_usage
  const windowSize = num(payload.context_window?.context_window_size)
  const used = usage
    ? (num(usage.input_tokens) ?? 0) + (num(usage.cache_creation_input_tokens) ?? 0) + (num(usage.cache_read_input_tokens) ?? 0)
    : null
  return {
    terminalId,
    sessionId: typeof payload.session_id === 'string' ? payload.session_id : null,
    name: typeof payload.session_name === 'string' && payload.session_name.trim() ? payload.session_name : null,
    model: typeof payload.model?.display_name === 'string' ? payload.model.display_name : null,
    context: windowSize && used !== null ? { usedTokens: used, windowSize } : null,
    fiveHour: rateLimit(payload.rate_limits?.five_hour),
    sevenDay: rateLimit(payload.rate_limits?.seven_day),
    at
  }
}

/** Observa a pasta de estado e entrega cada payload novo, já interpretado. */
export class StatusLineWatcher {
  private watcher: FSWatcher | undefined
  private readonly timers = new Map<string, NodeJS.Timeout>()
  private readonly lastMtime = new Map<string, number>()

  constructor(private readonly dir: string, private readonly onUpdate: (update: StatusUpdate) => void) {}

  async start(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    // Restos de execuções anteriores (crash): os terminais deles não existem mais.
    for (const file of await readdir(this.dir)) await rm(join(this.dir, file), { force: true })
    this.watcher = watch(this.dir, (_event, file) => {
      const name = file ? String(file) : ''
      if (!name.endsWith('.json')) return
      clearTimeout(this.timers.get(name))
      this.timers.set(name, setTimeout(() => void this.read(name), 50))
    })
  }

  private async read(file: string): Promise<void> {
    const path = join(this.dir, file)
    try {
      const { mtimeMs } = await stat(path)
      if (this.lastMtime.get(file) === mtimeMs) return
      this.lastMtime.set(file, mtimeMs)
      const payload = JSON.parse(await readFile(path, 'utf8')) as StatusPayload
      this.onUpdate(toUpdate(file.slice(0, -'.json'.length), payload, mtimeMs))
    } catch {
      // Arquivo removido ou no meio de uma troca: o próximo evento resolve.
    }
  }

  async forget(terminalId: string): Promise<void> {
    const file = `${terminalId}.json`
    this.lastMtime.delete(file)
    await rm(join(this.dir, file), { force: true })
  }

  stop(): void {
    this.watcher?.close()
    for (const timer of this.timers.values()) clearTimeout(timer)
  }
}
