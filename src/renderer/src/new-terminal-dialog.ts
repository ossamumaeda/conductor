import { byId, el } from './dom'
import { loadRecentDirs } from './recent-dirs'

const dialog = byId<HTMLDialogElement>('new-dialog')
const form = byId<HTMLFormElement>('new-form')
const cwdInput = byId<HTMLInputElement>('new-cwd')
const nameInput = byId<HTMLInputElement>('new-name')
const browse = byId<HTMLButtonElement>('new-browse')
const recent = byId('recent-dirs')
const error = byId('new-error')
const submit = byId<HTMLButtonElement>('new-submit')
const cancel = byId<HTMLButtonElement>('new-cancel')

export interface NewTerminalOptions {
  tildify(path: string): string
  pickDirectory(current: string): Promise<string | null>
  /** Abre o terminal. Retorna uma mensagem de erro, ou null em caso de sucesso. */
  open(request: { cwd: string; name: string }): Promise<string | null>
}

let options: NewTerminalOptions | null = null

export function setupNewTerminalDialog(opts: NewTerminalOptions): void {
  options = opts

  browse.addEventListener('click', async () => {
    const picked = await opts.pickDirectory(cwdInput.value)
    if (picked) {
      cwdInput.value = opts.tildify(picked)
      if (!nameInput.value) nameInput.placeholder = basename(picked)
    }
    cwdInput.focus()
  })

  cwdInput.addEventListener('input', () => {
    nameInput.placeholder = basename(cwdInput.value)
    showError(null)
  })

  cancel.addEventListener('click', () => dialog.close('cancel'))

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (submit.disabled) return
    const cwd = cwdInput.value.trim()
    if (!cwd) return showError('Informe um diretório.')

    submit.disabled = true
    showError(null)
    const failure = await opts.open({ cwd, name: nameInput.value.trim() })
    submit.disabled = false
    if (failure) showError(failure)
    else dialog.close('confirm')
  })
}

export function openNewTerminalDialog(): void {
  if (!options || dialog.open) return
  const opts = options
  const dirs = loadRecentDirs()
  cwdInput.value = opts.tildify(dirs[0] ?? '~')
  nameInput.value = ''
  nameInput.placeholder = basename(cwdInput.value)
  showError(null)
  recent.replaceChildren(
    ...dirs.map((dir) => {
      const chip = el('button', { class: 'chip', type: 'button', title: dir }, opts.tildify(dir))
      chip.addEventListener('click', () => {
        cwdInput.value = opts.tildify(dir)
        nameInput.placeholder = basename(dir)
        nameInput.focus()
      })
      return chip
    })
  )
  dialog.showModal()
  cwdInput.select()
}

function showError(message: string | null): void {
  error.hidden = message === null
  error.textContent = message ?? ''
}

function basename(path: string): string {
  return path.trim().split('/').filter(Boolean).pop() ?? ''
}
