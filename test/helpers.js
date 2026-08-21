'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const createdDirs = new Set();

function tempDir(prefix = 'gachabooru-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdDirs.add(dir);
  return dir;
}

process.on('exit', () => {
  for (const dir of createdDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort; the next run recreates its own dirs
    }
  }
});

async function startServer(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    // Undici keeps keep-alive sockets open after fetch calls; close them
    // so server.close() does not wait on idle connections.
    server.closeIdleConnections();
    return new Promise((resolve) => server.close(() => resolve()));
  });
  return base;
}

module.exports = { tempDir, startServer };
