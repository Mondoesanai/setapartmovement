import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3030;
const EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 hours

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp4':  'video/mp4',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, decodeURIComponent(urlPath));

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const expires = new Date(Date.now() + EXPIRE_MS).toLocaleString('en-US', { timeZone: 'America/Chicago' });
  console.log('');
  console.log('  Preview server is running.');
  console.log('');
  console.log('  Current site (July 25):  http://localhost:' + PORT + '/');
  console.log('  August 7 preview:        http://localhost:' + PORT + '/?preview=next');
  console.log('');
  console.log('  Auto-stops at: ' + expires + ' (Central Time)');
  console.log('  Close this terminal to stop early.');
  console.log('');
});

setTimeout(() => {
  console.log('24 hours elapsed — preview server shutting down automatically.');
  server.close(() => process.exit(0));
}, EXPIRE_MS);
