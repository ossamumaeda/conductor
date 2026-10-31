// Contrato entre main, preload e renderer (ver docs/arquitetura.md).
// Implementado até a fase 2: `app:info` e os canais `terminal:*`.
// Os demais tipos já descrevem os dados das próximas fases.

export const IPC = {
  appInfo: 'app:info',
  /** invoke: renderer → main. */
  terminalCreate: 'terminal:create',
  /** send (sem resposta, caminho quente): renderer → main. */
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalKill: 'terminal:kill',
  /** eventos: main → renderer. */
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit'
} as const

export interface TerminalCreateRequest {
  /** Diretório inicial. Omitido: diretório padrão do app (fase 2). */
  cwd?: string
  cols: number
  rows: number
}

export type TerminalCreateResult =
  | { ok: true; terminalId: string; cwd: string }
  | { ok: false; error: string }

export interface TerminalDataEvent {
  terminalId: string
  data: string
}

export interface TerminalExitEvent {
  terminalId: string
  exitCode: number
  signal?: number
}

/** Status do registro `~/.claude/sessions/<pid>.json` (D-012). */
export type SessionStatus = 'busy' | 'idle' | 'waiting'

export interface AppInfo {
  appVersion: string
  electronVersion: string
  /** `null` quando o binário `claude` não foi encontrado no PATH. */
  claudeVersion: string | null
  homeDir: string
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
  terminal: {
    create(request: TerminalCreateRequest): Promise<TerminalCreateResult>
    write(terminalId: string, data: string): void
    resize(terminalId: string, cols: number, rows: number): void
    kill(terminalId: string): void
    /** Retorna a função para cancelar a inscrição. */
    onData(listener: (event: TerminalDataEvent) => void): () => void
    onExit(listener: (event: TerminalExitEvent) => void): () => void
  }
}
