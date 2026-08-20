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

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

test('hides the pager when everything fits on one page', async (t) => {
  const { gallery } = makeGallery(t, paginatedFetch(twoEntries, 2), 2);

  await gallery.load();

  assert.equal(gallery.el.querySelector('.gallery-pager').hidden, true);
});

test('shows an empty state when there are no items', async (t) => {
  const { gallery } = makeGallery(t, paginatedFetch([], 2), 2);

  await gallery.load();

  const emptyEl = gallery.el.querySelector('.gallery-empty');
  assert.equal(emptyEl.hidden, false);
  assert.match(emptyEl.textContent, /Nothing collected/);
  assert.equal(gallery.el.querySelectorAll('.gallery-item').length, 0);
  assert.equal(gallery.el.querySelector('.gallery-pager').hidden, true);
});

test('defaults to 20 images per page', async () => {
  const { doc } = createDocument();
  const urls = [];
  const all = Array.from({ length: 25 }, (_, i) => entry(i + 1, '2026-01-01T00:00:00.000Z'));
  const gallery = createGallery({
    document: doc,
    fetch: fakeFetch(async (url) => {
      urls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ entries: all.slice(0, 20), page: 1, limit: 20, total: 25 }),
      };
    }),
  });

  await gallery.load();

  assert.match(urls[0], /limit=20/);
  assert.equal(gallery.getItems().length, 20);
  assert.equal(gallery.getPageCount(), 2);
});

test('goToPage replaces the grid with the target page', async (t) => {
  const all = [1, 2, 3, 4].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();
  assert.deepEqual(gallery.getItems().map((e) => e.post_id), [1, 2]);

  await gallery.goToPage(2);

  assert.equal(gallery.getPage(), 2);
  assert.deepEqual(gallery.getItems().map((e) => e.post_id), [3, 4]);
  assert.equal(gallery.el.querySelectorAll('.gallery-item').length, 2);
});

test('the pager disables the edge buttons at the boundaries', async (t) => {
  const all = [1, 2, 3, 4].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();

  const pager = gallery.el.querySelector('.gallery-pager');
  assert.equal(pager.hidden, false);
  assert.equal(pager.querySelector('.pager-first').disabled, true);
  assert.equal(pager.querySelector('.pager-prev').disabled, true);
  assert.equal(pager.querySelector('.pager-next').disabled, false);
  assert.equal(pager.querySelector('.pager-last').disabled, false);

  await gallery.goToPage(2);

  assert.equal(pager.querySelector('.pager-first').disabled, false);
  assert.equal(pager.querySelector('.pager-prev').disabled, false);
  assert.equal(pager.querySelector('.pager-next').disabled, true);
  assert.equal(pager.querySelector('.pager-last').disabled, true);
});

test('page numbers mark the current page and jump on click', async (t) => {
  const all = [1, 2, 3, 4].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();

  const numbers = gallery.el.querySelectorAll('.page-number');
  assert.equal(numbers.length, 2);
  assert.equal(numbers[0].classList.contains('page-current'), true);
  assert.equal(numbers[0].getAttribute('aria-current'), 'page');
  assert.equal(numbers[1].classList.contains('page-current'), false);

  numbers[1].click();
  await settle();

  assert.equal(gallery.getPage(), 2);
});

test('the pager window keeps the first and last pages with ellipses', async (t) => {
  const all = Array.from({ length: 16 }, (_, i) => entry(i + 1, '2026-01-01T00:00:00.000Z'));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();
  await gallery.goToPage(4);

  const numbers = [...gallery.el.querySelectorAll('.page-number')].map((b) => b.textContent);
  assert.deepEqual(numbers, ['1', '2', '3', '4', '5', '6', '8']);
  assert.equal(gallery.el.querySelectorAll('.pager-ellipsis').length, 1);
});

