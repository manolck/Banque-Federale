const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnv();

const router = require('./api/index');
const { ensureCollections } = require('./server_api/pocket');

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendFile(res, file) {
  fs.readFile(file, (error, body) => {
    if (error) {
      res.statusCode = 404;
      res.end('Introuvable');
      return;
    }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url || '/', 'http://127.0.0.1');
  req.query = Object.fromEntries(parsed.searchParams.entries());
  if (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')) {
    router(req, res);
    return;
  }
  const requested = decodeURIComponent(parsed.pathname);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const file = path.normalize(path.join(root, relative));
  if (!file.startsWith(root)) {
    res.statusCode = 403;
    res.end('Interdit');
    return;
  }
  fs.stat(file, (error, stat) => {
    if (!error && stat.isFile()) {
      sendFile(res, file);
      return;
    }
    sendFile(res, path.join(root, 'index.html'));
  });
});

server.listen(port, () => {
  console.log(`Banque Fédérale écoute sur http://127.0.0.1:${port}`);
});

ensureCollections().catch((error) => {
  console.error(error.message || error);
});
