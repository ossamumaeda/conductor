import type { SessionStatus } from '../../shared/ipc'

/** 136000 → "136k", 1000000 → "1M", 950 → "950". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${trimZero(n / 1_000_000)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '')
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dayLabel(ms: number, now: number): string {
  const diffDays = Math.round((startOfDay(ms) - startOfDay(now)) / 86_400_000)
  if (diffDays === 0) return 'hoje'
  if (diffDays === -1) return 'ontem'
  if (diffDays === 1) return 'amanhã'
  // "28 de out." → "28 out", como no mockup.
  const parts = dayMonth.formatToParts(ms)
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const month = (parts.find((p) => p.type === 'month')?.value ?? '').replace('.', '')
  return `${day} ${month}`
}

/** Histórico: "Hoje, 10:42" · "Ontem, 17:36" · "28 out, 16:50". */
export function formatActivity(ms: number, now = Date.now()): string {
  const day = dayLabel(ms, now)
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${time.format(ms)}`
}

/** Rodapé: "Zera hoje às 16:30" · "Zera 03 nov, às 11:00". */
export function formatReset(ms: number, now = Date.now()): string {
  const day = dayLabel(ms, now)
  const isNamed = day === 'hoje' || day === 'amanhã'
  return isNamed ? `Zera ${day} às ${time.format(ms)}` : `Zera ${day}, às ${time.format(ms)}`
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  busy: 'executando',
  idle: 'aguardando',
  waiting: 'precisa de você'
}

/** Classe CSS da bolinha (o verde é o padrão, sem classe). */
export function statusClass(status: SessionStatus): string {
  return status === 'busy' ? '' : status
}
