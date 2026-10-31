import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { IPC, type AppInfo, type TerminalCreateRequest, type TerminalCreateResult } from '../shared/ipc'
import { resolveClaudeBinary } from './claude-bin'
import { buildClaudeArgs, isSessionId, resolveDirectory, sanitizeName } from './claude-launch'
import { PtyManager } from './pty-manager'
import { SessionHub } from './session-hub'
import { statusLineSettings, StatusLineWatcher } from './statusline'

const execFileAsync = promisify(execFile)
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
/** Vira true quando o renderer confirma o fechamento com terminais abertos (D-011). */
let closeConfirmed = false

/** Estado próprio do app (D-004): ~/.config/conductor. */
const STATE_DIR = join(app.getPath('userData'), 'state')
const USAGE_FILE = join(app.getPath('userData'), 'usage.json')

const send = (channel: string, payload: unknown): void => mainWindow?.webContents.send(channel, payload)

const ptys = new PtyManager({
  data: (event) => send(IPC.terminalData, event),
  exit: (event) => {
    send(IPC.terminalExit, event)
    hub.forgetTerminal(event.terminalId)
    void statusLines.forget(event.terminalId)
    // A sessão fechada volta para o histórico (com a atividade mais recente).
    void hub.refreshHistory()
  }
})

const hub = new SessionHub(
  ptys,
  {
    history: (items) => send(IPC.historyUpdate, items),
    session: (update) => send(IPC.sessionUpdate, update),
    usage: (usage) => send(IPC.usageUpdate, usage)
  },
  USAGE_FILE
)

const statusLines = new StatusLineWatcher(STATE_DIR, (update) => hub.onStatusLine(update))

async function readClaudeVersion(): Promise<string | null> {
  const bin = resolveClaudeBinary()
  if (!bin) return null
  try {
    const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 5000 })
    return stdout.trim().split(/\s+/)[0] ?? null
  } catch {
    return null
  }
}

/** Só em desenvolvimento: argumentos extras para o `claude` (ex.: "--model haiku" nos testes). */
function extraClaudeArgs(): string[] {
  const raw = isDev ? process.env['CONDUCTOR_CLAUDE_ARGS'] : undefined
  return raw ? raw.split(/\s+/).filter(Boolean) : []
}

/** Aceita mensagens só da janela principal. */
function fromMainWindow(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return mainWindow !== null && event.sender === mainWindow.webContents
}

