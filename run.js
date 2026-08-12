'use strict';

const { spawn } = require('node:child_process');
const { createApp } = require('./server/index');
const { watchForClose } = require('./server/shutdown');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;

function openersFor(url) {
  if (process.platform === 'win32') {
    return [{ cmd: 'cmd', args: ['/c', 'start', '""', url], shell: true }];
  }
  if (process.platform === 'darwin') {
    return [{ cmd: 'open', args: [url] }];
  }
  return [
    { cmd: 'xdg-open', args: [url] },
    { cmd: 'x-www-browser', args: [url] },
    { cmd: 'firefox', args: [url] },
    { cmd: 'chromium', args: [url] },
    { cmd: 'google-chrome', args: [url] },
  ];
}

function openBrowser(url) {
  const candidates = openersFor(url);
  function tryNext(index) {
    if (index >= candidates.length) {
      return;
    }
    const candidate = candidates[index];
    const child = spawn(candidate.cmd, candidate.args, {
      stdio: 'ignore',
      detached: true,
      shell: candidate.shell || false,
    });
    child.on('error', () => tryNext(index + 1));
    child.unref();
  }
  tryNext(0);
}

function main() {
  const { app } = createApp();
  const server = app.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`Gachabooru running at ${url}`);
    console.log('Opening the browser...');
    console.log('The server will shut down when you close the browser tab.');
    openBrowser(url);
  });

  watchForClose(server, {
    onShutdown: () => {
      console.log('Browser closed. Shutting down Gachabooru.');
      const force = setTimeout(() => process.exit(0), 2000);
      force.unref();
      server.close(() => process.exit(0));
    },
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other Gachabooru process or set PORT.`);
    } else {
      console.error(err.message);
    }
    process.exit(1);
  });
}

main();
