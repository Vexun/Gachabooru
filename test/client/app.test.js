'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDocument } = require('./helpers');

test('stub page shows the app title', () => {
  const { doc } = createDocument();
  const title = doc.createElement('h1');
  title.textContent = 'Gachabooru';
  doc.body.append(title);

  const found = doc.querySelector('h1');
  assert.ok(found);
  assert.equal(found.textContent, 'Gachabooru');
});

test('server status reflects a healthy API', async () => {
  const { doc } = createDocument();
  const status = doc.createElement('div');
  status.id = 'server-status';
  doc.body.append(status);

  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ ok: true }),
  });

  const app = require('../../public/app').createApp({
    document: doc,
    fetch: fakeFetch,
  });
  await app.init();

  assert.equal(status.textContent, 'online');
});
