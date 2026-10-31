// Roteiro e2e da fase 2. Não envia prompts ao modelo (não gasta uso do plano).
// Uso:
//   npm run build
//   CONDUCTOR_E2E=$PWD/scripts/e2e/fase-2.cjs CONDUCTOR_E2E_OUT=/tmp/e2e \
//   CONDUCTOR_CWD=$PWD npx electron-vite preview --skipBuild
const { clipboard } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = async function run({ app, win }) {
  const out = process.env.CONDUCTOR_E2E_OUT || '/tmp/conductor-e2e'
  mkdirSync(out, { recursive: true })
  const wc = win.webContents
  const shot = async (name) => {
    writeFileSync(join(out, `${name}.png`), (await wc.capturePage()).toPNG())
    console.log(`[e2e] print: ${name}`)
  }
  const type = async (text) => {
    for (const ch of text) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(25) }
  }
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await sleep(150)
  }
  const domState = () => wc.executeJavaScript(`({
    hosts: document.querySelectorAll('.xterm-host').length,
    visible: document.querySelectorAll('.xterm-host:not([hidden])').length,
    emptyVisible: !document.getElementById('terminal-empty').hidden,
    title: document.getElementById('terminal-title').textContent,
    rows: document.querySelectorAll('#active-rows tr[data-id]').length
  })`)

  win.focus()
  await sleep(7000)
  console.log('[e2e] estado inicial', await domState())
  await shot('1-inicial')

  await type('/hel')
  await sleep(800)
  await shot('2-digitando')
  await key('U', ['control']) // limpa a linha no Claude
  await sleep(300)

  clipboard.writeText('texto colado com Ctrl+Shift+V')
  await key('V', ['control', 'shift'])
  await sleep(800)
  await shot('3-colado')

  await key('C', ['control']) // Ctrl+C deve chegar ao Claude e limpar a entrada
  await sleep(600)
  await shot('4-ctrl-c')

  win.setSize(1000, 680)
  await sleep(1500)
  await shot('5-redimensionado')

  await type('/exit')
  await sleep(400)
  await key('Return')
  await sleep(3000)
  console.log('[e2e] depois do /exit', await domState())
  await shot('6-exit')
  app.quit()
}
