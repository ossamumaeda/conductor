import { homedir } from 'node:os'
import { join } from 'node:path'

/** Raiz dos dados do Claude Code. Só leitura (D-004). */
export const CLAUDE_DIR = process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
export const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions')
export const PROJECTS_DIR = join(CLAUDE_DIR, 'projects')
