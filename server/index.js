import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.js';
import { bootstrap } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveFile(res, filePath, { cache = false } = {}) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': cache ? 'public, max-age=3600' : 'no-store',
    });
    res.end(content);
  });
}

function serveStatic(url, res) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';

  const target = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }
  serveFile(res, target, { cache: false });
}

const { seeded } = bootstrap();

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (req.url.startsWith('/api/')) {
      console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - startedAt}ms`);
    }
  });

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url);
    return;
  }
  serveStatic(url, res);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  NOVA PC · 装机严选已启动');
  console.log(`  用户端   http://localhost:${PORT}/`);
  console.log(`  管理后台 http://localhost:${PORT}/admin`);
  console.log('');
  console.log('  演示账号：');
  console.log('  管理员   admin / admin123');
  console.log('  普通用户 zhangwei / 123456（购物车已预置商品）');
  console.log('  普通用户 linlin / 123456');
  console.log('  普通用户 chenyu / 123456');
  if (seeded) console.log('\n  已初始化数据库与演示数据。');
  console.log('');
});
