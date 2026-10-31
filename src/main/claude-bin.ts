import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Caminho do binário `claude`. Procura no PATH e depois nos locais de instalação
 * padrão. Aberto pelo menu do sistema (.desktop), o app costuma herdar um PATH
 * sem `~/.local/bin`, por isso os fallbacks.
 */
export function resolveClaudeBinary(): string | null {
  const fromPath = (process.env['PATH'] ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, 'claude'))
  const fallbacks = [join(homedir(), '.local/bin/claude'), join(homedir(), '.claude/local/claude')]
  return [...fromPath, ...fallbacks].find(isExecutable) ?? null
}

/**
 * Variáveis que não devem vazar para o `claude` filho:
 * - as do Electron/Vite e do próprio app;
 * - as que uma sessão do Claude Code define para os processos dela. Se o app for
 *   aberto de dentro de uma sessão, o `claude` filho se acharia uma subsessão dela.
 */
const BLOCKED_PREFIXES = ['ELECTRON_', 'VITE_', 'CONDUCTOR_']
const BLOCKED_KEYS = new Set([
  'CLAUDECODE',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN'
])

export function childEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (BLOCKED_KEYS.has(key) || BLOCKED_PREFIXES.some((p) => key.startsWith(p))) continue
    env[key] = value
  }
  env['TERM'] = 'xterm-256color'
  env['COLORTERM'] = 'truecolor'
  return env
}
