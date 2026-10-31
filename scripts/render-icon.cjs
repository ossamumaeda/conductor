// Gera build/icon.png (512×512) a partir da marca do mockup: quadrado verde arredondado com ⌘.
// Uso: npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="position:absolute;inset:32px;border-radius:112px;background:linear-gradient(160deg,#b4efb9,#86d58f);
display:grid;place-items:center;box-shadow:inset 0 -10px 0 #0000001a">
<span style="font:500 300px/1 'DejaVu Sans',sans-serif;color:#0b0e12;transform:translateY(-6px)">⌘</span></div></body></html>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false,
    webPreferences: { offscreen: true } })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 500))
  const image = await win.webContents.capturePage()
  writeFileSync(join(__dirname, '..', 'build', 'icon.png'), image.resize({ width: 512, height: 512 }).toPNG())
  app.quit()
})
