// Cabeçalho, barras e estado vazio do painel direito. O terminal em si é um XtermSession.

import type { TerminalSummary } from '../../shared/ipc'
import { byId, el } from './dom'
import { formatTokens, STATUS_LABEL, statusClass } from './format'
import { contextPercent } from './sidebar'

const title = byId('terminal-title')
const live = byId('terminal-live')
const path = byId('terminal-path')
const empty = byId('terminal-empty')
const sessionState = byId('session-state')
const tokenStatus = byId('token-status')

export const terminalHosts = byId('terminal-hosts')

let emptyAction: (() => void) | null = null

/** Ação do botão "Novo terminal" do estado vazio. */
export function setEmptyAction(action: () => void): void {
  emptyAction = action
}

export function showTerminalChrome(t: TerminalSummary): void {
  empty.hidden = true
  title.textContent = t.name
  path.textContent = t.cwd
  live.hidden = false
  live.className = `live ${statusClass(t.status)}`
  live.replaceChildren(el('i', { class: `status-dot ${statusClass(t.status)}` }), STATUS_LABEL[t.status])
  sessionState.textContent = 'sessão em execução'

  const ctx = t.context
    ? `contexto ${contextPercent(t)}% (${formatTokens(t.context.usedTokens)} / ${formatTokens(t.context.windowSize)})`
    : null
  tokenStatus.replaceChildren(
    ...[ctx, t.model, t.branch].filter((part): part is string => Boolean(part))
      .flatMap((part, i) => (i === 0 ? [part] : [el('span', { class: 'sep' }, ' · '), part]))
  )
}

/** O estado vazio esconde a área dos terminais (CSS); precisa sair antes de medir um xterm novo. */
export function hideEmpty(): void {
  empty.hidden = true
}

export function showEmpty(message?: { title: string; detail: string; error?: boolean }): void {
  title.textContent = 'Nenhum terminal ativo'
  path.textContent = ''
  live.hidden = true
  sessionState.textContent = 'nenhuma sessão'
  tokenStatus.textContent = ''
  empty.hidden = false
  empty.className = `empty-terminal ${message?.error ? 'error' : ''}`
  empty.replaceChildren(
    el('strong', {}, message?.title ?? 'Nenhum terminal ativo'),
    el('p', {}, message?.detail ?? 'Abra um novo terminal ou retome uma sessão do histórico.'),
    newButton()
  )
}

function newButton(): HTMLButtonElement {
  const button = el('button', { class: 'dialog-button primary', type: 'button' }, 'Novo terminal  ·  Ctrl+Shift+T')
  button.addEventListener('click', () => emptyAction?.())
  return button
}
