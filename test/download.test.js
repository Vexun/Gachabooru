'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { Downloader, safeExt, safeTag } = require('../server/download');
const { tempDir } = require('./helpers');

function arrayBufferOf(str) {
  return new TextEncoder().encode(str).buffer;
}

function okFetch(body) {
  return async () => ({ ok: true, status: 200, arrayBuffer: async () => arrayBufferOf(body) });
}

function post(id, ext = 'jpg') {
  return {
    id,
    file_ext: ext,
    file_url: `https://cdn.donmai.us/${id}.${ext}`,
    tag_string: `tag_${id}`,
  };
}

function freshState() {
  return { earned_posts: [], pending_downloads: [] };
}

test('safeExt sanitizes the file extension', () => {
  assert.equal(safeExt('jpg'), 'jpg');
  assert.equal(safeExt('JPEG'), 'jpeg');
  assert.equal(safeExt('bad<ext>'), 'badext');
  assert.equal(safeExt(''), 'jpg');
  assert.equal(safeExt(undefined), 'jpg');
});

test('safeTag prevents path traversal in banner tags', () => {
  assert.equal(safeTag('hatsune_miku'), 'hatsune_miku');
  assert.equal(safeTag('../../etc'), '______etc');
  assert.equal(safeTag('../tag'), '___tag');
  assert.equal(safeTag(''), 'untagged');
});

test('safeTag preserves Unicode letters in banner tags', () => {
  assert.equal(safeTag('初音ミク'), '初音ミク');
  assert.equal(safeTag('café'), 'café');
  assert.equal(safeTag('白雪姫'), '白雪姫');
});

test('safeTag replaces non-letter characters in banner tags with underscores', () => {
  assert.equal(safeTag('hatsune miku'), 'hatsune_miku');
  assert.equal(safeTag('test 初音 miku'), 'test_初音_miku');
  assert.equal(safeTag('🎨'), '_');
  assert.equal(safeTag('tag!x'), 'tag_x');
});

test('pathFor builds a Unicode-safe collection path', () => {
  const downloader = new Downloader({ collectionsDir: tempDir() });
  const aPost = post(42);

  assert.equal(downloader.pathFor(aPost, '初音ミク'), path.join('初音ミク', '42.jpg'));
  assert.equal(downloader.pathFor(aPost, '../../etc'), path.join('______etc', '42.jpg'));
});

test('bank downloads the file and records metadata', async () => {
  const dir = tempDir();
  const downloader = new Downloader({ collectionsDir: dir, fetchImpl: okFetch('imgdata') });
  const state = freshState();

  const result = await downloader.bank(state, { post: post(123), bannerTag: 'hatsune_miku' });

  assert.equal(result.downloaded, true);
  const fullPath = path.join(dir, 'hatsune_miku', '123.jpg');
  assert.equal(fs.readFileSync(fullPath, 'utf8'), 'imgdata');
  assert.equal(state.earned_posts.length, 1);
  const entry = state.earned_posts[0];
  assert.equal(entry.post_id, 123);
  assert.equal(entry.banner_tag, 'hatsune_miku');
  assert.equal(entry.file_path, path.join('hatsune_miku', '123.jpg'));
  assert.equal(entry.danbooru_url, 'https://danbooru.donmai.us/posts/123');
  assert.equal(entry.tags, 'tag_123');
  assert.equal(state.pending_downloads.length, 0);
});

test('bank retries on failure then writes the file', async () => {
  const dir = tempDir();
  let attempts = 0;
  const downloader = new Downloader({
    collectionsDir: dir,
    backoffMs: 0,
    retries: 2,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return { ok: false, status: 403 };
      }
      return { ok: true, status: 200, arrayBuffer: async () => arrayBufferOf('retried') };
    },
  });
  const state = freshState();

  const result = await downloader.bank(state, { post: post(9), bannerTag: 'touhou' });

  assert.equal(result.downloaded, true);
  assert.ok(attempts >= 2);
  assert.equal(fs.readFileSync(path.join(dir, 'touhou', '9.jpg'), 'utf8'), 'retried');
});

