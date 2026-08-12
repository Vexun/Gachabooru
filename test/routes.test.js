'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../server/index');
const { tempDir, startServer } = require('./helpers');

test('GET /api/health returns 200', async (t) => {
  const app = createApp({ dataDir: tempDir(), collectionsDir: tempDir() }).app;
  const base = await startServer(t, app);

  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, { ok: true });
});

test('serves the static client page', async (t) => {
  const app = createApp({ dataDir: tempDir(), collectionsDir: tempDir() }).app;
  const base = await startServer(t, app);

  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Gachabooru/);
});

function makeApp(t, overrides) {
  const app = createApp({
    dataDir: tempDir(),
    collectionsDir: tempDir(),
    ...overrides,
  }).app;
  return startServer(t, app);
}

test('GET /api/autocomplete returns mapped results', async (t) => {
  const base = await makeApp(t, {
    danbooru: {
      autocomplete: async () => [
        { value: 'hatsune_miku', label: 'hatsune miku', category: 4, post_count: 100 },
      ],
    },
  });

  const res = await fetch(`${base}/api/autocomplete?q=hatsune`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.results, [
    { value: 'hatsune_miku', label: 'hatsune miku', category: 4, post_count: 100 },
  ]);
});

test('GET /api/autocomplete rejects an empty query with 422', async (t) => {
  const base = await makeApp(t, { danbooru: { autocomplete: async () => [] } });

  const res = await fetch(`${base}/api/autocomplete?q=`);
  assert.equal(res.status, 422);
});

test('GET /api/autocomplete returns 502 on upstream failure', async (t) => {
  const base = await makeApp(t, {
    danbooru: {
      autocomplete: async () => {
        throw new Error('boom');
      },
    },
  });

  const res = await fetch(`${base}/api/autocomplete?q=hatsune`);
  assert.equal(res.status, 502);
  const data = await res.json();
  assert.equal(data.error, 'upstream error');
});

const poolPosts = [
  { id: 1, file_ext: 'jpg', large_file_url: 'https://cdn/x.jpg' },
  { id: 2, file_ext: 'jpg', large_file_url: 'https://cdn/y.jpg' },
  { id: 3, file_ext: 'jpg', large_file_url: 'https://cdn/z.jpg' },
  { id: 4, file_ext: 'jpg', large_file_url: 'https://cdn/w.jpg' },
  { id: 5, file_ext: 'jpg', large_file_url: 'https://cdn/v.jpg' },
];

function poolApp(t, danbooru) {
  return makeApp(t, { danbooru });
}

test('GET /api/roll/pool returns 5 posts', async (t) => {
  const base = await poolApp(t, {
    buildRollPool: async () => ({ ok: true, pool: poolPosts }),
  });

  const res = await fetch(`${base}/api/roll/pool?tag=hatsune_miku`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.posts.length, 5);
});

test('GET /api/roll/pool excludes earned posts', async (t) => {
  let seenEarned = null;
  const dataDir = tempDir();
  const store = require('../server/state').StateStore;
  const s = new store(`${dataDir}/state.json`);
  s.get().earned_posts = [{ post_id: 42 }, { post_id: 77 }];
  s.save();

  const base = await startServer(
    t,
    createApp({
      dataDir,
      collectionsDir: tempDir(),
      danbooru: {
        buildRollPool: async ({ earnedIds }) => {
          seenEarned = earnedIds;
          return { ok: true, pool: poolPosts };
        },
      },
    }).app,
  );

  const res = await fetch(`${base}/api/roll/pool?tag=hatsune_miku`);
  assert.equal(res.status, 200);
  assert.deepEqual(seenEarned, [42, 77]);
});

test('GET /api/roll/pool blocks the roll when the pool is insufficient', async (t) => {
  const base = await poolApp(t, {
    buildRollPool: async () => ({ ok: false, reason: 'insufficient' }),
  });

  const res = await fetch(`${base}/api/roll/pool?tag=tiny_tag`);
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.error, 'insufficient pool');
});

test('GET /api/roll/pool rejects a missing tag with 422', async (t) => {
  const base = await poolApp(t, {
    buildRollPool: async () => ({ ok: true, pool: poolPosts }),
  });

  const res = await fetch(`${base}/api/roll/pool?tag=`);
  assert.equal(res.status, 422);
});

