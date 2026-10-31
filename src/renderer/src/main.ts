import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import '../styles.css'

import type { HistoryItem, TerminalCreateRequest, TerminalSummary } from '../../shared/ipc'
import { confirmDialog } from './dialogs'
import { byId } from './dom'
import { mockHistory, mockUsage } from './mock-data'
import { openNewTerminalDialog, setupNewTerminalDialog } from './new-terminal-dialog'
import { rememberDir } from './recent-dirs'
import { installShortcuts } from './shortcuts'
import { Sidebar } from './sidebar'
import { hideEmpty, setEmptyAction, showEmpty, showTerminalChrome, terminalHosts } from './terminal-view'
import { renderSummary, renderUsage } from './usage-footer'
import { loadTerminalFonts, XtermSession } from './xterm-session'

const api = window.conductor

interface Tab {
  summary: TerminalSummary
  session: XtermSession
}

// Histórico e uso continuam falsos até as fases 4 e 5.
const tabs: Tab[] = []
const history: HistoryItem[] = [...mockHistory]
let selectedId: string | null = null
let homeDir = ''

/** Saída que chegou antes de o renderer saber o ID do terminal (corrida do create). */
const earlyOutput = new Map<string, string>()

const sidebar = new Sidebar(
  {
    onSelect: select,
    onRequestClose: (id) => void requestClose(id),
    // Fase 4: `claude --resume <id>` no cwd original.
    onResume: (item) => console.info('[fase 3] retomar sessão', item.sessionId)
  },
  renderLists
)

function tildify(path: string): string {
  return homeDir && (path === homeDir || path.startsWith(`${homeDir}/`)) ? `~${path.slice(homeDir.length)}` : path
}

const findTab = (terminalId: string | null): Tab | undefined => tabs.find((t) => t.summary.terminalId === terminalId)

// ---------- Terminais ----------
api.terminal.onData(({ terminalId, data }) => {
  const tab = findTab(terminalId)
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

/** Abre um terminal. Retorna a mensagem de erro, ou null em caso de sucesso. */
async function openTerminal(request: Omit<TerminalCreateRequest, 'cols' | 'rows'>): Promise<string | null> {
  await loadTerminalFonts()
  hideEmpty()
  const session = new XtermSession(terminalHosts)
  const { cols, rows } = session.measure()
  const result = await api.terminal.create({ ...request, cols, rows })
  if (!result.ok) {
    session.dispose()
    render()
    return result.error
  }

  const { terminalId } = result
  session.bind({
    write: (data) => api.terminal.write(terminalId, data),
    resize: (c, r) => api.terminal.resize(terminalId, c, r)
  })
  const early = earlyOutput.get(terminalId)
  if (early) session.write(early)
  earlyOutput.delete(terminalId)

  rememberDir(result.cwd)
  tabs.push({
    session,
    summary: {
      terminalId,
      sessionId: result.sessionId,
      name: result.name,
      cwd: tildify(result.cwd),
      status: 'idle', // fase 5: registro de sessões
      context: null,
      model: null,
      branch: null
    }
  })
  select(terminalId)
  return null
}

function select(terminalId: string): void {
  selectedId = terminalId
  render()
}

/** Ctrl+Tab / Ctrl+Shift+Tab: segue a ordem exibida na sidebar. */
function cycle(step: 1 | -1): void {
  const order = sidebar.order
  if (order.length < 2) return
  const current = selectedId ? order.indexOf(selectedId) : -1
  const next = order[(current + step + order.length) % order.length]
  if (next) select(next)
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
  const current = findTab(selectedId)
  for (const t of tabs) if (t !== current) t.session.hide()
  if (current) {
    showTerminalChrome(current.summary)
    current.session.show()
  } else {
    showEmpty()
  }
}

/** Devolve o foco ao terminal atual depois de um diálogo. */
function refocus(): void {
  findTab(selectedId)?.session.show()
}

// ---------- Fechar ----------
async function requestClose(terminalId: string): Promise<void> {
  const tab = findTab(terminalId)
  if (!tab) return
  const confirmed = await confirmDialog({
    title: 'Fechar terminal?',
    message: `A sessão “${tab.summary.name}” será encerrada e movida para o histórico.`,
    confirmLabel: 'Fechar terminal'
  })
  // O terminal sai da lista quando o processo terminar (onExit).
  if (confirmed) api.terminal.kill(terminalId)
  else refocus()
}

// D-011: fechar a janela encerra tudo. Só pergunta se algum terminal estiver trabalhando.
api.onCloseRequested(async () => {
  const working = tabs.filter((t) => t.summary.status !== 'idle')
  if (working.length === 0) return api.confirmClose()
  const names = working.map((t) => `“${t.summary.name}”`).join(', ')
  const confirmed = await confirmDialog({
    title: 'Fechar o Conductor?',
    message: `${working.length === 1 ? 'Um terminal ainda está' : `${working.length} terminais ainda estão`} trabalhando: ${names}. Todos os terminais serão encerrados; as conversas ficam no histórico.`,
    confirmLabel: 'Fechar tudo'
  })
  if (confirmed) api.confirmClose()
  else refocus()
})

// ---------- Novo terminal ----------
setupNewTerminalDialog({
  tildify,
  pickDirectory: (current) => api.pickDirectory(current || undefined),
  open: (request) => openTerminal(request)
})
byId<HTMLDialogElement>('new-dialog').addEventListener('close', refocus)
byId('new-terminal').addEventListener('click', openNewTerminalDialog)
setEmptyAction(openNewTerminalDialog)

installShortcuts({
  next: () => cycle(1),
  previous: () => cycle(-1),
  newTerminal: openNewTerminalDialog,
  closeCurrent: () => selectedId && void requestClose(selectedId)
})

// ---------- Início (D-011: começa sem terminais) ----------
renderUsage(mockUsage)
render()

void api.getAppInfo().then((info) => {
  homeDir = info.homeDir
  byId('app-info').textContent = info.claudeVersion ? `CLAUDE ${info.claudeVersion}` : 'CLAUDE NÃO ENCONTRADO'
  byId('app-info').title = `Conductor ${info.appVersion} · Electron ${info.electronVersion}`
  render()
})
