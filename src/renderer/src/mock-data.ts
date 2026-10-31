// Dados falsos no formato real dos tipos de src/shared/ipc.ts.
// Some na fase 5, quando o uso vem da status line.

import type { UsageSnapshot } from '../../shared/ipc'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const now = Date.now()

export const mockUsage: UsageSnapshot = {
  fiveHour: { usedPercentage: 45, resetsAt: now + 2 * HOUR },
  sevenDay: { usedPercentage: 40, resetsAt: now + 3 * DAY },
  readAt: now
}