test('GET /api/roll/pool returns 502 on upstream failure', async (t) => {
  const base = await poolApp(t, {
    buildRollPool: async () => {
      throw new Error('boom');
    },
  });

  const res = await fetch(`${base}/api/roll/pool?tag=hatsune_miku`);
  assert.equal(res.status, 502);
});

function bankApp(t, downloader) {
  return makeApp(t, {
    danbooru: { buildRollPool: async () => ({ ok: true, pool: [] }) },
    downloader,
  });
}

const bankPost = {
  id: 100,
  file_ext: 'jpg',
  file_url: 'https://cdn.donmai.us/100.jpg',
  tag_string: 'hatsune_miku',
};

test('POST /api/roll/:postId banks the image and triggers a download', async (t) => {
  let banked = null;
  const downloader = {
    bank: async (state, args) => {
      banked = args;
      state.earned_posts.push({ post_id: args.post.id });
      return { entry: { post_id: args.post.id }, downloaded: true };
    },
  };
  const base = await bankApp(t, downloader);

  const res = await fetch(`${base}/api/roll/100`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: bankPost, banner_tag: 'hatsune_miku' }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.downloaded, true);
  assert.equal(banked.post.id, 100);
  assert.equal(banked.bannerTag, 'hatsune_miku');
});

test('POST /api/roll/:postId is idempotent per post', async (t) => {
  const dataDir = tempDir();
  const state = new (require('../server/state').StateStore)(`${dataDir}/state.json`);
  state.get().earned_posts = [{ post_id: 100 }];
  state.save();

  let calls = 0;
  const downloader = {
    bank: async () => {
      calls += 1;
      return { entry: { post_id: 100 }, downloaded: true, already: true };
    },
  };
  const base = await startServer(
    t,
    createApp({
      dataDir,
      collectionsDir: tempDir(),
      danbooru: { buildRollPool: async () => ({ ok: true, pool: [] }) },
      downloader,
    }).app,
  );

  const body = { post: bankPost, banner_tag: 'hatsune_miku' };
  await fetch(`${base}/api/roll/100`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await fetch(`${base}/api/roll/100`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  assert.equal(calls, 2);
  assert.equal(state.get().earned_posts.length, 1);
});

test('POST /api/roll/:postId rejects an unknown or mismatched post', async (t) => {
  const downloader = { bank: async () => ({ downloaded: false }) };
  const base = await bankApp(t, downloader);

  const res = await fetch(`${base}/api/roll/999`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: bankPost, banner_tag: 'hatsune_miku' }),
  });
  assert.equal(res.status, 422);
});

test('POST /api/roll/:postId rejects a missing banner tag', async (t) => {
  const downloader = { bank: async () => ({ downloaded: false }) };
  const base = await bankApp(t, downloader);

  const res = await fetch(`${base}/api/roll/100`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: bankPost }),
  });
  assert.equal(res.status, 422);
});

test('POST /api/roll/:postId sanitizes a path-traversal banner tag before banking', async (t) => {
  let bankedBannerTag = null;
  const downloader = {
    bank: async (state, args) => {
      bankedBannerTag = args.bannerTag;
      return { entry: { post_id: args.post.id }, downloaded: true };
    },
  };
  const base = await bankApp(t, downloader);

  const res = await fetch(`${base}/api/roll/100`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: bankPost, banner_tag: '../../etc' }),
  });

  assert.equal(res.status, 200);
  assert.equal(bankedBannerTag, '______etc');
});

test('POST /api/roll/:postId stores the sanitized banner tag in metadata', async (t) => {
  let bankedBannerTag = null;
  const downloader = {
    bank: async (state, args) => {
      bankedBannerTag = args.bannerTag;
      return { entry: { post_id: args.post.id }, downloaded: true };
    },
  };
  const base = await bankApp(t, downloader);

  const res = await fetch(`${base}/api/roll/100`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: bankPost, banner_tag: 'hatsune_miku_(cosplay)' }),
  });

  assert.equal(res.status, 200);
  assert.equal(bankedBannerTag, 'hatsune_miku__cosplay_');
});

