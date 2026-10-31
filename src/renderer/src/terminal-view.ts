// Painel direito. Na fase 2, o conteúdo falso dá lugar ao xterm.js com a TUI real (D-003).

import { byId, el } from './dom'
import { formatTokens, STATUS_LABEL, statusClass } from './format'
import type { FakeLine, MockTerminal } from './mock-data'
import { contextPercent } from './sidebar'

const title = byId('terminal-title')
const live = byId('terminal-live')
const path = byId('terminal-path')
const content = byId('terminal-content')
const sessionState = byId('session-state')
const tokenStatus = byId('token-status')

export function showTerminal(t: MockTerminal): void {
  title.textContent = t.name
  path.textContent = t.cwd
  live.hidden = false
  live.className = `live ${statusClass(t.status)}`
  live.replaceChildren(el('i', { class: `status-dot ${statusClass(t.status)}` }), STATUS_LABEL[t.status])
  sessionState.textContent = 'sessão em execução'

  const ctx = t.context
    ? `contexto ${contextPercent(t)}% (${formatTokens(t.context.usedTokens)} / ${formatTokens(t.context.windowSize)})`
    : 'contexto —'
  tokenStatus.replaceChildren(
    ...[ctx, t.model, t.branch].filter((part): part is string => Boolean(part))
      .flatMap((part, i) => (i === 0 ? [part] : [el('span', { class: 'sep' }, ' · '), part]))
  )

  content.replaceChildren(
    el('p', { class: 'welcome' }, `Conectado a ${t.cwd}`,
      t.branch && el('span', { class: 'tone-muted' }, ' · branch '),
      t.branch && el('span', { class: 'tone-success' }, t.branch)),
    ...t.lines.map(renderLine)
  )
}

function renderLine(line: FakeLine): HTMLElement {
  switch (line.kind) {
    case 'prompt':
      return el('div', { class: 'cursorline' },
        el('span', { class: 'prompt' }, line.text),
        line.text === '❯' && el('i', { class: 'cursor' }))
    case 'command':
      return el('div', { class: 'command' }, line.text)
    case 'output': {
      const parts = line.parts.map(([tone, text]) => (tone ? el('span', { class: `tone-${tone}` }, text) : text))
      const empty = line.parts.every(([, text]) => text === '')
      return el('div', { class: 'output' }, ...(empty ? [' '] : parts))
    }
  }
}

export function showEmpty(): void {
  title.textContent = 'Nenhum terminal ativo'
  path.textContent = ''
  live.hidden = true
  sessionState.textContent = 'nenhuma sessão'
  tokenStatus.textContent = ''
  content.replaceChildren(
    el('div', { class: 'empty-terminal' },
      el('strong', {}, 'Nenhum terminal ativo'),
      el('p', {}, 'Abra um novo terminal com + (Ctrl+Shift+T) ou retome uma sessão do histórico.'))
  )
}
