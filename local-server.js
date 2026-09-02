#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const root = __dirname;
const port = Number(process.env.PORT || 8765);
const shouldOpenBrowser = process.env.ECHO_RIFT_NO_OPEN !== '1' && !process.argv.includes('--no-open');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg'
};

function openBrowser(url) {
  if (!shouldOpenBrowser) return;
  const command = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(command, () => {});
}

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
    response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' }).end('Méthode non autorisée');
    return;
  }
  let raw;
  try {
    raw = decodeURIComponent((request.url || '/').split('?')[0]);
  } catch (_) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Adresse invalide');
    return;
  }
  const relative = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);
  const relativeToRoot = path.relative(path.resolve(root), filePath);
  if (relativeToRoot.startsWith(`..${path.sep}`) || relativeToRoot === '..' || path.isAbsolute(relativeToRoot)) {
    response.writeHead(403).end('Accès refusé');
    return;
  }
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Fichier introuvable');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(filePath).pipe(response);
  });
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    const url = `http://localhost:${port}/`;
    console.log(`ECHO RIFT semble déjà lancé : ${url}`);
    openBrowser(url);
    return;
  }
  console.error(error);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}/`;
  console.log('');
  console.log('  ECHO RIFT est lancé.');
  console.log(`  Adresse : ${url}`);
  console.log('  Fermez cette fenêtre ou appuyez sur Ctrl+C pour arrêter le serveur.');
  console.log('');
  openBrowser(url);
});
