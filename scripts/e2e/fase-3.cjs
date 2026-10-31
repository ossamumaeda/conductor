// Roteiro e2e da fase 3: vários terminais, diálogo, atalhos e fechamento.
// Não envia prompts ao modelo. Precisa de um diretório confiável em E2E_DIR (padrão: ~/Projects).
const { writeFileSync, mkdirSync, readdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { homedir } = require('node:os')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = async function run({ app, win }) {
  const out = process.env.CONDUCTOR_E2E_OUT || '/tmp/conductor-e2e'
  const dir = process.env.E2E_DIR || '~/Projects'
  mkdirSync(out, { recursive: true })
  const wc = win.webContents
  const shot = async (name) => writeFileSync(join(out, `${name}.png`), (await wc.capturePage()).toPNG())
  const js = (code) => wc.executeJavaScript(code)
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    // O Chromium só faz o envio implícito do formulário no evento de caractere do Enter.
    if (keyCode === 'Return') wc.sendInputEvent({ type: 'char', keyCode: '\r', modifiers })
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await sleep(250)
  }
  const type = async (text) => { for (const ch of text) { wc.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(15) } }
  const state = () => js(`({
    rows: [...document.querySelectorAll('#active-rows tr[data-id]')].map(r => r.querySelector('.terminal-label span').textContent),
    selected: document.querySelector('#active-rows tr.selected .terminal-label span')?.textContent ?? null,
    title: document.getElementById('terminal-title').textContent,
    dialog: document.querySelector('dialog[open]')?.id ?? null,
    error: document.getElementById('new-error').hidden ? null : document.getElementById('new-error').textContent
  })`)
  const check = (label, cond, info) => { console.log(`[e2e] ${cond ? 'OK ' : 'FALHOU'} ${label}`, info ?? ''); if (!cond) process.exitCode = 1 }

  win.focus()
  await sleep(1500)
  await shot('1-vazio')
  check('começa sem terminais (D-011)', (await state()).rows.length === 0)

  // Diretório inválido
  await key('T', ['control', 'shift'])
  check('Ctrl+Shift+T abre o diálogo', (await state()).dialog === 'new-dialog')
  await key('A', ['control']); await type('/nao/existe'); await key('Return'); await sleep(500)
  const invalid = await state()
  check('diretório inválido mostra erro', invalid.error?.includes('não existe'), invalid.error)
  await shot('2-erro')

  // Terminal "e2e-alpha"
  await key('A', ['control']); await type(dir); await key('Tab'); await key('Tab'); await type('e2e-alpha'); await key('Return')
  await sleep(4000)
  let s = await state()
  check('abriu e2e-alpha', s.rows.includes('e2e-alpha') && s.dialog === null, s)

  // Terminal "e2e-beta", usando o chip de diretório recente
  await key('T', ['control', 'shift'])
  await shot('3-dialogo-recentes')
  await js(`document.querySelector('#recent-dirs .chip').click()`)
  await type('e2e-beta'); await key('Return')
  await sleep(4000)
  s = await state()
  check('abriu e2e-beta e selecionou', s.rows.length === 2 && s.selected === 'e2e-beta', s)
  await shot('4-dois-terminais')

  // Registro de sessões: --session-id e --name chegaram ao claude
  const registry = readdirSync(join(homedir(), '.claude/sessions')).filter((f) => f.endsWith('.json'))
    .map((f) => { try { return JSON.parse(readFileSync(join(homedir(), '.claude/sessions', f), 'utf8')) } catch { return null } })
    .filter(Boolean)
  const names = registry.filter((r) => r.name?.startsWith('e2e-')).map((r) => `${r.name}:${r.nameSource}`)
  check('registro tem os dois nomes (nameSource=user)', names.length === 2, names)

  // Ctrl+Tab alterna
  const before = (await state()).selected
  await key('Tab', ['control']); await sleep(300)
  const after = (await state()).selected
  check('Ctrl+Tab alterna o terminal', before !== after, `${before} → ${after}`)
  await key('Tab', ['control', 'shift']); await sleep(300)
  check('Ctrl+Shift+Tab volta', (await state()).selected === before)

  // Ctrl+Shift+W pede confirmação e fecha
  await key('W', ['control', 'shift'])
  check('Ctrl+Shift+W abre a confirmação', (await state()).dialog === 'confirm-dialog')
  await shot('5-confirmar-fechar')
  await js(`document.getElementById('confirm-dialog-ok').click()`)
  await sleep(2500)
  s = await state()
  check('terminal fechado sai da lista', s.rows.length === 1 && !s.rows.includes(before), s)
  await shot('6-um-terminal')

  // Fechar a janela com terminal ocioso: fecha direto (D-011)
  console.log('[e2e] fechando a janela…')
  app.on('will-quit', () => console.log(`[e2e] app encerrou (exitCode=${process.exitCode ?? 0})`))
  win.close()
  setTimeout(() => { console.log('[e2e] FALHOU: a janela não fechou'); app.exit(1) }, 5000)
}