test('a hostile banner tag cannot write outside the collections directory', async (t) => {
  const collectionsDir = tempDir();
  const downloader = new (require('../server/download').Downloader)({
    collectionsDir,
    backoffMs: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode('img').buffer,
    }),
  });
  const base = await startServer(
    t,
    createApp({
      dataDir: tempDir(),
      collectionsDir,
      danbooru: { buildRollPool: async () => ({ ok: true, pool: [] }) },
      downloader,
    }).app,
  );

  const res = await fetch(`${base}/api/roll/100`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: bankPost, banner_tag: '../../etc' }),
  });
  assert.equal(res.status, 200);

  assert.equal(fs.existsSync(path.join(collectionsDir, '______etc', '100.jpg')), true);
  assert.equal(fs.existsSync(path.join(collectionsDir, '..', 'etc', '100.jpg')), false);
  assert.equal(fs.existsSync(path.join(path.dirname(collectionsDir), 'etc', '100.jpg')), false);
});

const earnedEntries = [
  { post_id: 1, file_path: 'tag/1.jpg', banner_tag: 'tag', earned_at: '2026-01-01T00:00:00.000Z' },
  { post_id: 2, file_path: 'tag/2.jpg', banner_tag: 'tag', earned_at: '2026-01-02T00:00:00.000Z' },
];

test('GET /api/earned lists earned images with pagination metadata', async (t) => {
  const dataDir = tempDir();
  const state = new (require('../server/state').StateStore)(`${dataDir}/state.json`);
  state.get().earned_posts = earnedEntries;
  state.save();

  const base = await startServer(
    t,
    createApp({
      dataDir,
      collectionsDir: tempDir(),
      danbooru: { buildRollPool: async () => ({ ok: true, pool: [] }) },
    }).app,
  );

  const res = await fetch(`${base}/api/earned`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.entries.length, 2);
  assert.equal(data.page, 1);
  assert.equal(data.limit, 30);
  assert.equal(data.total, 2);
});

test('GET /api/earned returns newest entries first', async (t) => {
  const dataDir = tempDir();
  const state = new (require('../server/state').StateStore)(`${dataDir}/state.json`);
  state.get().earned_posts = [
    { post_id: 1, file_path: 'tag/1.jpg', earned_at: '2026-01-01T00:00:00.000Z' },
    { post_id: 2, file_path: 'tag/2.jpg', earned_at: '2026-01-05T00:00:00.000Z' },
    { post_id: 3, file_path: 'tag/3.jpg', earned_at: '2026-01-03T00:00:00.000Z' },
  ];
  state.save();

  const base = await startServer(
    t,
    createApp({
      dataDir,
      collectionsDir: tempDir(),
      danbooru: { buildRollPool: async () => ({ ok: true, pool: [] }) },
    }).app,
  );

  const data = await (await fetch(`${base}/api/earned?limit=3`)).json();
  assert.deepEqual(
    data.entries.map((e) => e.post_id),
    [2, 3, 1],
  );
});

test('GET /api/earned paginates with page and limit', async (t) => {
  const dataDir = tempDir();
  const state = new (require('../server/state').StateStore)(`${dataDir}/state.json`);
  state.get().earned_posts = [1, 2, 3, 4, 5].map((id) => ({
    post_id: id,
    file_path: `tag/${id}.jpg`,
    earned_at: `2026-01-0${id}T00:00:00.000Z`,
  }));
  state.save();

  const base = await startServer(
    t,
    createApp({
      dataDir,
      collectionsDir: tempDir(),
      danbooru: { buildRollPool: async () => ({ ok: true, pool: [] }) },
    }).app,
  );

  const page1 = await (await fetch(`${base}/api/earned?limit=2&page=1`)).json();
  assert.deepEqual(page1.entries.map((e) => e.post_id), [5, 4]);
  assert.equal(page1.total, 5);
  assert.equal(page1.page, 1);

  const page3 = await (await fetch(`${base}/api/earned?limit=2&page=3`)).json();
  assert.deepEqual(page3.entries.map((e) => e.post_id), [1]);
  assert.equal(page3.total, 5);

  const past = await (await fetch(`${base}/api/earned?limit=2&page=4`)).json();
  assert.deepEqual(past.entries, []);
  assert.equal(past.total, 5);
});

test('GET /api/earned rejects invalid pagination', async (t) => {
  const base = await startServer(
    t,
    createApp({
      dataDir: tempDir(),
      collectionsDir: tempDir(),
      danbooru: { buildRollPool: async () => ({ ok: true, pool: [] }) },
    }).app,
  );

  for (const query of ['page=0', 'page=-1', 'page=abc', 'limit=0', 'limit=300', 'limit=abc']) {
    const res = await fetch(`${base}/api/earned?${query}`);
    assert.equal(res.status, 422, `expected 422 for ${query}`);
  }
});

