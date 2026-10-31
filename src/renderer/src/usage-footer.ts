// Rodapé (D-006): Sessão (5h), Semanal e resumo dos terminais.

import type { RateLimit, SessionStatus, TerminalSummary, UsageSnapshot } from '../../shared/ipc'
import { byId, el } from './dom'
import { formatReset, STATUS_LABEL, statusClass } from './format'

const WARN_AT = 80
/** Leitura mais velha que isso ganha o horário ao lado (D-005: o dado só atualiza com sessão ativa). */
const STALE_MS = 10 * 60_000

const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

function limitCard(target: HTMLElement, label: string, limit: RateLimit | null, readAt: number | null): void {
  const now = Date.now()
  // Janela já renovada desde a última leitura: o percentual antigo não vale mais.
  const expired = limit !== null && limit.resetsAt <= now
  const percent = limit && !expired ? Math.round(limit.usedPercentage) : 0
  const stale = readAt !== null && now - readAt > STALE_MS ? ` · lido ${clock.format(readAt)}` : ''
  const detail = !limit
    ? 'Sem dado ainda: abra uma sessão'
    : expired
      ? 'Renovado · aguardando nova leitura'
      : `${formatReset(limit.resetsAt)}${stale}`
  target.title = readAt ? `Última leitura: ${new Date(readAt).toLocaleString('pt-BR')}` : ''
  target.replaceChildren(
    el('div', { class: 'usage-card-top' },
      el('span', { class: 'usage-label' }, label),
      el('span', { class: 'usage-percent' }, limit && !expired ? `${percent}%` : '—')),
    el('div', { class: 'meter' }, el('i', { class: percent >= WARN_AT ? 'warn' : '', style: `width:${percent}%` })),
    el('div', { class: 'usage-reset' }, detail)
  )
}

let lastUsage: UsageSnapshot | null = null

export function renderUsage(usage: UsageSnapshot | null): void {
  lastUsage = usage
  limitCard(byId('usage-five-hour'), 'Sessão (5h)', usage?.fiveHour ?? null, usage?.readAt ?? null)
  limitCard(byId('usage-seven-day'), 'Semanal', usage?.sevenDay ?? null, usage?.readAt ?? null)
}

// Reavalia "renovado" e "lido às" com o passar do tempo, mesmo sem payload novo.
setInterval(() => renderUsage(lastUsage), 60_000)

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