test('the skip buttons jump to the first and last page', async (t) => {
  const all = Array.from({ length: 16 }, (_, i) => entry(i + 1, '2026-01-01T00:00:00.000Z'));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();

  gallery.el.querySelector('.pager-last').click();
  await settle();
  assert.equal(gallery.getPage(), 8);
  assert.deepEqual(gallery.getItems().map((e) => e.post_id), [15, 16]);

  gallery.el.querySelector('.pager-first').click();
  await settle();
  assert.equal(gallery.getPage(), 1);
  assert.deepEqual(gallery.getItems().map((e) => e.post_id), [1, 2]);
});

test('the next and previous pager buttons move one page', async (t) => {
  const all = [1, 2, 3, 4].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();

  gallery.el.querySelector('.pager-next').click();
  await settle();
  assert.equal(gallery.getPage(), 2);

  gallery.el.querySelector('.pager-prev').click();
  await settle();
  assert.equal(gallery.getPage(), 1);
});

test('load resets to the first page', async (t) => {
  const all = [1, 2, 3].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);

  await gallery.load();
  await gallery.goToPage(2);
  assert.equal(gallery.getItems().length, 1);

  await gallery.load();

  assert.equal(gallery.getPage(), 1);
  assert.equal(gallery.getItems().length, 2);
  assert.equal(gallery.getItems()[0].post_id, 1);
});

test('marks images with a pending badge when the file is missing', async (t) => {
  const ok = { ...entry(4, '2026-01-04T00:00:00.000Z'), downloaded: true };
  const pending = { ...entry(3, '2026-01-03T00:00:00.000Z'), downloaded: false };
  const { gallery } = makeGallery(t, paginatedFetch([ok, pending], 2), 2);

  await gallery.load();

  const items = gallery.el.querySelectorAll('.gallery-item');
  assert.equal(items.length, 2);
  assert.equal(items[0].querySelector('.gallery-pending-chip'), null);
  const chip = items[1].querySelector('.gallery-pending-chip');
  assert.equal(chip.textContent, 'pending');
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

test('deleting requires confirmation and refreshes the page', async (t) => {
  let deleted = null;
  let entries = [entry(1, '2026-01-01T00:00:00.000Z'), entry(2, '2026-01-02T00:00:00.000Z')];
  const { gallery } = makeGallery(
    t,
    fakeFetch(async (url, opts) => {
      if (opts.method === 'DELETE') {
        deleted = url;
        entries = entries.filter((e) => e.post_id !== 1);
        return { ok: true, status: 200, json: async () => ({ removed: true }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ entries, page: 1, limit: 2, total: entries.length }),
      };
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
  assert.deepEqual(gallery.getItems().map((e) => e.post_id), [2]);
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

test('next at the end of a page loads the next page and continues', async (t) => {
  const all = [1, 2, 3, 4].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();

  gallery.openDetail(all[0]);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '1 of 4');

  await gallery.goNext();
  assert.equal(gallery.getDetailIndex(), 1);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '2 of 4');

  await gallery.goNext();
  assert.equal(gallery.getPage(), 2);
  assert.equal(gallery.getDetailIndex(), 0);
  assert.equal(gallery.getDetail().post_id, 3);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '3 of 4');

  await gallery.goNext();
  assert.equal(gallery.getDetailIndex(), 1);
  assert.equal(gallery.getDetail().post_id, 4);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '4 of 4');
});

test('prev at the start of a page loads the previous page from its end', async (t) => {
  const all = [1, 2, 3, 4].map((id) => entry(id, `2026-01-0${id}T00:00:00.000Z`));
  const { gallery } = makeGallery(t, paginatedFetch(all, 2), 2);
  await gallery.load();
  await gallery.goToPage(2);

  gallery.openDetail(all[2]);
  assert.equal(gallery.getDetailIndex(), 0);

  await gallery.goPrev();

  assert.equal(gallery.getPage(), 1);
  assert.equal(gallery.getDetailIndex(), 1);
  assert.equal(gallery.getDetail().post_id, 2);
  assert.equal(gallery.el.querySelector('.gallery-counter').textContent, '2 of 4');
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
