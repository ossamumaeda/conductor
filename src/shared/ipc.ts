// Contrato entre main, preload e renderer (ver docs/arquitetura.md).
// Os tipos de histórico e uso descrevem dados das fases 4 e 5.

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
  terminalExit: 'terminal:exit',
  /** invoke: seletor nativo de diretório. */
  dialogPickDirectory: 'dialog:pick-directory',
  /** main → renderer: o usuário tentou fechar a janela com terminais abertos (D-011). */
  appCloseRequested: 'app:close-requested',
  /** send: renderer confirma o fechamento. */
  appConfirmClose: 'app:confirm-close',
  /** invoke: lista atual do histórico. */
  historyGet: 'history:get',
  /** main → renderer: histórico mudou (lista completa). */
  historyUpdate: 'history:update'
} as const

export interface TerminalCreateRequest {
  /** Diretório inicial (absoluto ou com ~). Omitido: diretório pessoal. */
  cwd?: string
  /** Nome exibido (`--name`). Omitido: nome da pasta. */
  name?: string
  /** Retomar esta sessão (`--resume`) em vez de criar uma nova (D-013). */
  resumeSessionId?: string
  cols: number
  rows: number
}

export type TerminalCreateResult =
  | { ok: true; terminalId: string; sessionId: string; cwd: string; name: string }
  | { ok: false; error: string }

export const NAME_MAX_LENGTH = 60

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
  /** Absoluto. A interface encurta com ~ na exibição. */
  cwd: string
  branch: string | null
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
  history: {
    get(): Promise<HistoryItem[]>
    onUpdate(listener: (items: HistoryItem[]) => void): () => void
  }
  pickDirectory(defaultPath?: string): Promise<string | null>
  onCloseRequested(listener: () => void): () => void
  confirmClose(): void
}
