import { byId } from './dom'

const dialog = byId<HTMLDialogElement>('confirm-dialog')
const titleEl = byId('confirm-dialog-title')
const messageEl = byId('confirm-dialog-message')
const okButton = byId<HTMLButtonElement>('confirm-dialog-ok')

/** Diálogo de confirmação reutilizável (estilo do mockup). Resolve true se confirmado. */
export function confirmDialog(options: { title: string; message: string; confirmLabel: string }): Promise<boolean> {
  titleEl.textContent = options.title
  messageEl.textContent = options.message
  okButton.textContent = options.confirmLabel
  dialog.returnValue = ''
  dialog.showModal()
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true })
  })
}

export function anyDialogOpen(): boolean {
  return document.querySelector('dialog[open]') !== null
}
