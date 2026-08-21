'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../server/index');
const { tempDir } = require('./helpers');

function fakeScheduler() {
  const scheduled = [];
  return {
    setTimeout(cb, ms) {
      const timer = { type: 'timeout', cb, ms, cleared: false };
      scheduled.push(timer);
      return timer;
    },
    setInterval(cb, ms) {
      const timer = { type: 'interval', cb, ms, cleared: false };
      scheduled.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
    clearInterval(timer) {
      timer.cleared = true;
    },
    list: () => scheduled,
    runDrain: () => scheduled[0].cb,
    async fireAll() {
      for (const timer of scheduled) {
        if (!timer.cleared) {
          await timer.cb();
        }
      }
    },
  };
}

function makeApp(t, downloader) {
  const { store, startDrain } = createApp({
    dataDir: tempDir(),
    collectionsDir: tempDir(),
    downloader,
  });
  const saveSpy = t.mock.method(store, 'save');
  return { store, startDrain, saveSpy };
}

function queueOne(store) {
  store.get().pending_downloads = [{ post_id: 1 }];
}

test('startDrain schedules a startup and an interval pass', (t) => {
  const timers = fakeScheduler();
  const { startDrain } = makeApp(t, {
    drainPending: async () => ({ retried: 0, remaining: 0 }),
  });

  startDrain({
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    delayMs: 1000,
    intervalMs: 5000,
  });

  const scheduled = timers.list();
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].type, 'timeout');
  assert.equal(scheduled[0].ms, 1000);
  assert.equal(scheduled[1].type, 'interval');
  assert.equal(scheduled[1].ms, 5000);
});

test('startDrain drains and saves when downloads succeed', async (t) => {
  const timers = fakeScheduler();
  const { store, startDrain, saveSpy } = makeApp(t, {
    drainPending: async () => ({ retried: 1, remaining: 0 }),
  });
  queueOne(store);

  startDrain({
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    delayMs: 0,
    intervalMs: 100,
  });

  await timers.fireAll();

  assert.equal(saveSpy.mock.callCount(), 2);
});

test('startDrain skips the drain when the queue is empty', async (t) => {
  const timers = fakeScheduler();
  const { startDrain, saveSpy } = makeApp(t, {
    drainPending: async () => {
      throw new Error('should not be called');
    },
  });

  startDrain({
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    delayMs: 0,
    intervalMs: 100,
  });

  await timers.fireAll();

  assert.equal(saveSpy.mock.callCount(), 0);
});

test('startDrain does not save when nothing retried', async (t) => {
  const timers = fakeScheduler();
  const { store, startDrain, saveSpy } = makeApp(t, {
    drainPending: async () => ({ retried: 0, remaining: 2 }),
  });
  queueOne(store);

  startDrain({
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    delayMs: 0,
    intervalMs: 100,
  });

  await timers.fireAll();

  assert.equal(saveSpy.mock.callCount(), 0);
});

test('startDrain guards against overlapping runs', async (t) => {
  const timers = fakeScheduler();
  const { store, startDrain, saveSpy } = makeApp(t, {
    drainPending: () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ retried: 1, remaining: 0 }), 0);
      }),
  });
  queueOne(store);

  startDrain({
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    delayMs: 0,
    intervalMs: 100,
  });

  const runDrain = timers.runDrain();
  const first = runDrain();
  const second = runDrain();
  const third = runDrain();
  await Promise.all([first, second, third]);

  assert.equal(saveSpy.mock.callCount(), 1);
});

test('startDrain swallows downloader errors and recovers on the next pass', async (t) => {
  const timers = fakeScheduler();
  const { store, startDrain, saveSpy } = makeApp(t, {
    drainPending: (() => {
      let drains = 0;
      return async () => {
        drains += 1;
        if (drains === 1) {
          throw new Error('boom');
        }
        return { retried: 1, remaining: 0 };
      };
    })(),
  });
  queueOne(store);
  t.mock.method(console, 'warn', () => {});

  startDrain({
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    delayMs: 0,
    intervalMs: 100,
  });

  await timers.fireAll();

  assert.equal(console.warn.mock.callCount(), 1);
  assert.equal(saveSpy.mock.callCount(), 1);
});
