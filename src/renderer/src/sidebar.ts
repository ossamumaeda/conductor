import type { HistoryItem, TerminalSummary } from '../../shared/ipc'
import { byId, el } from './dom'
import { formatActivity, formatTokens, pad2, STATUS_LABEL, statusClass } from './format'

export interface SidebarHandlers {
  onSelect(terminalId: string): void
  onRequestClose(terminalId: string): void
  onResume(item: HistoryItem): void
}

/** Percentual de contexto usado, 0 quando ainda não há dado. */
export function contextPercent(t: TerminalSummary): number {
  if (!t.context || t.context.windowSize <= 0) return 0
  return Math.round((t.context.usedTokens / t.context.windowSize) * 100)
}

const WARN_AT = 85

export class Sidebar {
  private descending = true
  /** IDs na ordem exibida, usada pelo Ctrl+Tab. */
  order: string[] = []
  /** Encurta caminhos absolutos com ~ na exibição. */
  displayPath: (path: string) => string = (p) => p
  private readonly activeRows = byId<HTMLTableSectionElement>('active-rows')
  private readonly historyRows = byId<HTMLTableSectionElement>('history-rows')
  private readonly sortButton = byId<HTMLButtonElement>('sort-button')

  constructor(private readonly handlers: SidebarHandlers, private readonly onSortChange: () => void) {
    this.sortButton.addEventListener('click', () => {
      this.descending = !this.descending
      this.sortButton.textContent = this.descending ? 'USO ↓' : 'USO ↑'
      this.onSortChange()
    })
    document.addEventListener('click', (event) => {
      if (!(event.target as Element).closest('.terminal-row-actions')) this.closeMenus()
    })
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeMenus()
    })
  }

  renderActive(terminals: TerminalSummary[], selectedId: string | null): void {
    byId('active-count').textContent = pad2(terminals.length)
    const ordered = [...terminals].sort((a, b) =>
      this.descending ? contextPercent(b) - contextPercent(a) : contextPercent(a) - contextPercent(b)
    )
    this.order = ordered.map((t) => t.terminalId)
    const rows = ordered.map((t) => this.activeRow(t, t.terminalId === selectedId))
    if (rows.length === 0) {
      rows.push(el('tr', { class: 'empty-row' }, el('td', { colspan: 3 }, 'Nenhum terminal aberto. Use + ou retome uma sessão do histórico.')))
    }
    this.activeRows.replaceChildren(...rows)
  }

  private activeRow(t: TerminalSummary, selected: boolean): HTMLTableRowElement {
    const percent = contextPercent(t)
    const tokens = t.context ? `${formatTokens(t.context.usedTokens)} / ${formatTokens(t.context.windowSize)}` : '—'

    const menu = el('span', { class: 'row-menu', role: 'menu' },
      el('button', { type: 'button', role: 'menuitem' }, 'Fechar terminal'))
    const trigger = el('button', {
      class: 'row-menu-trigger', type: 'button', 'aria-expanded': 'false',
      title: `Opções de ${t.name}`, 'aria-label': `Opções de ${t.name}`
    }, '⋯')

    trigger.addEventListener('click', (event) => {
      event.stopPropagation()
      const wasOpen = menu.classList.contains('open')
      this.closeMenus()
      if (!wasOpen) {
        menu.classList.add('open')
        trigger.setAttribute('aria-expanded', 'true')
      }
    })
    menu.querySelector('button')!.addEventListener('click', (event) => {
      event.stopPropagation()
      this.closeMenus()
      this.handlers.onRequestClose(t.terminalId)
    })

    const row = el('tr', { 'data-id': t.terminalId, class: selected ? 'selected' : '', 'aria-selected': String(selected) },
      el('td', {},
        el('span', { class: 'terminal-name' },
          el('i', { class: `status-dot ${statusClass(t.status)}`, title: STATUS_LABEL[t.status] }),
          el('span', { class: 'terminal-label' },
            el('span', {}, t.name),
            el('span', { class: 'terminal-directory', title: t.cwd }, t.cwd)))),
      el('td', { class: 'token-cell' },
        el('div', { class: 'token-meta' }, el('strong', {}, t.context ? `${percent}%` : '—'), el('span', {}, tokens)),
        el('div', { class: 'meter' }, el('i', { class: percent > WARN_AT ? 'warn' : '', style: `width:${percent}%` }))),
      el('td', { class: 'active-actions-cell' },
        el('span', { class: 'terminal-row-actions' }, trigger, menu)))

    row.addEventListener('click', () => this.handlers.onSelect(t.terminalId))
    return row
  }

  /** `total` é o tamanho sem filtro de busca (vai no contador). */
  renderHistory(items: HistoryItem[], total = items.length, filtered = false): void {
    byId('history-count').textContent = pad2(total)
    const rows = items.map((item) => {
      const row = el('tr', {
        'data-id': item.sessionId,
        class: item.inUse ? 'in-use' : '',
        title: item.inUse
          ? 'Aberta em outro terminal. Feche-a lá para poder retomar aqui.'
          : `Retomar “${item.title}”\n${item.cwd}${item.branch ? ` · ${item.branch}` : ''}`
      },
        el('td', {}, el('div', { class: 'history-title' },
          el('span', { class: 'history-title-text' }, item.title),
          item.inUse && el('span', { class: 'tag' }, 'em uso'))),
        el('td', {}, this.displayPath(item.cwd)),
        el('td', {}, formatActivity(item.lastActivity)))
      if (!item.inUse) row.addEventListener('click', () => this.handlers.onResume(item))
      return row
    })
    if (rows.length === 0) {
      rows.push(el('tr', { class: 'empty-row' }, el('td', { colspan: 3 }, filtered ? 'Nada encontrado.' : 'Nenhuma sessão anterior.')))
    }
    this.historyRows.replaceChildren(...rows)
  }

  private closeMenus(): void {
    this.activeRows.querySelectorAll('.row-menu.open').forEach((m) => m.classList.remove('open'))
    this.activeRows.querySelectorAll('.row-menu-trigger[aria-expanded="true"]')
      .forEach((b) => b.setAttribute('aria-expanded', 'false'))
  }
}
