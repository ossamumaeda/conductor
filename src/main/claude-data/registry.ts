import { watch, type FSWatcher } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SESSIONS_DIR } from './paths'
import type { RegistryFile } from './types'

export interface RegistryEntry {
  pid: number
  sessionId: string
  cwd: string | null
  name: string | null
  status: string | null
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: o processo existe, só não é nosso.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Sessões `claude` em execução, segundo o registro. Arquivos de processos mortos (crash) são ignorados. */
export async function readRegistry(): Promise<RegistryEntry[]> {
  let files: string[]
  try {
    files = (await readdir(SESSIONS_DIR)).filter((f) => /^\d+\.json$/.test(f))
  } catch {
    return []
  }
  const entries = await Promise.all(
    files.map(async (file): Promise<RegistryEntry | null> => {
      try {
        const data = JSON.parse(await readFile(join(SESSIONS_DIR, file), 'utf8')) as RegistryFile
        if (typeof data.pid !== 'number' || typeof data.sessionId !== 'string' || !isAlive(data.pid)) return null
        return {
          pid: data.pid,
          sessionId: data.sessionId,
          cwd: typeof data.cwd === 'string' ? data.cwd : null,
          name: typeof data.name === 'string' ? data.name : null,
          status: typeof data.status === 'string' ? data.status : null
        }
      } catch {
        return null // arquivo sendo reescrito; a próxima leitura pega
      }
    })
  )
  return entries.filter((e): e is RegistryEntry => e !== null)
}

/**
 * Observa o registro e chama `onChange` com a lista atual. fs.watch (inotify) com debounce,
 * mais uma leitura periódica de segurança para processos que morreram sem limpar o arquivo.
 */
export function watchRegistry(onChange: (entries: RegistryEntry[]) => void, intervalMs = 5000): () => void {
  let timer: NodeJS.Timeout | undefined
  let watcher: FSWatcher | undefined
  let last = ''
  const refresh = async (): Promise<void> => {
    const entries = await readRegistry()
    const key = JSON.stringify(entries)
    if (key === last) return
    last = key
    onChange(entries)
  }
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => void refresh(), 80)
  }
  try {
    watcher = watch(SESSIONS_DIR, schedule)
  } catch {
    // Pasta ainda não existe: o intervalo cobre.
  }
  const interval = setInterval(() => void refresh(), intervalMs)
  void refresh()
  return () => {
    clearTimeout(timer)
    clearInterval(interval)
    watcher?.close()
  }
}
