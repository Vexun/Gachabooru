'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fakeTimers } = require('./helpers');
const { wireCloseDetection } = require('../../public/close-detection');

function makeWs() {
  return { onopen: null, onerror: null, onclose: null };
}

function makeHarness() {
  const timers = fakeTimers();
  const created = [];
  const createWebSocket = () => {
    const ws = makeWs();
    created.push(ws);
    return ws;
  };
  wireCloseDetection(createWebSocket, {
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  return { timers, created };
}

test('reconnects up to three times then stops', () => {
  const { timers, created } = makeHarness();
  assert.equal(created.length, 1);

  for (let i = 1; i <= 3; i++) {
    created[created.length - 1].onclose();
    assert.equal(timers.count(), 1, `timer scheduled after close ${i}`);
    timers.fireAll();
    assert.equal(created.length, i + 1, `connect ${i + 1} created`);
  }

  created[created.length - 1].onclose();
  assert.equal(timers.count(), 0, 'no further reconnects');
});

test('a successful open resets the retry count', () => {
  const { timers, created } = makeHarness();

  created[0].onclose();
  timers.fireAll();
  assert.equal(created.length, 2);

  created[1].onopen();
  created[1].onclose();
  assert.deepEqual(timers.pending(), [2000]);
});
