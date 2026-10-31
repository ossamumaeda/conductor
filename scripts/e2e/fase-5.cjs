// Roteiro e2e da fase 5: status (registro), contexto/modelo (status line) e uso do plano.
// ENVIA UM PROMPT CURTO AO MODELO (use CONDUCTOR_CLAUDE_ARGS="--model haiku --permission-mode default").
// O prompt pede para criar um arquivo; o roteiro NEGA a permissão, então nada é criado.
const { writeFileSync, mkdirSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = async function run({ app, win }) {
  const out = process.env.CONDUCTOR_E2E_OUT || '/tmp/conductor-e2e'
  const dir = process.env.E2E_DIR
  mkdirSync(out, { recursive: true })
  const wc = win.webContents
  const shot = async (name) => writeFileSync(join(out, `${name}.png`), (await wc.capturePage()).toPNG())
  const js = (code) => wc.executeJavaScript(code)
  const check = (label, cond, info) => { console.log(`[e2e] ${cond ? 'OK ' : 'FALHOU'} ${label}`, info ?? ''); if (!cond) process.exitCode = 1 }
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    if (keyCode === 'Return') wc.sendInputEvent({ type: 'char', keyCode: '\r', modifiers })
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await sleep(200)
  }
  const type = async (text) => { for (const ch of text) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(12) } }
  const state = () => js(`({
    status: document.querySelector('#terminal-live')?.className ?? '',
    statusText: document.querySelector('#terminal-live')?.textContent ?? '',
    tokens: document.querySelector('#active-rows tr.selected .token-meta')?.textContent ?? '',
    bottom: document.getElementById('token-status').textContent,
    five: document.getElementById('usage-five-hour').textContent,
    week: document.getElementById('usage-seven-day').textContent,
    summary: document.getElementById('terminal-summary').textContent
  })`)
  const waitFor = async (label, pred, timeoutMs) => {
    const end = Date.now() + timeoutMs
    let s
    while (Date.now() < end) { s = await state(); if (pred(s)) return s; await sleep(400) }
    console.log(`[e2e] tempo esgotado esperando: ${label}`, s)
    return null
  }

  await sleep(1500)
  // Abre pelo diálogo, preenchendo os campos via DOM (a ordem de Tab muda com os chips de recentes).
  await key('T', ['control', 'shift'])
  await js(`document.getElementById('new-cwd').value = ${JSON.stringify(dir)}; document.getElementById('new-name').value = 'e2e-status'`)
  await js(`document.getElementById('new-submit').click()`)
  await sleep(5000)
  const focus = await js(`document.activeElement?.className ?? ''`)
  check('foco vai para o terminal depois do diálogo', /xterm-helper-textarea/.test(focus), focus)
  await shot('1-aberto')
  const first = await state()

  let s = await waitFor('modelo via status line', (x) => /Haiku/i.test(x.bottom), 30000)
  check('status line trouxe o modelo', s !== null, s?.bottom)
  check('status inicial "aguardando"', /idle/.test((s ?? first).status), (s ?? first).status)

  await type('Use the Write tool to create a file named e2e-perm.txt containing the word ok. Do not do anything else.')
  await sleep(300)
  await key('Return')
  s = await waitFor('status executando', (x) => x.status.trim() === 'live', 20000)
  check('status "executando" (busy)', s !== null)
  s = await waitFor('status precisa de você', (x) => /waiting/.test(x.status), 60000)
  check('status "precisa de você" (waiting) no pedido de permissão', s !== null, s?.statusText)
  check('resumo do rodapé conta 1 precisa de você', s !== null && /1 precisa de você/.test(s.summary), s?.summary)
  await shot('2-precisa-de-voce')

  await key('Escape') // nega a permissão
  s = await waitFor('voltar a aguardando', (x) => /idle/.test(x.status), 60000)
  check('volta a "aguardando" depois de negar', s !== null)
  await sleep(2500)
  s = await state()
  check('uso do plano real no rodapé (5h e semanal)', /%/.test(s.five) && /%/.test(s.week), `${s.five} | ${s.week}`)
  check('contexto por terminal preenchido', /\d+%/.test(s.tokens), s.tokens)
  check('barra inferior com contexto e modelo', /contexto \d+%/.test(s.bottom) && /Haiku/.test(s.bottom), s.bottom)
  check('arquivo NÃO foi criado (permissão negada)', !existsSync(join(dir, 'e2e-perm.txt')))
  await shot('3-final')

  app.on('will-quit', () => console.log(`[e2e] app encerrou (exitCode=${process.exitCode ?? 0})`))
  win.close()
  await sleep(1500)
  // Nenhum terminal trabalhando: fecha sem perguntar (D-011). Se perguntou, confirma.
  await js(`document.getElementById('confirm-dialog').open && document.getElementById('confirm-dialog-ok').click()`).catch(() => {})
}