test('bank queues a failed download and keeps the metadata', async () => {
  const dir = tempDir();
  const downloader = new Downloader({
    collectionsDir: dir,
    backoffMs: 0,
    retries: 0,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  const state = freshState();

  const result = await downloader.bank(state, { post: post(5), bannerTag: 'tag' });

  assert.equal(result.downloaded, false);
  assert.equal(result.queued, true);
  assert.equal(state.earned_posts.length, 1);
  assert.equal(state.pending_downloads.length, 1);
  assert.equal(state.pending_downloads[0].post_id, 5);
  assert.equal(fs.existsSync(path.join(dir, 'tag', '5.jpg')), false);
});

test('bank is idempotent per post', async () => {
  const dir = tempDir();
  let downloads = 0;
  const downloader = new Downloader({
    collectionsDir: dir,
    backoffMs: 0,
    fetchImpl: async () => {
      downloads += 1;
      return { ok: true, status: 200, arrayBuffer: async () => arrayBufferOf('x') };
    },
  });
  const state = freshState();

  const first = await downloader.bank(state, { post: post(1), bannerTag: 'a' });
  const second = await downloader.bank(state, { post: post(1), bannerTag: 'a' });

  assert.equal(first.downloaded, true);
  assert.equal(second.already, true);
  assert.equal(state.earned_posts.length, 1);
  assert.equal(downloads, 1);
});

test('fetchBuffer returns the bytes and retries on failure', async () => {
  let attempts = 0;
  const downloader = new Downloader({
    collectionsDir: tempDir(),
    backoffMs: 0,
    retries: 2,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return { ok: false, status: 403 };
      }
      return { ok: true, status: 200, arrayBuffer: async () => arrayBufferOf('proxied') };
    },
  });

  const buffer = await downloader.fetchBuffer('https://cdn.donmai.us/x.jpg');
  assert.equal(buffer.toString('utf8'), 'proxied');
  assert.ok(attempts >= 2);
});

test('bank retries a missing file for an already-earned post', async () => {
  const dir = tempDir();
  let downloads = 0;
  const downloader = new Downloader({
    collectionsDir: dir,
    backoffMs: 0,
    retries: 0,
    fetchImpl: async () => {
      downloads += 1;
      return { ok: true, status: 200, arrayBuffer: async () => arrayBufferOf('y') };
    },
  });
  const state = freshState();

  const first = await downloader.bank(state, { post: post(2), bannerTag: 'b' });
  assert.equal(first.downloaded, true);
  fs.rmSync(path.join(dir, 'b', '2.jpg'));

  const retry = await downloader.bank(state, { post: post(2), bannerTag: 'b' });
  assert.equal(retry.downloaded, true);
  assert.equal(fs.existsSync(path.join(dir, 'b', '2.jpg')), true);
  assert.equal(state.earned_posts.length, 1);
});

test('drainPending retries queued downloads and clears them on success', async () => {
  const dir = tempDir();
  const downloader = new Downloader({
    collectionsDir: dir,
    backoffMs: 0,
    retries: 0,
    fetchImpl: okFetch('landed'),
  });
  const state = freshState();
  state.earned_posts = [{ post_id: 7, file_path: 'tag/7.jpg', earned_at: '2026-01-01T00:00:00.000Z' }];
  state.pending_downloads = [{ post_id: 7, post: post(7), banner_tag: 'tag' }];

  const result = await downloader.drainPending(state);

  assert.deepEqual(result, { retried: 1, remaining: 0 });
  assert.equal(fs.readFileSync(path.join(dir, 'tag', '7.jpg'), 'utf8'), 'landed');
  assert.equal(state.pending_downloads.length, 0);
});

test('drainPending keeps queued items that still fail', async () => {
  const dir = tempDir();
  const downloader = new Downloader({
    collectionsDir: dir,
    backoffMs: 0,
    retries: 0,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  const state = freshState();
  state.earned_posts = [
    { post_id: 8, file_path: 'tag/8.jpg', earned_at: '2026-01-01T00:00:00.000Z' },
    { post_id: 9, file_path: 'tag/9.jpg', earned_at: '2026-01-01T00:00:00.000Z' },
  ];
  state.pending_downloads = [
    { post_id: 8, post: post(8), banner_tag: 'tag' },
    { post_id: 9, post: post(9), banner_tag: 'tag' },
  ];

  const result = await downloader.drainPending(state);

  assert.deepEqual(result, { retried: 0, remaining: 2 });
  assert.equal(state.pending_downloads.length, 2);
  assert.equal(state.earned_posts.length, 2);
  assert.equal(fs.existsSync(path.join(dir, 'tag', '8.jpg')), false);
  assert.equal(fs.existsSync(path.join(dir, 'tag', '9.jpg')), false);
});

test('drainPending is a no-op with an empty queue', async () => {
  const downloader = new Downloader({
    collectionsDir: tempDir(),
    fetchImpl: async () => {
      throw new Error('should not be called');
    },
  });
  const state = freshState();

  const result = await downloader.drainPending(state);

  assert.deepEqual(result, { retried: 0, remaining: 0 });
});
