'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');

const { watchForClose } = require('../server/shutdown');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`ws://127.0.0.1:${server.address().port}/ws`);
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openWs(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('websocket connection failed'));
  });
  return ws;
}

function makeWatch(t, graceMs) {
  const server = http.createServer((req, res) => {
    res.end('ok');
  });
  const events = { shutdown: false };
  const watch = watchForClose(server, {
    graceMs,
    intervalMs: 10,
    onShutdown: () => {
      events.shutdown = true;
    },
  });
  t.after(() => {
    watch.stop();
    server.close();
  });
  return { server, watch, events, url: listen(server) };
}

test('does not shut down before any client connects', async (t) => {
  const { url, events } = makeWatch(t, 40);
  await url;
  await wait(200);

  assert.equal(events.shutdown, false);
});

test('shuts down after the last client disconnects', async (t) => {
  const { url, events, watch } = makeWatch(t, 40);
  const wsUrl = await url;
  const ws = await openWs(wsUrl);
  assert.equal(watch.wss.clients.size, 1);

  ws.close();
  await wait(300);

  assert.equal(events.shutdown, true);
});

test('stays up when a client reconnects within the grace period', async (t) => {
  const { url, events } = makeWatch(t, 120);
  const wsUrl = await url;

  const first = await openWs(wsUrl);
  first.close();

  const second = await openWs(wsUrl);
  await wait(400);
  assert.equal(events.shutdown, false);

  second.close();
  await wait(300);
  assert.equal(events.shutdown, true);
});

test('tracks multiple concurrent clients', async (t) => {
  const { url, events, watch } = makeWatch(t, 40);
  const wsUrl = await url;

  const one = await openWs(wsUrl);
  const two = await openWs(wsUrl);
  assert.equal(watch.wss.clients.size, 2);

  one.close();
  await wait(150);
  assert.equal(events.shutdown, false);

  two.close();
  await wait(300);
  assert.equal(events.shutdown, true);
});

test('destroys connections that do not point at /ws', async (t) => {
  const server = http.createServer((req, res) => {
    res.end('ok');
  });
  const watch = watchForClose(server, { graceMs: 100, intervalMs: 10 });
  t.after(() => {
    watch.stop();
    server.close();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/other`);
  await new Promise((resolve, reject) => {
    ws.onerror = () => resolve();
    ws.onopen = () => reject(new Error('connection to /other should have been rejected'));
  });
  assert.equal(watch.wss.clients.size, 0);
});
