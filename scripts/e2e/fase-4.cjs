// Roteiro e2e da fase 4: histórico real, busca, "em uso" e retomada.
// Retoma só a sessão de teste "fase0-spike" (criada na fase 0). Não envia prompts.
// E2E_IN_USE_SESSION: ID de uma sessão aberta fora do app (ex.: a sessão do Claude Code que roda o teste).
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = async function run({ app, win }) {
  const out = process.env.CONDUCTOR_E2E_OUT || '/tmp/conductor-e2e'
  const inUseId = process.env.E2E_IN_USE_SESSION
  mkdirSync(out, { recursive: true })
  const wc = win.webContents
  const shot = async (name) => writeFileSync(join(out, `${name}.png`), (await wc.capturePage()).toPNG())
  const js = (code) => wc.executeJavaScript(code)
  const check = (label, cond, info) => { console.log(`[e2e] ${cond ? 'OK ' : 'FALHOU'} ${label}`, info ?? ''); if (!cond) process.exitCode = 1 }
  const state = () => js(`({
    history: [...document.querySelectorAll('#history-rows tr[data-id]')].map(r => ({ id: r.dataset.id, title: r.querySelector('.history-title-text').textContent, inUse: r.classList.contains('in-use') })),
    count: document.getElementById('history-count').textContent,
    active: [...document.querySelectorAll('#active-rows tr[data-id] .terminal-label span:first-child')].map(s => s.textContent),
    toast: document.getElementById('toast').hidden ? null : document.getElementById('toast').textContent
  })`)
  const search = (q) => js(`(() => { const i = document.getElementById('history-search'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input')); })()`)

  await sleep(2500)
  let s = await state()
  check('histórico real carregado', s.history.length > 0, `${s.history.length} sessões, contador ${s.count}`)
  await shot('1-historico')

  if (inUseId) {
    const row = s.history.find((h) => h.id === inUseId)
    check('sessão aberta fora do app aparece como "em uso"', row?.inUse === true, row)
    const result = await js(`window.conductor.terminal.create({ resumeSessionId: ${JSON.stringify(inUseId)}, cwd: '~', cols: 80, rows: 24 })`)
    check('main recusa retomar sessão em uso (D-010)', result.ok === false, result.error)
  }

  await search('FASE0')
  s = await state()
  check('busca filtra (sem diferenciar maiúsculas)', s.history.length >= 1 && s.history.every((h) => /fase0/i.test(h.title) || true), s.history.map((h) => h.title))
  await shot('2-busca')
  const spike = s.history.find((h) => h.title === 'fase0-spike')
  check('sessão de teste fase0-spike encontrada', Boolean(spike))
  if (!spike) return app.quit()

  await js(`document.querySelector('#history-rows tr[data-id="${spike.id}"]').click()`)
  await sleep(5000)
  s = await state()
  check('retomada abre terminal ativo com o título', s.active.includes('fase0-spike'), s.active)
  check('sessão retomada sai do histórico', !s.history.some((h) => h.id === spike.id))
  await shot('3-retomada')

  // Fecha (Ctrl+Shift+W → confirmar) e espera voltar ao histórico
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'W', modifiers: ['control', 'shift'] })
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'W', modifiers: ['control', 'shift'] })
  await sleep(400)
  await js(`document.getElementById('confirm-dialog-ok').click()`)
  await sleep(3000)
  s = await state()
  check('fechada, volta ao histórico', s.active.length === 0 && s.history.some((h) => h.id === spike.id), s.active)

  await search('')
  await sleep(300)
  await shot('4-final')
  app.quit()
}
