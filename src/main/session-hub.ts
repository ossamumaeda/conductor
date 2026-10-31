import { readFile, writeFile } from 'node:fs/promises'
import type { HistoryItem, SessionStatus, SessionUpdate, UsageSnapshot } from '../shared/ipc'
import { HistoryIndex, watchProjects, type SessionRecord } from './claude-data/history'
import { watchRegistry, type RegistryEntry } from './claude-data/registry'
import type { PtyManager } from './pty-manager'
import type { StatusUpdate } from './statusline'

const HISTORY_LIMIT = 500

export interface HubEvents {
  history(items: HistoryItem[]): void
  session(update: SessionUpdate): void
  usage(usage: UsageSnapshot): void
}

/** Status do registro → status da interface. Desconhecidos (ex.: `requires_action`) contam como aguardando (D-012). */
function toStatus(raw: string | null): SessionStatus {
  return raw === 'busy' || raw === 'waiting' ? raw : 'idle'
}

const cleanBranch = (branch: string | null | undefined): string | null =>
  branch && branch !== 'HEAD' ? branch : null // fora de um repositório git o Claude grava "HEAD"

/**
 * Junta as fontes de dados do Claude (histórico, registro de sessões, status line) com os
 * terminais abertos no app, e avisa o renderer quando algo muda.
 */
export class SessionHub {
  private readonly index = new HistoryIndex()
  private records: SessionRecord[] = []
  private registry: RegistryEntry[] = []
  private scanning: Promise<void> | null = null
  private rescanQueued = false
  private readonly stops: Array<() => void> = []
  /** Último status/branch enviado por terminal, para só publicar mudanças. */
  private readonly sent = new Map<string, { status?: SessionStatus; branch?: string | null }>()
  private usage: UsageSnapshot | null = null

  constructor(
    private readonly ptys: PtyManager,
    private readonly events: HubEvents,
    private readonly usageFile: string
  ) {}

  async start(): Promise<void> {
    this.usage = await this.loadUsage()
    if (this.usage) this.events.usage(this.usage)
    this.stops.push(
      watchRegistry((entries) => {
        this.registry = entries
        this.publishHistory()
        this.publishTerminalState()
      }),
      watchProjects(() => void this.refreshHistory())
    )
    void this.refreshHistory()
  }

  stop(): void {
    for (const stop of this.stops.splice(0)) stop()
  }

  // ---------- Histórico (fase 4) ----------

  /** Revarre o histórico. Chamadas durante uma varredura agendam só mais uma. */
  refreshHistory(): Promise<void> {
    if (this.scanning) {
      this.rescanQueued = true
      return this.scanning
    }
    this.scanning = (async () => {
      do {
        this.rescanQueued = false
        this.records = await this.index.scan()
      } while (this.rescanQueued)
      this.scanning = null
      this.publishHistory()
      this.publishTerminalState()
    })()
    return this.scanning
  }

  /** Sessões abertas no app ficam fora do histórico (estão em "Terminais ativos"). */
  history(): HistoryItem[] {
    const runningElsewhere = new Set(this.registry.map((e) => e.sessionId))
    return this.records
      .filter((r) => !this.ptys.hasSession(r.sessionId))
      .slice(0, HISTORY_LIMIT)
      .map((r) => ({
        sessionId: r.sessionId,
        title: r.title,
        cwd: r.cwd,
        branch: cleanBranch(r.branch),
        lastActivity: r.lastActivity,
        inUse: runningElsewhere.has(r.sessionId) // D-010
      }))
  }

  /** Sessão aberta por um `claude` fora do app (D-010). */
  isRunningElsewhere(sessionId: string): boolean {
    return !this.ptys.hasSession(sessionId) && this.registry.some((e) => e.sessionId === sessionId)
  }

  publishHistory(): void {
    this.events.history(this.history())
  }

  // ---------- Terminais do app (fase 5) ----------

  /** Status (registro) e branch (.jsonl) de cada terminal do app; só envia o que mudou. */
  private publishTerminalState(): void {
    for (const { terminalId, sessionId } of this.ptys.sessions()) {
      const entry = this.registry.find((e) => e.sessionId === sessionId)
      const record = this.records.find((r) => r.sessionId === sessionId)
      const status = entry ? toStatus(entry.status) : undefined
      const branch = record ? cleanBranch(record.branch) : undefined
      const last = this.sent.get(terminalId) ?? {}
      const update: SessionUpdate = { terminalId }
      if (status !== undefined && status !== last.status) update.status = last.status = status
      if (branch !== undefined && branch !== last.branch) update.branch = last.branch = branch
      this.sent.set(terminalId, last)
      if (update.status !== undefined || update.branch !== undefined) this.events.session(update)
    }
  }

  forgetTerminal(terminalId: string): void {
    this.sent.delete(terminalId)
  }

  /** Payload novo da status line de um terminal (D-005). */
  onStatusLine(update: StatusUpdate): void {
    if (update.sessionId && this.ptys.setSession(update.terminalId, update.sessionId)) {
      // /clear: a sessão antiga vai para o histórico e a nova sai dele.
      this.publishHistory()
    }
    this.events.session({
      terminalId: update.terminalId,
      ...(update.sessionId ? { sessionId: update.sessionId } : {}),
      ...(update.name ? { name: update.name } : {}),
      context: update.context,
      model: update.model
    })

    // Os limites são da conta: vale o payload mais recente de qualquer terminal.
    if ((update.fiveHour || update.sevenDay) && (!this.usage || update.at >= this.usage.readAt)) {
      this.usage = {
        fiveHour: update.fiveHour ?? this.usage?.fiveHour ?? null,
        sevenDay: update.sevenDay ?? this.usage?.sevenDay ?? null,
        readAt: update.at
      }
      this.events.usage(this.usage)
      void this.saveUsage(this.usage)
    }
  }

  usageSnapshot(): UsageSnapshot | null {
    return this.usage
  }

  // ---------- Último uso conhecido (sobrevive a reinícios) ----------

  private async loadUsage(): Promise<UsageSnapshot | null> {
    try {
      const data = JSON.parse(await readFile(this.usageFile, 'utf8')) as UsageSnapshot
      return typeof data.readAt === 'number' ? data : null
    } catch {
      return null
    }
  }

  private async saveUsage(usage: UsageSnapshot): Promise<void> {
    try {
      await writeFile(this.usageFile, JSON.stringify(usage))
    } catch {
      // Sem persistência: o próximo payload repõe.
    }
  }
}
