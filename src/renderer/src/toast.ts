import { byId } from './dom'

const toast = byId('toast')
let timer: number | undefined

/** Aviso curto no canto da tela. Some sozinho. */
export function showToast(message: string, durationMs = 6000): void {
  toast.textContent = message
  toast.hidden = false
  clearTimeout(timer)
  timer = window.setTimeout(() => (toast.hidden = true), durationMs)
}
