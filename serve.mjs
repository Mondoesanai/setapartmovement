// Local dev server. Serves the site AND the /api functions, so the release gate behaves here
// exactly as it does on Vercel. `npx serve` could not do this: it 404s /api/release, which pushes
// the page onto its offline fallback, which is precisely the path we must not be testing.
//
//   node serve.mjs            -> http://localhost:3000
//   PORT=3001 node serve.mjs
//
// Test-only: DEV_EXPIRES_IN_MS=8000 makes /api/release report a meetup expiring 8 seconds from
// now, so the already-open-tab flip can be watched without waiting for 14 November. It overrides
// the real answer and exists only in this file — nothing in the deployed code knows about it.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

// Give the API functions the env they expect, the same way `vercel dev` would.
for (const file of ['.env.local', '.env']) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
const tokenFile = path.join(__dirname, '.preview-token.txt');
if (!process.env.PREVIEW_TOKEN && fs.existsSync(tokenFile)) {
  process.env.PREVIEW_TOKEN = fs.readFileSync(tokenFile, 'utf8').trim();
}

// Test-only deadline, fixed at startup so it genuinely passes.
const DEV_DEADLINE = process.env.DEV_EXPIRES_IN_MS
  ? Date.now() + Number(process.env.DEV_EXPIRES_IN_MS)
  : null;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => resolve(raw));
    req.on('error', () => resolve(''));
  });
}

// Minimal stand-in for the Vercel request/response shape the handlers are written against.
// Vercel parses a JSON body into req.body before the handler runs; a bare Node server does not,
// so without this every POST handler sees an empty body and rejects the request.
async function shim(req, res, url) {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const raw = await readBody(req);
    if ((req.headers['content-type'] || '').includes('application/json')) {
      try { req.body = JSON.parse(raw); } catch { req.body = {}; }
    } else {
      req.body = raw;
    }
  }
  req.query = Object.fromEntries(url.searchParams);
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return [req, res];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    const name = pathname.slice('/api/'.length).replace(/[^a-zA-Z0-9_-]/g, '');
    const file = path.join(__dirname, 'api', `${name}.js`);
    if (!fs.existsSync(file)) { res.statusCode = 404; res.end('no such function'); return; }
    try {
      // Cache-busted so editing a handler takes effect without restarting the server.
      const mod = await import(`${pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs}`);
      await shim(req, res, url);

      if (name === 'release' && DEV_DEADLINE) {
        const now = Date.now();
        // Fixed at startup, not per request. Recomputing it here made the deadline recede by
        // 9 seconds on every poll, so it never actually arrived.
        const expiresAt = DEV_DEADLINE;
        const startsAt = expiresAt - 3600000;
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({
          phase: now < expiresAt ? 'announced' : 'past',
          meetup: {
            id: '010', title: 'CONNECT', startsAt, expiresAt,
            startsAtIso: new Date(startsAt).toISOString(),
            expiresAtIso: new Date(expiresAt).toISOString(),
          },
          mode: 'dev-short-expiry', now,
          serverTime: new Date(now).toISOString(),
          msUntilExpiry: Math.max(0, expiresAt - now),
          released: now < expiresAt,
        });
        return;
      }

      await mod.default(req, res);
    } catch (e) {
      res.statusCode = 500;
      res.end('function error: ' + e.message);
    }
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  // Pretty URLs, matching Vercel's cleanUrls behaviour.
  let file = path.join(__dirname, pathname);
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!file.startsWith(__dirname)) { res.statusCode = 403; res.end('nope'); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404; res.end('404'); return;
  }

  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Set Apart Movement -> http://localhost:${PORT}`);
  console.log(`  /api/release is live (PREVIEW_TOKEN ${process.env.PREVIEW_TOKEN ? 'loaded' : 'MISSING'})`);
  if (process.env.DEV_EXPIRES_IN_MS) {
    console.log(`  TEST MODE: meetup expires in ${process.env.DEV_EXPIRES_IN_MS}ms`);
  }
});
