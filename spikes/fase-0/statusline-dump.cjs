// Fase 0: grava cada payload da status line recebido via stdin.
const fs = require('fs'), path = require('path');
let buf = '';
process.stdin.on('data', d => (buf += d));
process.stdin.on('end', () => {
  const out = path.join(__dirname, 'out');
  fs.appendFileSync(path.join(out, 'statusline.jsonl'), buf.trim() + '\n');
  try { const j = JSON.parse(buf); process.stdout.write(`spike · ctx ${j.context_window?.used_percentage ?? '?'}%`); }
  catch { process.stdout.write('spike'); }
});
