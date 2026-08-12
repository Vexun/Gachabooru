'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function tempDir(prefix = 'gachabooru-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function startServer(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.close();
  });
  return base;
}

module.exports = { tempDir, startServer };
