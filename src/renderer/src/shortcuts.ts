// Atalhos do app (D-007). Capturados na fase de captura do window, antes de chegarem
// ao xterm: Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+Shift+T e Ctrl+Shift+W nunca vão para o Claude.
// Nenhum atalho que o Claude usa é capturado.

import { anyDialogOpen } from './dialogs'

export interface ShortcutActions {
  next(): void
  previous(): void
  newTerminal(): void
  closeCurrent(): void
}

export function installShortcuts(actions: ShortcutActions): void {
  window.addEventListener(
    'keydown',
    (event) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return
      let action: (() => void) | null = null
      if (event.code === 'Tab') action = event.shiftKey ? actions.previous : actions.next
      else if (event.shiftKey && event.code === 'KeyT') action = actions.newTerminal
      else if (event.shiftKey && event.code === 'KeyW') action = actions.closeCurrent
      if (!action) return

      event.preventDefault()
      event.stopPropagation()
      if (!anyDialogOpen() && !event.repeat) action()
    },
    { capture: true }
  )
}
