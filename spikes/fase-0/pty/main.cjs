// Fase 0: carrega node-pty dentro do processo principal do Electron e roda `claude --version` num pty.
const { app } = require('electron');
app.whenReady().then(() => {
  const pty = require('node-pty');
  const p = pty.spawn('claude', ['--version'], { name: 'xterm-256color', cols: 80, rows: 24, cwd: process.env.HOME, env: process.env });
  let out = '';
  p.onData(d => (out += d));
  p.onExit(({ exitCode }) => {
    console.log(`electron=${process.versions.electron} abi=${process.versions.modules} exit=${exitCode} out=${JSON.stringify(out.trim())}`);
    app.quit();
  });
});
