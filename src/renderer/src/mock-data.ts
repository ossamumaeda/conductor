// Dados falsos no formato real dos tipos de src/shared/ipc.ts.
// Histórico some na fase 4 e uso na fase 5.

import type { HistoryItem, UsageSnapshot } from '../../shared/ipc'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const now = Date.now()

export const mockHistory: HistoryItem[] = [
  { sessionId: 'h1', title: 'landing-page', cwd: '~/projects/acme/web', lastActivity: now - 2 * HOUR, inUse: false },
  { sessionId: 'h2', title: 'db-indexes', cwd: '~/projects/acme/api', lastActivity: now - 3 * HOUR, inUse: true },
  { sessionId: 'h3', title: 'email-templates', cwd: '~/projects/acme/mail', lastActivity: now - DAY, inUse: false },
  { sessionId: 'h4', title: 'bugfix-session', cwd: '~/projects/acme/api', lastActivity: now - DAY - 2 * HOUR, inUse: false },
  { sessionId: 'h5', title: 'component-tests', cwd: '~/projects/acme/web', lastActivity: now - DAY - 5 * HOUR, inUse: false },
  { sessionId: 'h6', title: 'cli-commands', cwd: '~/projects/acme/tools', lastActivity: now - 3 * DAY, inUse: false },
  { sessionId: 'h7', title: 'readme-refresh', cwd: '~/projects/acme/docs', lastActivity: now - 3 * DAY - 2 * HOUR, inUse: false },
  { sessionId: 'h8', title: 'auth-spike', cwd: '~/projects/acme/auth', lastActivity: now - 4 * DAY, inUse: false }
]

export const mockUsage: UsageSnapshot = {
  fiveHour: { usedPercentage: 45, resetsAt: now + 2 * HOUR },
  sevenDay: { usedPercentage: 40, resetsAt: now + 3 * DAY },
  readAt: now
}
