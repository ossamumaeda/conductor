import { app, BrowserWindow, ipcMain, Menu, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { IPC, type AppInfo, type TerminalCreateRequest, type TerminalCreateResult } from '../shared/ipc'
import { resolveClaudeBinary } from './claude-bin'
import { PtyManager } from './pty-manager'

const execFileAsync = promisify(execFile)
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

const ptys = new PtyManager({
  data: (event) => mainWindow?.webContents.send(IPC.terminalData, event),
  exit: (event) => mainWindow?.webContents.send(IPC.terminalExit, event)
})

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

/** Fase 2: diretório fixo. A fase 3 troca por um seletor. */
function defaultCwd(): string {
  return process.env['CONDUCTOR_CWD'] ?? homedir()
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

  ipcMain.handle(IPC.terminalCreate, (event, request: TerminalCreateRequest): TerminalCreateResult => {
    if (!fromMainWindow(event)) return { ok: false, error: 'Origem não autorizada' }
    if (!isInt(request?.cols) || !isInt(request?.rows)) return { ok: false, error: 'Tamanho inválido' }

    const file = resolveClaudeBinary()
    if (!file) return { ok: false, error: 'Binário `claude` não encontrado. Instale o Claude Code e confira o PATH.' }

    const cwd = isStr(request.cwd) ? request.cwd : defaultCwd()
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) return { ok: false, error: `Diretório não existe: ${cwd}` }

    try {
      const terminalId = ptys.create({ file, args: extraClaudeArgs(), cwd, cols: request.cols, rows: request.rows })
      return { ok: true, terminalId, cwd }
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
})

app.on('before-quit', () => ptys.killAll())
app.on('window-all-closed', () => app.quit())
