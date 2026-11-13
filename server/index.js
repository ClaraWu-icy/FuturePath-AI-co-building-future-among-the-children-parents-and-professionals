import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { handleApi } from './routes.js';
import { flush, table } from './db.js';
import { seedDemoData } from './seed.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2'
};

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(config.publicDir, path.normalize(pathname));
  if (!filePath.startsWith(config.publicDir)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback：非静态资源路径统一交给前端路由
      if (!path.extname(pathname)) return serveFile(res, path.join(config.publicDir, 'index.html'));
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }
    serveFile(res, filePath, stat);
  });
}

function serveFile(res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const isHtml = ext === '.html';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/healthz') return sendJSON(res, 200, { ok: true, ts: Date.now() });

  if (url.pathname.startsWith('/api/')) {
    try {
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      const out = await handleApi(req, res, url, body);
      if (out && out.__raw) {
        res.writeHead(200, {
          'Content-Type': out.__raw.type,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(out.__raw.filename)}"`,
          'Cache-Control': 'no-store'
        });
        res.end(out.__raw.body);
        return;
      }
      return sendJSON(res, 200, out ?? { ok: true });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error('[server]', err);
      return sendJSON(res, status, {
        error: err.message || '服务器内部错误',
        details: err.details || undefined,
        status
      });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }
  serveStatic(req, res, url);
});

// 空库自动补演示数据（部署到新环境时避免首屏空白）
if (process.env.AUTO_SEED !== '0' && table('users').length === 0) {
  console.log('[boot] 数据库为空，正在写入演示数据…');
  try {
    await seedDemoData();
    flush();
  } catch (err) {
    console.error('[boot] 演示数据写入失败：', err.message);
  }
}

server.listen(config.port, config.host, () => {
  const shown = config.host === '0.0.0.0' ? '127.0.0.1' : config.host;
  console.log('');
  console.log('  FuturePath AI 已启动');
  console.log(`  → http://${shown}:${config.port}  （监听 ${config.host}:${config.port}）`);
  console.log(`  AI 模式：${config.ai.provider === 'openai' && config.ai.apiKey ? 'llm（已配置模型）' : 'simulated（内置规则引擎，非真实大模型）'}`);
  console.log(`  数据目录：${config.dataDir}`);
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    server.close(() => process.exit(0));
  });
}

export { server };