test('DELETE /api/earned/:postId removes the file and metadata', async (t) => {
  const dataDir = tempDir();
  const collectionsDir = tempDir();
  fs.mkdirSync(path.join(collectionsDir, 'tag'), { recursive: true });
  fs.writeFileSync(path.join(collectionsDir, 'tag', '1.jpg'), 'data');
  const state = new (require('../server/state').StateStore)(`${dataDir}/state.json`);
  state.get().earned_posts = earnedEntries;
  state.save();

  const base = await startServer(
    t,
    createApp({
      dataDir,
      collectionsDir,
      danbooru: { buildRollPool: async () => ({ ok: true, pool: [] }) },
    }).app,
  );

  const res = await fetch(`${base}/api/earned/1`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  assert.equal(fs.existsSync(path.join(collectionsDir, 'tag', '1.jpg')), false);
  const onDisk = JSON.parse(fs.readFileSync(`${dataDir}/state.json`, 'utf8'));
  assert.equal(onDisk.earned_posts.length, 1);
});

test('DELETE /api/earned/:postId returns 404 for an unknown post', async (t) => {
  const base = await startServer(
    t,
    createApp({
      dataDir: tempDir(),
      collectionsDir: tempDir(),
      danbooru: { buildRollPool: async () => ({ ok: true, pool: [] }) },
    }).app,
  );

  const res = await fetch(`${base}/api/earned/999`, { method: 'DELETE' });
  assert.equal(res.status, 404);
});

test('collections images are served statically', async (t) => {
  const collectionsDir = tempDir();
  fs.mkdirSync(path.join(collectionsDir, 'tag'), { recursive: true });
  fs.writeFileSync(path.join(collectionsDir, 'tag', '1.jpg'), 'imgbytes');

  const base = await startServer(
    t,
    createApp({
      dataDir: tempDir(),
      collectionsDir,
      danbooru: { buildRollPool: async () => ({ ok: true, pool: [] }) },
    }).app,
  );

  const res = await fetch(`${base}/collections/tag/1.jpg`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'imgbytes');
});

test('GET /api/balance returns the current balance', async (t) => {
  const base = await makeApp(t, {
    danbooru: { buildRollPool: async () => ({ ok: true, pool: poolPosts }) },
  });

  const res = await fetch(`${base}/api/balance`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.balance, 10);
});

test('pool request deducts one roll on success', async (t) => {
  const base = await makeApp(t, {
    danbooru: { buildRollPool: async () => ({ ok: true, pool: poolPosts }) },
  });

  const res = await fetch(`${base}/api/roll/pool?tag=hatsune_miku`);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.balance, 9);
  assert.equal(data.posts.length, 5);

  const bal = await (await fetch(`${base}/api/balance`)).json();
  assert.equal(bal.balance, 9);
});

test('pool request is blocked with 402 on insufficient balance', async (t) => {
  let poolCalls = 0;
  const dataDir = tempDir();
  const state = new (require('../server/state').StateStore)(`${dataDir}/state.json`);
  state.get().balance = 0;
  state.get().first_open_bonus_claimed = true;
  state.save();

  const base = await startServer(
    t,
    createApp({
      dataDir,
      collectionsDir: tempDir(),
      danbooru: {
        buildRollPool: async () => {
          poolCalls += 1;
          return { ok: true, pool: poolPosts };
        },
      },
    }).app,
  );

  const res = await fetch(`${base}/api/roll/pool?tag=hatsune_miku`);
  assert.equal(res.status, 402);
  assert.equal(poolCalls, 0);

  const bal = await (await fetch(`${base}/api/balance`)).json();
  assert.equal(bal.balance, 0);
});

test('a blocked pool does not consume a roll', async (t) => {
  const base = await makeApp(t, {
    danbooru: {
      buildRollPool: async () => ({ ok: false, reason: 'insufficient' }),
    },
  });

  const res = await fetch(`${base}/api/roll/pool?tag=tiny_tag`);
  assert.equal(res.status, 409);

  const bal = await (await fetch(`${base}/api/balance`)).json();
  assert.equal(bal.balance, 10);
});
