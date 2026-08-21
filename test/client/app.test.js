'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createDocument, fakeTimers } = require('./helpers');
const { createApp } = require('../../public/app');

const INDEX_HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'index.html'),
  'utf8',
);

const STYLES_CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'styles.css'),
  'utf8',
);

function appDocument() {
  const { doc } = createDocument();
  const status = doc.createElement('div');
  status.id = 'server-status';
  status.className = 'status';
  const banner = doc.createElement('section');
  banner.id = 'banner-section';
  const roll = doc.createElement('section');
  roll.id = 'roll-section';
  doc.body.append(status, banner, roll);
  return { doc, status, banner, roll };
}

test('index.html declares the elements createApp depends on', () => {
  assert.match(INDEX_HTML, /<h1>Gachabooru<\/h1>/);
  assert.match(INDEX_HTML, /href="collection\.html"/);
  assert.match(INDEX_HTML, /id="server-status"/);
  assert.match(INDEX_HTML, /id="banner-section"/);
  assert.match(INDEX_HTML, /id="roll-section"/);
});

test('index.html loads the client scripts in dependency order', () => {
  const close = INDEX_HTML.indexOf('close-detection.js');
  const picker = INDEX_HTML.indexOf('banner-picker.js');
  const roll = INDEX_HTML.indexOf('roll.js');
  const app = INDEX_HTML.indexOf('app.js');
  assert.ok(close >= 0, 'close-detection.js is included');
  assert.ok(picker > close, 'banner-picker.js loads after close-detection.js');
  assert.ok(roll > picker, 'roll.js loads after banner-picker.js');
  assert.ok(app > roll, 'app.js loads last');
});

test('index.html declares the hero section and the default hero mode', () => {
  assert.match(INDEX_HTML, /<body class="mode-hero">/);
  assert.match(INDEX_HTML, /id="hero-section"/);
  assert.match(INDEX_HTML, /hero-title/);
  assert.match(INDEX_HTML, /hero-message/);
});

// Kept as a small accessibility contract: these two rules are what make
// screen-reader announcements and reduced-motion support work.
test('styles.css scaffolds reduced motion and the visually hidden utility', () => {
  assert.match(STYLES_CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(STYLES_CSS, /\.sr-only\s*\{/);
});

test('createApp switches play page modes on roll callbacks', async () => {
  const { doc } = appDocument();
  const timers = fakeTimers();
  let captured = null;
  const app = createApp({
    document: doc,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    createBannerPicker: () => ({ el: doc.createElement('div'), setBanner: () => {} }),
    createRoll: (options) => {
      captured = options;
      return {
        el: doc.createElement('div'),
        setBanner: () => {},
        loadBalance: () => {},
      };
    },
  });

  await app.init();
  assert.equal(doc.body.classList.contains('mode-hero'), true);

  const heroRoll = captured.onRollStart();
  assert.equal(doc.body.classList.contains('hero-leaving'), true);
  assert.equal(doc.body.classList.contains('mode-rolling'), false);
  timers.fireAll();
  await heroRoll;
  assert.equal(doc.body.classList.contains('mode-rolling'), true);
  assert.equal(doc.body.classList.contains('hero-leaving'), false);

  captured.onLost();
  assert.equal(doc.body.classList.contains('mode-top'), true);

  const topRoll = captured.onRollStart();
  assert.equal(doc.body.classList.contains('controls-leaving'), true);
  assert.equal(doc.body.classList.contains('mode-rolling'), false);
  timers.fireAll();
  await topRoll;
  assert.equal(doc.body.classList.contains('mode-rolling'), true);
  assert.equal(doc.body.classList.contains('controls-leaving'), false);

  captured.onCelebrateDone();
  assert.equal(doc.body.classList.contains('mode-hero'), true);

  captured.onRollFail();
  assert.equal(doc.body.classList.contains('mode-hero'), true);
});

test('createApp wires the picker, roll, and close detection', async () => {
  const { doc, status, banner, roll } = appDocument();

  const pickerEl = doc.createElement('div');
  let pickerOptions = null;
  const createBannerPicker = (options) => {
    pickerOptions = options;
    return { el: pickerEl };
  };

  const rollEl = doc.createElement('div');
  const setBannerCalls = [];
  let balanceLoads = 0;
  let rollStarts = 0;
  const createRoll = () => ({
    el: rollEl,
    setBanner: (tag) => setBannerCalls.push(tag),
    startRoll: () => {
      rollStarts += 1;
    },
    loadBalance: () => {
      balanceLoads += 1;
    },
  });

  let closeDetectionCalls = 0;
  let closeWsFactory = null;
  const createWebSocket = () => ({});
  const wireCloseDetection = (wsFactory) => {
    closeDetectionCalls += 1;
    closeWsFactory = wsFactory;
  };

  const app = createApp({
    document: doc,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    createBannerPicker,
    createRoll,
    createWebSocket,
    wireCloseDetection,
  });

  await app.init();

  assert.equal(banner.children.includes(pickerEl), true);
  assert.equal(roll.children.includes(rollEl), true);
  assert.equal(balanceLoads, 1);
  assert.equal(closeDetectionCalls, 1);
  assert.equal(closeWsFactory, createWebSocket);
  assert.equal(status.textContent, 'online');

  const tag = { label: 'hatsune miku', value: 'hatsune_miku' };
  pickerOptions.onChange(tag);
  assert.deepEqual(app.state.banner, tag);
  assert.deepEqual(setBannerCalls, [tag]);

  pickerOptions.onSubmit();
  assert.equal(rollStarts, 1);
});

test('createApp marks the status unreachable when the health check fails', async () => {
  const { doc, status } = appDocument();

  const app = createApp({
    document: doc,
    fetch: async () => {
      throw new Error('down');
    },
    createBannerPicker: () => ({ el: doc.createElement('div') }),
    createRoll: () => ({
      el: doc.createElement('div'),
      setBanner: () => {},
      loadBalance: () => {},
    }),
  });

  await app.init();

  assert.equal(status.textContent, 'unreachable');
});
