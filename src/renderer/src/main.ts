import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import '../styles.css'

import type { HistoryItem } from '../../shared/ipc'
import { byId } from './dom'
import { mockHistory, mockTerminals, mockUsage, type MockTerminal } from './mock-data'
import { Sidebar } from './sidebar'
import { showEmpty, showTerminal } from './terminal-view'
import { renderSummary, renderUsage } from './usage-footer'

// Estado da fase 1: tudo em memória, com dados falsos.
const terminals: MockTerminal[] = [...mockTerminals]
const history: HistoryItem[] = [...mockHistory]
let selectedId: string | null = terminals[0]?.terminalId ?? null
let pendingCloseId: string | null = null

const sidebar = new Sidebar(
  {
    onSelect: select,
    onRequestClose: requestClose,
    // Fase 4: `claude --resume <id>` no cwd original.
    onResume: (item) => console.info('[fase 1] retomar sessão', item.sessionId)
  },
  render
)

function select(terminalId: string): void {
  selectedId = terminalId
  render()
}

function render(): void {
  sidebar.renderActive(terminals, selectedId)
  sidebar.renderHistory(history)
  renderSummary(terminals)
  const current = terminals.find((t) => t.terminalId === selectedId)
  if (current) showTerminal(current)
  else showEmpty()
}

// ---------- Fechar terminal (diálogo) ----------
const closeDialog = byId<HTMLDialogElement>('close-dialog')

function requestClose(terminalId: string): void {
  const t = terminals.find((x) => x.terminalId === terminalId)
  if (!t) return
  pendingCloseId = terminalId
  byId('close-dialog-message').textContent = `A sessão “${t.name}” será encerrada e movida para o histórico.`
  closeDialog.returnValue = ''
  closeDialog.showModal()
}

closeDialog.addEventListener('close', () => {
  const id = pendingCloseId
  pendingCloseId = null
  if (closeDialog.returnValue !== 'confirm' || !id) return

  const index = terminals.findIndex((t) => t.terminalId === id)
  if (index < 0) return
  const [closed] = terminals.splice(index, 1)
  if (closed) {
    history.unshift({ sessionId: closed.sessionId, title: closed.name, cwd: closed.cwd, lastActivity: Date.now(), inUse: false })
  }
  if (selectedId === id) selectedId = terminals[Math.min(index, terminals.length - 1)]?.terminalId ?? null
  render()
})

// Fase 3: escolher diretório e nome, depois spawn do `claude`.
byId('new-terminal').addEventListener('click', () => console.info('[fase 1] novo terminal'))

// ---------- Início ----------
renderUsage(mockUsage)
render()

window.conductor.getAppInfo().then((info) => {
  byId('app-info').textContent = info.claudeVersion ? `CLAUDE ${info.claudeVersion}` : 'CLAUDE NÃO ENCONTRADO'
  byId('app-info').title = `Conductor ${info.appVersion} · Electron ${info.electronVersion}`
})
