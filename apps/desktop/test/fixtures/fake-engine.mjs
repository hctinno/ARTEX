import fs from 'node:fs';
import http from 'node:http';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]);
if (!process.env.GOOSE_SERVER__SECRET_KEY) {
  console.error('missing secret');
  process.exit(2);
}
if (process.env.FAKE_ENGINE_PID_FILE) fs.writeFileSync(process.env.FAKE_ENGINE_PID_FILE, String(process.pid));
const mode = process.env.FAKE_ENGINE_MODE ?? 'ok';
if (mode === 'split-secret') {
  const key = process.env.GOOSE_SERVER__SECRET_KEY;
  const half = Math.floor(key.length / 2);
  process.stdout.write(`secret=${key.slice(0, half)}`);
  setTimeout(() => process.stdout.write(`${key.slice(half)}\n`), 50);
} else {
  console.log(`fake engine secret=${process.env.GOOSE_SERVER__SECRET_KEY}`);
}
if (mode === 'crash-immediately') process.exit(3);

const server = http.createServer((req, res) => {
  res.writeHead(req.url === '/status' ? 200 : 404);
  res.end('ok');
});
server.listen(port, '127.0.0.1');

if (mode === 'crash-after-ready') setTimeout(() => process.exit(4), 300);
