import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import '../styles.css'

import type { HistoryItem, TerminalSummary } from '../../shared/ipc'
import { byId } from './dom'
import { mockHistory, mockUsage } from './mock-data'
import { Sidebar } from './sidebar'
import { hideEmpty, showEmpty, showTerminalChrome, terminalHosts } from './terminal-view'
import { renderSummary, renderUsage } from './usage-footer'
import { loadTerminalFonts, XtermSession } from './xterm-session'

const api = window.conductor

interface Tab {
  summary: TerminalSummary
  session: XtermSession
}

// Terminais reais (fase 2). Histórico e uso continuam falsos até as fases 4 e 5.
const tabs: Tab[] = []
const history: HistoryItem[] = [...mockHistory]
let selectedId: string | null = null
let pendingCloseId: string | null = null
let homeDir = ''

/** Saída que chegou antes de o renderer saber o ID do terminal (corrida do create). */
const earlyOutput = new Map<string, string>()

const sidebar = new Sidebar(
  {
    onSelect: select,
    onRequestClose: requestClose,
    // Fase 4: `claude --resume <id>` no cwd original.
    onResume: (item) => console.info('[fase 2] retomar sessão', item.sessionId)
  },
  renderLists
)

function tildify(path: string): string {
  return homeDir && (path === homeDir || path.startsWith(`${homeDir}/`)) ? `~${path.slice(homeDir.length)}` : path
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

// ---------- Terminais ----------
api.terminal.onData(({ terminalId, data }) => {
  const tab = tabs.find((t) => t.summary.terminalId === terminalId)
  if (tab) tab.session.write(data)
  else earlyOutput.set(terminalId, (earlyOutput.get(terminalId) ?? '') + data)
})

api.terminal.onExit(({ terminalId, exitCode, signal }) => {
  earlyOutput.delete(terminalId)
  const index = tabs.findIndex((t) => t.summary.terminalId === terminalId)
  const tab = tabs[index]
  if (!tab) return
  tabs.splice(index, 1)
  tab.session.dispose()

  // Saída normal (/exit) ou fechada pelo app (SIGHUP): some sem alarde. Outra coisa: avisa.
  const failed = exitCode !== 0 && signal === undefined
  if (selectedId === terminalId) selectedId = tabs[Math.min(index, tabs.length - 1)]?.summary.terminalId ?? null
  render()
  if (failed && !selectedId) {
    showEmpty({ title: `“${tab.summary.name}” terminou com erro`, detail: `O claude saiu com código ${exitCode}.`, error: true })
  }
})

async function openTerminal(cwd?: string): Promise<void> {
  await loadTerminalFonts()
  hideEmpty()
  const session = new XtermSession(terminalHosts)
  for (const t of tabs) t.session.hide()

  const { cols, rows } = session.measure()
  const result = await api.terminal.create({ cols, rows, ...(cwd ? { cwd } : {}) })
  if (!result.ok) {
    session.dispose()
    render()
    if (!selectedId) showEmpty({ title: 'Não foi possível abrir o terminal', detail: result.error, error: true })
    return
  }

  const { terminalId } = result
  session.bind({
    write: (data) => api.terminal.write(terminalId, data),
    resize: (c, r) => api.terminal.resize(terminalId, c, r)
  })
  const early = earlyOutput.get(terminalId)
  if (early) session.write(early)
  earlyOutput.delete(terminalId)

  tabs.push({
    session,
    summary: {
      terminalId,
      sessionId: '', // fase 3: --session-id
      name: basename(result.cwd) || 'claude', // fase 3: nome escolhido
      cwd: tildify(result.cwd),
      status: 'idle', // fase 5: registro de sessões
      context: null,
      model: null,
      branch: null
    }
  })
  select(terminalId)
}

function select(terminalId: string): void {
  selectedId = terminalId
  render()
}

// ---------- Render ----------
function renderLists(): void {
  const summaries = tabs.map((t) => t.summary)
  sidebar.renderActive(summaries, selectedId)
  sidebar.renderHistory(history)
  renderSummary(summaries)
}

function render(): void {
  renderLists()
  const current = tabs.find((t) => t.summary.terminalId === selectedId)
  for (const t of tabs) if (t !== current) t.session.hide()
  if (current) {
    showTerminalChrome(current.summary)
    current.session.show()
  } else {
    showEmpty()
  }
}

// ---------- Fechar terminal (diálogo) ----------
const closeDialog = byId<HTMLDialogElement>('close-dialog')

function requestClose(terminalId: string): void {
  const tab = tabs.find((t) => t.summary.terminalId === terminalId)
  if (!tab) return
  pendingCloseId = terminalId
  byId('close-dialog-message').textContent = `A sessão “${tab.summary.name}” será encerrada e movida para o histórico.`
  closeDialog.returnValue = ''
  closeDialog.showModal()
}

closeDialog.addEventListener('close', () => {
  const id = pendingCloseId
  pendingCloseId = null
  // O terminal sai da lista quando o processo terminar (onExit).
  if (closeDialog.returnValue === 'confirm' && id) api.terminal.kill(id)
  else tabs.find((t) => t.summary.terminalId === selectedId)?.session.show()
})

// Fase 3: escolher diretório e nome antes de abrir.
byId('new-terminal').addEventListener('click', () => void openTerminal())

// ---------- Início ----------
renderUsage(mockUsage)
render()

void api.getAppInfo().then((info) => {
  homeDir = info.homeDir
  byId('app-info').textContent = info.claudeVersion ? `CLAUDE ${info.claudeVersion}` : 'CLAUDE NÃO ENCONTRADO'
  byId('app-info').title = `Conductor ${info.appVersion} · Electron ${info.electronVersion}`
  return openTerminal()
})
