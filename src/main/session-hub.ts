import type { HistoryItem } from '../shared/ipc'
import { HistoryIndex, watchProjects, type SessionRecord } from './claude-data/history'
import { watchRegistry, type RegistryEntry } from './claude-data/registry'
import type { PtyManager } from './pty-manager'

const HISTORY_LIMIT = 500

export interface HubEvents {
  history(items: HistoryItem[]): void
}

/**
 * Junta as fontes de dados do Claude (histórico e registro de sessões) com os terminais
 * abertos no app, e avisa o renderer quando algo muda.
 */
export class SessionHub {
  private readonly index = new HistoryIndex()
  private records: SessionRecord[] = []
  private registry: RegistryEntry[] = []
  private scanning: Promise<void> | null = null
  private rescanQueued = false
  private readonly stops: Array<() => void> = []

  constructor(private readonly ptys: PtyManager, private readonly events: HubEvents) {}

  start(): void {
    this.stops.push(
      watchRegistry((entries) => {
        this.registry = entries
        this.publishHistory()
      }),
      watchProjects(() => void this.refreshHistory())
    )
    void this.refreshHistory()
  }

  stop(): void {
    for (const stop of this.stops.splice(0)) stop()
  }

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
        // Fora de um repositório git o Claude grava "HEAD".
        branch: r.branch && r.branch !== 'HEAD' ? r.branch : null,
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
}
