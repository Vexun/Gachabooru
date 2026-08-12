'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDocument } = require('./helpers');

const { createCollectionPage } = require('../../public/collection');

test('mounts the gallery and loads it on init', async () => {
  const { doc } = createDocument();
  const section = doc.createElement('section');
  section.id = 'gallery-section';
  doc.body.append(section);

  let loaded = 0;
  const gallery = {
    el: doc.createElement('div'),
    load: () => {
      loaded += 1;
    },
  };

  const page = createCollectionPage({
    document: doc,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    createGallery: () => gallery,
    createWebSocket: () => {},
    wireCloseDetection: () => {},
  });

  assert.equal(section.children.includes(gallery.el), true);

  await page.init();
  assert.equal(loaded, 1);
});

test('opens the close-detection websocket on init', async () => {
  const { doc } = createDocument();
  const section = doc.createElement('section');
  section.id = 'gallery-section';
  doc.body.append(section);

  let closedConnected = false;
  const page = createCollectionPage({
    document: doc,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    createGallery: () => ({ el: doc.createElement('div'), load: () => {} }),
    createWebSocket: () => {},
    wireCloseDetection: () => {
      closedConnected = true;
    },
  });

  await page.init();
  assert.equal(closedConnected, true);
});
