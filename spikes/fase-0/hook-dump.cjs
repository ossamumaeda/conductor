// Fase 0: grava cada payload de hook recebido via stdin, com o nome do evento passado como argumento.
const fs = require('fs'), path = require('path');
let buf = '';
process.stdin.on('data', d => (buf += d));
process.stdin.on('end', () => {
  fs.appendFileSync(path.join(__dirname, 'out', 'hooks.jsonl'),
    JSON.stringify({ event: process.argv[2], at: new Date().toISOString(), payload: JSON.parse(buf || 'null') }) + '\n');
});