const isInt = (v: unknown): v is number => Number.isInteger(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function registerIpc(): void {
  ipcMain.handle(IPC.appInfo, async (): Promise<AppInfo> => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    claudeVersion: await readClaudeVersion(),
    homeDir: homedir()
  }))

  ipcMain.handle(IPC.terminalCreate, async (event, request: TerminalCreateRequest): Promise<TerminalCreateResult> => {
    if (!fromMainWindow(event)) return { ok: false, error: 'Origem não autorizada' }
    if (!isInt(request?.cols) || !isInt(request?.rows)) return { ok: false, error: 'Tamanho inválido' }

    const file = resolveClaudeBinary()
    if (!file) return { ok: false, error: 'Binário `claude` não encontrado. Instale o Claude Code e confira o PATH.' }

    // CONDUCTOR_CWD (testes) só vale quando o renderer não escolheu um diretório.
    const requestedCwd = isStr(request.cwd) ? request.cwd : process.env['CONDUCTOR_CWD']
    const cwd = resolveDirectory(requestedCwd)
    if (!cwd) return { ok: false, error: `Diretório não existe: ${requestedCwd}` }

    const resume = request.resumeSessionId !== undefined
    if (resume && !isSessionId(request.resumeSessionId)) return { ok: false, error: 'ID de sessão inválido' }
    if (resume && ptys.hasSession(request.resumeSessionId as string)) return { ok: false, error: 'Essa sessão já está aberta no app.' }
    if (resume && hub.isRunningElsewhere(request.resumeSessionId as string)) {
      return { ok: false, error: 'Essa sessão está aberta em outro terminal. Feche-a lá para retomar aqui.' }
    }
    const sessionId = resume ? (request.resumeSessionId as string) : randomUUID()
    const name = sanitizeName(isStr(request.name) ? request.name : undefined, cwd)
    const terminalId = randomUUID()
    const settings = await statusLineSettings(STATE_DIR, terminalId)
    const args = buildClaudeArgs({ sessionId, resume, name, settings, extra: extraClaudeArgs() })

    try {
      ptys.create({ terminalId, sessionId, file, args, cwd, cols: request.cols, rows: request.rows })
      hub.publishHistory() // uma sessão retomada sai do histórico
      return { ok: true, terminalId, sessionId, cwd, name }
    } catch (error) {
      return { ok: false, error: `Falha ao iniciar o claude: ${(error as Error).message}` }
    }
  })

  ipcMain.on(IPC.terminalWrite, (event, terminalId: unknown, data: unknown) => {
    if (fromMainWindow(event) && isStr(terminalId) && isStr(data)) ptys.write(terminalId, data)
  })
  ipcMain.on(IPC.terminalResize, (event, terminalId: unknown, cols: unknown, rows: unknown) => {
    if (fromMainWindow(event) && isStr(terminalId) && isInt(cols) && isInt(rows)) ptys.resize(terminalId, cols, rows)
  })
  ipcMain.on(IPC.terminalKill, (event, terminalId: unknown) => {
    if (fromMainWindow(event) && isStr(terminalId)) ptys.kill(terminalId)
  })

  ipcMain.handle(IPC.historyGet, (event) => (fromMainWindow(event) ? hub.history() : []))
  ipcMain.handle(IPC.usageGet, (event) => (fromMainWindow(event) ? hub.usageSnapshot() : null))

  ipcMain.handle(IPC.dialogPickDirectory, async (event, defaultPath: unknown) => {
    if (!fromMainWindow(event) || !mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Diretório do novo terminal',
      defaultPath: resolveDirectory(isStr(defaultPath) ? defaultPath : undefined) ?? homedir(),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.on(IPC.appConfirmClose, (event) => {
    if (!fromMainWindow(event)) return
    closeConfirmed = true
    mainWindow?.close()
  })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Conductor',
    backgroundColor: '#0b0e12',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Nada de novas janelas nem navegação para fora do app. Links http(s) abrem no navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  // Sem menu, F12 abre as DevTools em desenvolvimento.
  if (isDev) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        win.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  // Verificação visual: CONDUCTOR_CAPTURE=/caminho/arquivo.png salva um print da janela e fecha o app.
  const capturePath = process.env['CONDUCTOR_CAPTURE']
  if (capturePath) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage()
        await writeFile(capturePath, image.toPNG())
        app.quit()
      }, Number(process.env['CONDUCTOR_CAPTURE_DELAY'] ?? 1500))
    })
  }

  // Só em desenvolvimento: CONDUCTOR_E2E=/caminho/roteiro.cjs roda um roteiro de teste com acesso à janela.
  const e2eScript = isDev ? process.env['CONDUCTOR_E2E'] : undefined
  if (e2eScript) {
    win.webContents.once('did-finish-load', () => {
      const run = createRequire(__filename)(e2eScript) as (ctx: object) => Promise<void>
      run({ app, win, ptys }).catch((error) => {
        console.error('[e2e] falhou:', error)
        app.exit(1)
      })
    })
  }

  // D-011: com terminais abertos, quem decide é o renderer (pede confirmação se algum estiver trabalhando).
  win.on('close', (event) => {
    if (closeConfirmed || ptys.size === 0) return
    event.preventDefault()
    win.webContents.send(IPC.appCloseRequested)
  })

  win.on('closed', () => {
    mainWindow = null
  })
  return win
}

// O menu padrão do Electron captura Ctrl+W, Ctrl+R, Ctrl+C etc., que precisam chegar ao Claude.
Menu.setApplicationMenu(null)

// Permissões do Chromium: só a área de transferência (Ctrl+Shift+C/V no terminal).
const ALLOWED_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write'])

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))
  registerIpc()
  mainWindow = createWindow()
  void statusLines.start().then(() => hub.start())
})

app.on('before-quit', () => {
  hub.stop()
  statusLines.stop()
  ptys.killAll()
})
app.on('window-all-closed', () => app.quit())
