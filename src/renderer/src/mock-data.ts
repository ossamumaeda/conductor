// Dados falsos da fase 1, no formato real dos tipos de src/shared/ipc.ts.
// Somem nas fases 2–5, quando cada parte é ligada aos dados de verdade.

import type { HistoryItem, TerminalSummary, UsageSnapshot } from '../../shared/ipc'

export type Tone = '' | 'muted' | 'highlight' | 'success' | 'warning'
export type FakeLine =
  | { kind: 'prompt'; text: string }
  | { kind: 'command'; text: string }
  | { kind: 'output'; parts: Array<[Tone, string]> }

export interface MockTerminal extends TerminalSummary {
  lines: FakeLine[]
}

const p = (text: string): FakeLine => ({ kind: 'prompt', text })
const c = (text: string): FakeLine => ({ kind: 'command', text })
const o = (...parts: Array<[Tone, string] | string>): FakeLine => ({
  kind: 'output',
  parts: parts.map((part) => (typeof part === 'string' ? (['', part] as [Tone, string]) : part))
})
const blank = o('')
const header = [p('gabriel@linux'), c('claude'), o(['muted', '✻ Claude Code v2.1.316']), blank]

export const mockTerminals: MockTerminal[] = [
  {
    terminalId: 't1', sessionId: 's1', name: 'api-refactor', cwd: '~/projects/acme/api',
    status: 'busy', context: { usedTokens: 136_000, windowSize: 200_000 },
    model: 'Sonnet 5.5', branch: 'feat/streaming-api',
    lines: [
      ...header, p('❯'), c('  Revise a implementação de streaming no endpoint /v2/completions.'), blank,
      o(['highlight', '⏺ Vou analisar o endpoint e os testes relacionados.']), blank,
      o(['muted', '  Lendo src/routes/completions.ts…']),
      o(['muted', '  Lendo src/services/stream.ts…']), blank,
      o(['highlight', '⏺ Encontrei dois pontos para corrigir:']), blank,
      o('  1. O stream não fecha quando o cliente cancela a requisição.'),
      o('  2. Erros do provider não são propagados ao consumidor.'), blank,
      o(['success', '⏺ Atualizei o controller e adicionei tratamento de cancelamento.']), blank,
      o(['muted', '⠋ Executando testes de integração…'])
    ]
  },
  {
    terminalId: 't2', sessionId: 's2', name: 'dashboard-ui', cwd: '~/projects/acme/dashboard',
    status: 'idle', context: { usedTokens: 84_000, windowSize: 1_000_000 },
    model: 'Opus 5.5', branch: 'feat/usage-overview',
    lines: [
      ...header, p('❯'), c('  Ajuste a hierarquia visual do painel de uso.'), blank,
      o(['highlight', '⏺ Vou verificar os componentes e tokens de estilo.']), blank,
      o(['success', '⏺ Reduzi a densidade da grade e dei mais destaque às métricas principais.']), blank,
      o(['muted', '  3 arquivos modificados · alterações ainda não commitadas']), blank,
      p('❯')
    ]
  },
  {
    terminalId: 't3', sessionId: 's3', name: 'auth-migration', cwd: '~/projects/acme/auth',
    status: 'waiting', context: { usedTokens: 182_000, windowSize: 200_000 },
    model: 'Sonnet 5.5', branch: 'chore/oauth-migration',
    lines: [
      ...header, p('❯'), c('  Migre o callback OAuth para usar PKCE.'), blank,
      o(['highlight', '⏺ Vou rastrear o fluxo atual antes de alterar os handlers.']), blank,
      o(['warning', '⚠ Bash command: npm test -- auth']),
      o('  Do you want to proceed?'),
      o(['highlight', '  ❯ 1. Yes']),
      o('    2. No')
    ]
  },
  {
    terminalId: 't4', sessionId: 's4', name: 'docs-search', cwd: '~/projects/acme/docs',
    status: 'idle', context: { usedTokens: 34_000, windowSize: 200_000 },
    model: 'Haiku 5.5', branch: 'docs/search-index',
    lines: [
      ...header, p('❯'), c('  Encontre a origem dos exemplos de busca na documentação.'), blank,
      o(['success', '⏺ Os snippets vêm de docs/examples/search/ e são sincronizados no build.']), blank,
      p('❯')
    ]
  }
]

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
