// Contrato entre main, preload e renderer (ver docs/arquitetura.md).
// Fase 1 implementa só `app:info`. Os demais tipos já descrevem os dados
// das próximas fases, para que a interface seja construída sobre eles.

export const IPC = {
  appInfo: 'app:info'
} as const

/** Status do registro `~/.claude/sessions/<pid>.json` (D-012). */
export type SessionStatus = 'busy' | 'idle' | 'waiting'

export interface AppInfo {
  appVersion: string
  electronVersion: string
  /** `null` quando o binário `claude` não foi encontrado no PATH. */
  claudeVersion: string | null
}

export interface ContextUsage {
  usedTokens: number
  /** Varia por modelo (ex.: 200 000 ou 1 000 000). Nunca fixar. */
  windowSize: number
}

export interface TerminalSummary {
  terminalId: string
  sessionId: string
  name: string
  cwd: string
  status: SessionStatus
  context: ContextUsage | null
  /** Ex.: "Opus 5.5" (campo `model.display_name` da status line). */
  model: string | null
  branch: string | null
}

export interface HistoryItem {
  sessionId: string
  title: string
  cwd: string
  /** Epoch em ms. */
  lastActivity: number
  /** Aberta em outro processo `claude` fora do app: não pode ser retomada (D-010). */
  inUse: boolean
}

export interface RateLimit {
  usedPercentage: number
  /** Epoch em ms. */
  resetsAt: number
}

export interface UsageSnapshot {
  fiveHour: RateLimit | null
  sevenDay: RateLimit | null
  /** Epoch em ms do payload mais recente. */
  readAt: number
}

/** API exposta pelo preload em `window.conductor`. */
export interface ConductorApi {
  getAppInfo(): Promise<AppInfo>
}
