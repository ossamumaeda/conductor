import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { NAME_MAX_LENGTH } from '../shared/ipc'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** Aceita caminho absoluto ou começando com ~. Retorna null se não for um diretório existente. */
export function resolveDirectory(input: string | undefined): string | null {
  const raw = (input ?? '').trim()
  if (!raw) return homedir()
  const expanded = raw === '~' ? homedir() : raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw
  if (!isAbsolute(expanded)) return null
  const dir = resolve(expanded)
  try {
    return existsSync(dir) && statSync(dir).isDirectory() ? dir : null
  } catch {
    return null
  }
}

/** Nome exibido: sem caracteres de controle, espaços normalizados, até NAME_MAX_LENGTH. Vazio → nome da pasta. */
export function sanitizeName(input: string | undefined, cwd: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = (input ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  return (clean || basename(cwd) || 'claude').slice(0, NAME_MAX_LENGTH)
}

/**
 * Argumentos do `claude` (D-009, D-013). Sempre um array: nada passa por shell,
 * então nomes e caminhos não precisam de escape.
 */
export function buildClaudeArgs(options: {
  sessionId: string
  resume: boolean
  name: string
  extra: string[]
}): string[] {
  const args = options.resume
    ? ['--resume', options.sessionId]
    : ['--session-id', options.sessionId, '--name', options.name]
  return [...args, ...options.extra]
}
