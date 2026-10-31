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
import { openNewTerminalDialog, setupNewTerminalDialog } from './new-terminal-dialog'
import { rememberDir } from './recent-dirs'
import { installShortcuts } from './shortcuts'
import { Sidebar } from './sidebar'
import { hideEmpty, setEmptyAction, showEmpty, showTerminalChrome, terminalHosts } from './terminal-view'
import { showToast } from './toast'
import { renderSummary, renderUsage } from './usage-footer'
import { loadTerminalFonts, XtermSession } from './xterm-session'

const api = window.conductor

interface Tab {
  summary: TerminalSummary
  session: XtermSession
}

const tabs: Tab[] = []
let history: HistoryItem[] = []
let historyQuery = ''
let selectedId: string | null = null
let homeDir = ''

/** Terminais que o usuário mandou fechar: a saída deles não é erro (o claude sai com 129 no SIGHUP). */
const closing = new Set<string>()

/** Saída que chegou antes de o renderer saber o ID do terminal (corrida do create). */
const earlyOutput = new Map<string, string>()

const sidebar = new Sidebar(
  {
    onSelect: select,
    onRequestClose: (id) => void requestClose(id),
    onResume: (item) => void resume(item)
  },
  renderLists
)

sidebar.displayPath = (path) => tildify(path)

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

// Fase 5: status (registro), contexto/modelo/nome (status line) e branch (.jsonl).
api.onSessionUpdate((update) => {
  const tab = findTab(update.terminalId)
  if (!tab) return
  const { terminalId: _id, ...changes } = update
  Object.assign(tab.summary, changes)
  if (update.name !== undefined) api.setTerminalName(tab.summary.terminalId, update.name)
  if (update.cwd !== undefined) tab.summary.cwd = tildify(update.cwd)
  renderLists()
  if (tab.summary.terminalId === selectedId) showTerminalChrome(tab.summary)
})

api.usage.onUpdate((usage) => renderUsage(usage))

// D-017: clique na notificação "precisa de você".
api.onFocusTerminal((terminalId) => findTab(terminalId) && select(terminalId))

api.terminal.onExit(({ terminalId, exitCode, signal }) => {
  earlyOutput.delete(terminalId)
  const index = tabs.findIndex((t) => t.summary.terminalId === terminalId)
  const tab = tabs[index]
  if (!tab) return
  tabs.splice(index, 1)
  tab.session.dispose()

  // Saída normal (/exit) ou fechada pelo app: some sem alarde. Outra coisa: avisa.
  const requested = closing.delete(terminalId)
  const failed = !requested && exitCode !== 0 && signal === undefined
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
  api.setTerminalName(terminalId, result.name)
  tabs.push({
    session,
    summary: {
      terminalId,
      sessionId: result.sessionId,
      name: result.name,
      cwd: tildify(result.cwd),
      status: 'idle', // até o registro de sessões responder
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

// ---------- Histórico (fase 4) ----------
/** Retoma no cwd original da sessão (D-013). Sessões "em uso" nem chegam aqui (D-010). */
let resuming = false
async function resume(item: HistoryItem): Promise<void> {
  if (resuming) return
  resuming = true
  const error = await openTerminal({ cwd: item.cwd, name: item.title, resumeSessionId: item.sessionId })
  resuming = false
  if (error) showToast(`Não foi possível retomar “${item.title}”: ${error}`)
}

/** Busca sem diferenciar maiúsculas nem acentos. */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function filteredHistory(): HistoryItem[] {
  const query = fold(historyQuery.trim())
  if (!query) return history
  return history.filter((item) => fold(`${item.title} ${tildify(item.cwd)} ${item.branch ?? ''}`).includes(query))
}

api.history.onUpdate((items) => {
  history = items
  renderLists()
})

byId<HTMLInputElement>('history-search').addEventListener('input', (event) => {
  historyQuery = (event.target as HTMLInputElement).value
  renderLists()
})

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
  sidebar.renderHistory(filteredHistory(), history.length, historyQuery.trim() !== '')
  renderSummary(summaries)
}

function render(): void {
  renderLists()
  const current = findTab(selectedId)
  for (const t of tabs) if (t !== current) t.session.hide()
  document.title = current ? `${current.summary.name} — Conductor` : 'Conductor'
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
  if (confirmed) {
    closing.add(terminalId)
    api.terminal.kill(terminalId)
  } else {
    refocus()
  }
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
renderUsage(null)
render()
void api.usage.get().then((usage) => usage && renderUsage(usage))

void api.getAppInfo().then(async (info) => {
  homeDir = info.homeDir
  byId('app-info').textContent = info.claudeVersion ? `CLAUDE ${info.claudeVersion}` : 'CLAUDE NÃO ENCONTRADO'
  byId('app-info').title = `Conductor ${info.appVersion} · Electron ${info.electronVersion}`
  history = await api.history.get()
  render()
})
