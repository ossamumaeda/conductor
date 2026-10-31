import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { IPC, type AppInfo } from '../shared/ipc'

const execFileAsync = promisify(execFile)

async function readClaudeVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('claude', ['--version'], { timeout: 5000 })
    return stdout.trim().split(/\s+/)[0] ?? null
  } catch {
    return null
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.appInfo, async (): Promise<AppInfo> => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    claudeVersion: await readClaudeVersion()
  }))
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Conductor',
    backgroundColor: '#0b0e12',
    autoHideMenuBar: true,
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

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  // Verificação visual: CONDUCTOR_CAPTURE=/caminho/arquivo.png salva um print da janela e fecha o app.
  const capturePath = process.env['CONDUCTOR_CAPTURE']
  if (capturePath) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage()
        await writeFile(capturePath, image.toPNG())
        app.quit()
      }, 1500)
    })
  }

  return win
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
