// Diretórios usados recentemente no diálogo "Novo terminal".
// localStorage é só conveniência: se falhar (perfil limpo, bloqueado), a lista fica vazia.

const KEY = 'conductor.recentDirs'
const MAX = 6

export function loadRecentDirs(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

export function rememberDir(dir: string): void {
  try {
    const next = [dir, ...loadRecentDirs().filter((d) => d !== dir)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Sem persistência: tudo bem.
  }
}
