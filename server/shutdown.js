'use strict';

const { WebSocketServer } = require('ws');

const DEFAULT_GRACE_MS = 5000;
const DEFAULT_INTERVAL_MS = 1000;

function watchForClose(server, opts = {}) {
  const graceMs = opts.graceMs ?? DEFAULT_GRACE_MS;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const onShutdown = opts.onShutdown || (() => {});

  const wss = new WebSocketServer({ noServer: true });
  let activeCount = 0;
  let everConnected = false;
  let idleSince = null;
  let timer = null;

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    activeCount += 1;
    everConnected = true;
    idleSince = null;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('close', () => {
      activeCount = Math.max(0, activeCount - 1);
    });
  });

  function tick() {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
    if (activeCount === 0 && everConnected) {
      if (idleSince === null) {
        idleSince = Date.now();
      }
      if (Date.now() - idleSince >= graceMs) {
        stop();
        onShutdown();
      }
      return;
    }
    idleSince = null;
  }

  function start() {
    if (timer) {
      return;
    }
    timer = setInterval(tick, intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    for (const ws of wss.clients) {
      ws.close(1000, 'shutdown');
    }
  }

  start();

  return { start, stop, wss };
}

module.exports = { watchForClose, DEFAULT_GRACE_MS };
