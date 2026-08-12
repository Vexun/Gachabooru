'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDocument } = require('./helpers');
const { createGallery } = require('../../public/gallery');

const entries = [
  {
    post_id: 1,
    file_path: 'hatsune_miku/1.jpg',
    banner_tag: 'hatsune_miku',
    earned_at: '2026-01-01T00:00:00.000Z',
    danbooru_url: 'https://danbooru.donmai.us/posts/1',
  },
  {
    post_id: 2,
    file_path: 'hatsune_miku/2.jpg',
    banner_tag: 'hatsune_miku',
    earned_at: '2026-01-02T00:00:00.000Z',
    danbooru_url: 'https://danbooru.donmai.us/posts/2',
  },
];

function fakeFetch(handler) {
  return async (url, opts = {}) => handler(url, opts);
}

function makeGallery(t, fetchImpl) {
  const { doc } = createDocument();
  const gallery = createGallery({ document: doc, fetch: fetchImpl });
  return { gallery, doc };
}

test('renders a grid of earned images', async (t) => {
  const { gallery } = makeGallery(
    t,
    fakeFetch(async () => ({ ok: true, status: 200, json: async () => ({ entries }) })),
  );

  await gallery.load();

  const items = gallery.el.querySelectorAll('.gallery-item');
  assert.equal(items.length, 2);
  assert.equal(items[0].querySelector('img').src, '/collections/hatsune_miku/1.jpg');
  assert.equal(items[0].dataset.postId, '1');
});

test('shows an empty state when there are no items', async (t) => {
  const { gallery } = makeGallery(
    t,
    fakeFetch(async () => ({ ok: true, status: 200, json: async () => ({ entries: [] }) })),
  );

  await gallery.load();

  const emptyEl = gallery.el.querySelector('.gallery-empty');
  assert.equal(emptyEl.hidden, false);
  assert.match(emptyEl.textContent, /Nothing collected/);
  assert.equal(gallery.el.querySelectorAll('.gallery-item').length, 0);
});

test('clicking an item opens the full-size view', async (t) => {
  const { gallery } = makeGallery(
    t,
    fakeFetch(async () => ({ ok: true, status: 200, json: async () => ({ entries }) })),
  );
  await gallery.load();

  gallery.el.querySelectorAll('.gallery-item')[1].click();

  assert.equal(gallery.isDetailOpen(), true);
  const img = gallery.el.querySelector('.gallery-detail-img');
  assert.equal(img.src, '/collections/hatsune_miku/2.jpg');
  assert.equal(gallery.getDetail().post_id, 2);
  assert.equal(gallery.el.querySelector('.gallery-post-link').href, 'https://danbooru.donmai.us/posts/2');
});

test('deleting requires confirmation and removes the item', async (t) => {
  let deleted = null;
  const { gallery } = makeGallery(
    t,
    fakeFetch(async (url, opts) => {
      if (opts.method === 'DELETE') {
        deleted = url;
        return { ok: true, status: 200, json: async () => ({ removed: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ entries }) };
    }),
  );
  await gallery.load();
  gallery.el.querySelectorAll('.gallery-item')[0].click();

  const deleteBtn = gallery.el.querySelector('.gallery-delete');
  deleteBtn.click();
  assert.equal(deleteBtn.textContent, 'Confirm delete?');
  assert.equal(gallery.isDetailOpen(), true);

  deleteBtn.click();

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(deleted, '/api/earned/1');
  assert.equal(gallery.isDetailOpen(), false);
  assert.equal(gallery.getItems().length, 1);
  assert.equal(gallery.el.querySelectorAll('.gallery-item').length, 1);
});

test('closing the detail view hides it without deleting', async (t) => {
  const { gallery } = makeGallery(
    t,
    fakeFetch(async () => ({ ok: true, status: 200, json: async () => ({ entries }) })),
  );
  await gallery.load();
  gallery.el.querySelectorAll('.gallery-item')[0].click();

  gallery.el.querySelector('.gallery-close').click();

  assert.equal(gallery.isDetailOpen(), false);
  assert.equal(gallery.getItems().length, 2);
});
