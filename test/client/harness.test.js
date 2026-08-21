'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDocument, fakeTimers } = require('./helpers');

test('textContent concatenates text and element children', () => {
  const { doc } = createDocument();
  const parent = doc.createElement('div');
  const child = doc.createElement('span');
  child.textContent = 'b';
  parent.append('a', child, 'c');

  assert.equal(parent.textContent, 'abc');
});

test('querySelector supports compound selectors', () => {
  const { doc } = createDocument();
  const el = doc.createElement('div');
  el.className = 'card covered';
  doc.body.append(el);

  assert.equal(doc.body.querySelector('.card.covered'), el);
  assert.equal(doc.body.querySelector('div.card'), el);
  assert.equal(doc.body.querySelector('.card.revealed'), null);
});

test('querySelector supports descendant selectors', () => {
  const { doc } = createDocument();
  const wrap = doc.createElement('div');
  wrap.className = 'wrap';
  const inner = doc.createElement('div');
  inner.className = 'target';
  const nested = doc.createElement('span');
  nested.className = 'target';
  inner.append(nested);
  wrap.append(inner);
  doc.body.append(wrap);

  assert.equal(doc.body.querySelector('.wrap .target'), inner);
  assert.equal(doc.body.querySelectorAll('.wrap .target').length, 2);
  // An ancestor chain that does not exist must not match.
  assert.equal(nested.querySelector('.wrap .target'), null);
  assert.equal(doc.body.querySelector('.missing .target'), null);
});

test('fakeTimers tracks pending delays and fires in schedule order', () => {
  const timers = fakeTimers();
  const fired = [];
  timers.setTimeout(() => fired.push('a'), 100);
  timers.setTimeout(() => fired.push('b'), 200);

  assert.deepEqual(timers.pending(), [100, 200]);
  timers.clearTimeout(timers.setTimeout(() => {}, 300));
  timers.fireAll();
  assert.deepEqual(fired, ['a', 'b']);
  assert.equal(timers.count(), 0);
});
