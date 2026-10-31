// Rodapé (D-006): Sessão (5h), Semanal e resumo dos terminais.

import type { RateLimit, SessionStatus, TerminalSummary, UsageSnapshot } from '../../shared/ipc'
import { byId, el } from './dom'
import { formatReset, STATUS_LABEL, statusClass } from './format'

const WARN_AT = 80

function limitCard(target: HTMLElement, label: string, limit: RateLimit | null): void {
  const percent = limit ? Math.round(limit.usedPercentage) : 0
  target.replaceChildren(
    el('div', { class: 'usage-card-top' },
      el('span', { class: 'usage-label' }, label),
      el('span', { class: 'usage-percent' }, limit ? `${percent}%` : '—')),
    el('div', { class: 'meter' }, el('i', { class: percent >= WARN_AT ? 'warn' : '', style: `width:${percent}%` })),
    el('div', { class: 'usage-reset' }, limit ? formatReset(limit.resetsAt) : 'Sem dado ainda: abra uma sessão')
  )
}

export function renderUsage(usage: UsageSnapshot | null): void {
  limitCard(byId('usage-five-hour'), 'Sessão (5h)', usage?.fiveHour ?? null)
  limitCard(byId('usage-seven-day'), 'Semanal', usage?.sevenDay ?? null)
}

const ORDER: SessionStatus[] = ['busy', 'idle', 'waiting']

export function renderSummary(terminals: TerminalSummary[]): void {
  const counts = new Map<SessionStatus, number>(ORDER.map((s) => [s, 0]))
  for (const t of terminals) counts.set(t.status, (counts.get(t.status) ?? 0) + 1)

  byId('terminal-summary').replaceChildren(
    el('div', { class: 'usage-card-top' },
      el('span', { class: 'usage-label' }, 'Terminais'),
      el('span', { class: 'usage-percent' }, String(terminals.length))),
    el('div', { class: 'summary-list' },
      ...ORDER.map((status) => {
        const n = counts.get(status) ?? 0
        return el('span', { class: `summary-item ${n === 0 ? 'zero' : ''}` },
          el('i', { class: `status-dot ${statusClass(status)}` }), `${n} ${STATUS_LABEL[status]}`)
      }))
  )
}
