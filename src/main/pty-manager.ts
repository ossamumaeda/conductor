import { randomUUID } from 'node:crypto'
import { spawn, type IPty } from 'node-pty'
import type { TerminalDataEvent, TerminalExitEvent } from '../shared/ipc'
import { childEnv } from './claude-bin'

export interface PtyEvents {
  data(event: TerminalDataEvent): void
  exit(event: TerminalExitEvent): void
}

interface Entry {
  proc: IPty
  sessionId: string
  /** Saída acumulada até o próximo flush (ver `queue`). */
  pending: string
  flushScheduled: boolean
}

/**
 * Dono dos pseudo-terminais. Cada terminal roda o binário `claude` com os
 * argumentos recebidos. A saída é agrupada por tick do event loop antes de ir
 * para o renderer, para não mandar uma mensagem IPC por pedaço pequeno.
 */
export class PtyManager {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly events: PtyEvents) {}

  create(options: { sessionId: string; file: string; args: string[]; cwd: string; cols: number; rows: number }): string {
    const terminalId = randomUUID()
    const proc = spawn(options.file, options.args, {
      name: 'xterm-256color',
      cwd: options.cwd,
      cols: Math.max(2, options.cols),
      rows: Math.max(2, options.rows),
      env: childEnv()
    })
    const entry: Entry = { proc, sessionId: options.sessionId, pending: '', flushScheduled: false }
    this.entries.set(terminalId, entry)

    proc.onData((data) => this.queue(terminalId, entry, data))
    proc.onExit(({ exitCode, signal }) => {
      this.flush(terminalId, entry)
      this.entries.delete(terminalId)
      this.events.exit({ terminalId, exitCode, ...(signal ? { signal } : {}) })
    })
    return terminalId
  }

  private queue(terminalId: string, entry: Entry, data: string): void {
    entry.pending += data
    if (entry.flushScheduled) return
    entry.flushScheduled = true
    setImmediate(() => this.flush(terminalId, entry))
  }

  private flush(terminalId: string, entry: Entry): void {
    entry.flushScheduled = false
    if (!entry.pending) return
    const data = entry.pending
    entry.pending = ''
    this.events.data({ terminalId, data })
  }

  write(terminalId: string, data: string): void {
    this.entries.get(terminalId)?.proc.write(data)
  }

  resize(terminalId: string, cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) return
    try {
      this.entries.get(terminalId)?.proc.resize(cols, rows)
    } catch {
      // O processo pode ter saído entre o evento de resize e esta chamada.
    }
  }

  /** SIGHUP, como um emulador de terminal faz ao fechar a aba. A sessão já está salva no .jsonl. */
  kill(terminalId: string): void {
    this.entries.get(terminalId)?.proc.kill('SIGHUP')
  }

  killAll(): void {
    for (const id of this.entries.keys()) this.kill(id)
  }

  hasSession(sessionId: string): boolean {
    for (const entry of this.entries.values()) if (entry.sessionId === sessionId) return true
    return false
  }

  /** terminalId → sessionId dos terminais abertos. */
  sessions(): Array<{ terminalId: string; sessionId: string }> {
    return [...this.entries].map(([terminalId, e]) => ({ terminalId, sessionId: e.sessionId }))
  }

  get size(): number {
    return this.entries.size
  }
}
