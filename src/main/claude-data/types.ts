// Formatos internos do Claude Code, validados na fase 0 (docs/fontes-de-dados.md).
// Tudo opcional: versões futuras podem remover campos, e o app não pode quebrar por isso.

/** `~/.claude/sessions/<pid>.json` */
export interface RegistryFile {
  pid?: number
  sessionId?: string
  cwd?: string
  name?: string
  nameSource?: string
  status?: string
  kind?: string
  updatedAt?: number
}

/** Linha de `~/.claude/projects/<cwd>/<sessionId>.jsonl` (só os campos usados). */
export interface TranscriptLine {
  type?: string
  cwd?: string
  timestamp?: string
  gitBranch?: string
  isSidechain?: boolean
  isMeta?: boolean
  customTitle?: string
  aiTitle?: string
  lastPrompt?: string
  message?: {
    role?: string
    content?: string | Array<{ type?: string; text?: string }>
  }
}
