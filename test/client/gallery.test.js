'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDocument } = require('./helpers');
const { createGallery } = require('../../public/gallery');

function entry(postId, earnedAt) {
  return {
    post_id: postId,
    file_path: `hatsune_miku/${postId}.jpg`,
    banner_tag: 'hatsune_miku',
    earned_at: earnedAt,
    danbooru_url: `https://danbooru.donmai.us/posts/${postId}`,
  };
}

function fakeFetch(handler) {
  return async (url, opts = {}) => handler(url, opts);
}

function paginatedFetch(allEntries, pageSize) {
  return fakeFetch(async (url, opts) => {
    if (opts.method === 'DELETE') {
      return { ok: true, status: 200, json: async () => ({ removed: true }) };
    }
    const parsed = new URL(url, 'http://localhost');
    const page = Number(parsed.searchParams.get('page')) || 1;
    const start = (page - 1) * pageSize;
    const entries = allEntries.slice(start, start + pageSize);
    return {
      ok: true,
      status: 200,
      json: async () => ({ entries, page, limit: pageSize, total: allEntries.length }),
    };
  });
}

function makeGallery(t, fetchImpl, pageSize = 2) {
  const { doc } = createDocument();
  const gallery = createGallery({ document: doc, fetch: fetchImpl, pageSize });
  return { gallery, doc };
}

const twoEntries = [entry(1, '2026-01-01T00:00:00.000Z'), entry(2, '2026-01-02T00:00:00.000Z')];

test('renders a grid of earned images', async (t) => {
  const { gallery } = makeGallery(t, paginatedFetch(twoEntries, 2), 2);

  await gallery.load();

  const items = gallery.el.querySelectorAll('.gallery-item');
  assert.equal(items.length, 2);
  assert.equal(items[0].querySelector('img').src, '/collections/hatsune_miku/1.jpg');
  assert.equal(items[0].dataset.postId, '1');
});

test('hides the load more button when everything fits on one page', async (t) => {
  const { gallery } = makeGallery(t, paginatedFetch(twoEntries, 2), 2);

  await gallery.load();

  assert.equal(gallery.el.querySelector('.gallery-more').hidden, true);
});

test('shows an empty state when there are no items', async (t) => {
  const { gallery } = makeGallery(t, paginatedFetch([], 2), 2);

  await gallery.load();

  const emptyEl = gallery.el.querySelector('.gallery-empty');
  assert.equal(emptyEl.hidden, false);
  assert.match(emptyEl.textContent, /Nothing collected/);
  assert.equal(gallery.el.querySelectorAll('.gallery-item').length, 0);
});

test('loads more pages and appends cards', async (t) => {
  const all = [1, 2, 3, 4, 5].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);

  await gallery.load();
  assert.equal(gallery.getItems().length, 2);
  const moreBtn = gallery.el.querySelector('.gallery-more');
  assert.equal(moreBtn.hidden, false);

  await gallery.loadMore();
  assert.equal(gallery.getItems().length, 4);
  assert.equal(moreBtn.hidden, false);

  await gallery.loadMore();
  assert.equal(gallery.getItems().length, 5);
  assert.equal(moreBtn.hidden, true);
  assert.equal(gallery.el.querySelectorAll('.gallery-item').length, 5);
});

test('load resets to the first page', async (t) => {
  const all = [1, 2, 3].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);

  await gallery.load();
  await gallery.loadMore();
  assert.equal(gallery.getItems().length, 3);

  await gallery.load();
  assert.equal(gallery.getItems().length, 2);
  assert.equal(gallery.getItems()[0].post_id, 1);
});

test('clicking an item opens the full-size view', async (t) => {
  const { gallery } = makeGallery(t, paginatedFetch(twoEntries, 2), 2);
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
      return { ok: true, status: 200, json: async () => ({ entries: twoEntries, page: 1, limit: 2, total: 2 }) };
    }),
    2,
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
  const { gallery } = makeGallery(t, paginatedFetch(twoEntries, 2), 2);
  await gallery.load();
  gallery.el.querySelectorAll('.gallery-item')[0].click();

  gallery.el.querySelector('.gallery-close').click();

  assert.equal(gallery.isDetailOpen(), false);
  assert.equal(gallery.getItems().length, 2);
});

test('prev and next buttons move through the images', async (t) => {
  const all = [1, 2].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();

  gallery.openDetail(all[0]);

  gallery.el.querySelector('.gallery-next').click();
  assert.equal(gallery.getDetailIndex(), 1);
  assert.equal(gallery.getDetail().post_id, 2);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '2 of 2');

  gallery.el.querySelector('.gallery-prev').click();
  assert.equal(gallery.getDetailIndex(), 0);
  assert.equal(gallery.getDetail().post_id, 1);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '1 of 2');
});

test('arrow keys navigate and Escape closes the detail view', async (t) => {
  const all = [1, 2].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery, doc } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();

  gallery.openDetail(all[0]);
  assert.equal(gallery.isDetailOpen(), true);

  doc.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
  assert.equal(gallery.getDetailIndex(), 1);

  doc.dispatchEvent({ type: 'keydown', key: 'ArrowLeft' });
  assert.equal(gallery.getDetailIndex(), 0);

  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(gallery.isDetailOpen(), false);

  doc.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
  assert.equal(gallery.getDetailIndex(), -1);
});

test('next at the end of a page loads more and continues', async (t) => {
  const all = [1, 2, 3, 4].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();

  gallery.openDetail(all[0]);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '1 of 4');

  await gallery.goNext();
  assert.equal(gallery.getDetailIndex(), 1);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '2 of 4');

  await gallery.goNext();
  assert.equal(gallery.getDetailIndex(), 2);
  assert.equal(gallery.getDetail().post_id, 3);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '3 of 4');

  await gallery.goNext();
  assert.equal(gallery.getDetailIndex(), 3);
  assert.equal(gallery.getDetail().post_id, 4);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '4 of 4');
});

test('prev is disabled at the first image', async (t) => {
  const { gallery } = makeGallery(t, paginatedFetch(twoEntries, 2), 2);
  await gallery.load();

  gallery.openDetail(twoEntries[0]);
  const prevBtn = gallery.el.querySelector('.gallery-prev');
  assert.equal(prevBtn.disabled, true);

  await gallery.goPrev();
  assert.equal(gallery.getDetailIndex(), 0);
});

test('next is disabled at the last image when everything is loaded', async (t) => {
  const { gallery } = makeGallery(t, paginatedFetch(twoEntries, 2), 2);
  await gallery.load();

  gallery.openDetail(twoEntries[1]);
  const nextBtn = gallery.el.querySelector('.gallery-next');
  assert.equal(nextBtn.disabled, true);

  await gallery.goNext();
  assert.equal(gallery.getDetailIndex(), 1);
});
