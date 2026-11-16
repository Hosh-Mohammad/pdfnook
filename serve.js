#!/usr/bin/env node
/* Tiny zero-dependency static file server for running ToolNest PDF locally.
 *   node serve.js            -> http://localhost:8080
 *   node serve.js 3000       -> http://localhost:3000
 * Serves tool folders as clean URLs (/merge-pdf/ -> merge-pdf/index.html), like GitHub/Cloudflare Pages.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json'
};

function createServer(root) {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(root, path.normalize(p));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      return res.end(fs.existsSync(path.join(root, '404.html')) ? fs.readFileSync(path.join(root, '404.html')) : 'Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.argv[2]) || 8080;
  createServer(__dirname).listen(port, () => console.log(`ToolNest PDF running at http://localhost:${port}  (Ctrl+C to stop)`));
}
