import { Notification, type BrowserWindow } from 'electron'
import type { SessionUpdate } from '../shared/ipc'

/**
 * D-017: quando um terminal passa a "precisa de você" (status `waiting`) com a janela fora
 * de foco, mostra uma notificação do sistema e pisca a janela na barra de tarefas.
 * Clicar na notificação traz a janela e seleciona o terminal.
 */
export class AttentionNotifier {
  private readonly names = new Map<string, string>()
  private readonly waiting = new Set<string>()

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly focusTerminal: (terminalId: string) => void
  ) {}

  setName(terminalId: string, name: string): void {
    this.names.set(terminalId, name)
  }

  forget(terminalId: string): void {
    this.names.delete(terminalId)
    this.waiting.delete(terminalId)
  }

  onSessionUpdate(update: SessionUpdate): void {
    if (update.status === undefined) return
    const wasWaiting = this.waiting.has(update.terminalId)
    if (update.status !== 'waiting') {
      this.waiting.delete(update.terminalId)
      if (this.waiting.size === 0) this.getWindow()?.flashFrame(false)
      return
    }
    this.waiting.add(update.terminalId)
    const win = this.getWindow()
    if (wasWaiting || !win || win.isFocused()) return

    win.flashFrame(true)
    if (!Notification.isSupported()) return
    const name = this.names.get(update.terminalId) ?? 'Um terminal'
    const notification = new Notification({
      title: `${name} precisa de você`,
      body: 'O Claude está esperando uma resposta (ex.: permissão para uma ferramenta).',
      silent: false
    })
    notification.on('click', () => {
      const current = this.getWindow()
      if (!current) return
      if (current.isMinimized()) current.restore()
      current.show()
      current.focus()
      this.focusTerminal(update.terminalId)
    })
    notification.show()
  }
}
