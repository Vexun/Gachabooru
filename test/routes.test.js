'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../server/index');
const { Downloader } = require('../server/download');
const { StateStore } = require('../server/state');
const { tempDir, startServer } = require('./helpers');

// Boots an app against fresh temp dirs, optionally seeding the state
// store first and injecting fakes. Returns everything a test needs to
// reach the API or inspect the store and collections directory.
async function bootApp(t, { state, danbooru, downloader } = {}) {
  const dataDir = tempDir();
  const collectionsDir = tempDir();
  const store = new StateStore(path.join(dataDir, 'state.json'));
  if (state) {
    Object.assign(store.get(), state);
    store.save();
  }
  // A function downloader receives the real collections directory so a
  // test can build a genuine Downloader bound to it.
  const resolvedDownloader =
    typeof downloader === 'function' ? downloader(collectionsDir) : downloader;
  const base = await startServer(
    t,
    createApp({
      dataDir,
      collectionsDir,
      danbooru: danbooru || { buildRollPool: async () => ({ ok: true, pool: [] }) },
      downloader: resolvedDownloader,
    }).app,
  );
  return { base, store, dataDir, collectionsDir };
}

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

test('responses include a restrictive Content-Security-Policy', async (t) => {
  const app = createApp({ dataDir: tempDir(), collectionsDir: tempDir() }).app;
  const base = await startServer(t, app);

  const res = await fetch(`${base}/`);
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp, 'CSP header present');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /style-src 'self'/);
  assert.match(csp, /img-src 'self' https:\/\/cdn\.donmai\.us/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /connect-src 'self' ws:\/\/127\.0\.0\.1:\d+/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
});

test('responses include security companion headers', async (t) => {
  const app = createApp({ dataDir: tempDir(), collectionsDir: tempDir() }).app;
  const base = await startServer(t, app);

  const res = await fetch(`${base}/api/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});

test('the API rate limiter returns 429 over the limit', async (t) => {
  const app = createApp({
    dataDir: tempDir(),
    collectionsDir: tempDir(),
    rateLimit: { windowMs: 1000, max: 3 },
  }).app;
  const base = await startServer(t, app);

  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${base}/api/balance`);
    assert.equal(res.status, 200);
  }
  const blocked = await fetch(`${base}/api/balance`);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  const data = await blocked.json();
  assert.equal(data.error, 'rate limit exceeded');
});

test('the API rate limiter exempts the health endpoint', async (t) => {
  const app = createApp({
    dataDir: tempDir(),
    collectionsDir: tempDir(),
    rateLimit: { windowMs: 1000, max: 2 },
  }).app;
  const base = await startServer(t, app);

  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
  }
});

test('GET /api/autocomplete returns mapped results', async (t) => {
  const { base } = await bootApp(t, {
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
  const { base } = await bootApp(t, { danbooru: { autocomplete: async () => [] } });

  const res = await fetch(`${base}/api/autocomplete?q=`);
  assert.equal(res.status, 422);
});

test('GET /api/autocomplete returns 502 on upstream failure', async (t) => {
  const { base } = await bootApp(t, {
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

test('GET /api/roll/pool returns 5 posts', async (t) => {
  const { base } = await bootApp(t, {
    danbooru: { buildRollPool: async () => ({ ok: true, pool: poolPosts }) },
  });

  const res = await fetch(`${base}/api/roll/pool?tag=hatsune_miku`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.posts.length, 5);
});

test('GET /api/roll/pool excludes earned posts', async (t) => {
  let seenEarned = null;
  const { base } = await bootApp(t, {
    state: { earned_posts: [{ post_id: 42 }, { post_id: 77 }] },
    danbooru: {
      buildRollPool: async ({ earnedIds }) => {
        seenEarned = earnedIds;
        return { ok: true, pool: poolPosts };
      },
    },
  });

  const res = await fetch(`${base}/api/roll/pool?tag=hatsune_miku`);
  assert.equal(res.status, 200);
  assert.deepEqual(seenEarned, [42, 77]);
});

test('GET /api/roll/pool blocks the roll when the pool is insufficient', async (t) => {
  const { base } = await bootApp(t, {
    danbooru: { buildRollPool: async () => ({ ok: false, reason: 'insufficient' }) },
  });

  const res = await fetch(`${base}/api/roll/pool?tag=tiny_tag`);
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.error, 'insufficient pool');
});

test('GET /api/roll/pool rejects a missing tag with 422', async (t) => {
  const { base } = await bootApp(t);

  const res = await fetch(`${base}/api/roll/pool?tag=`);
  assert.equal(res.status, 422);
});

test('GET /api/roll/pool returns 502 on upstream failure', async (t) => {
  const { base } = await bootApp(t, {
    danbooru: {
      buildRollPool: async () => {
        throw new Error('boom');
      },
    },
  });

  const res = await fetch(`${base}/api/roll/pool?tag=hatsune_miku`);
  assert.equal(res.status, 502);
});

const bankPost = {
  id: 100,
  file_ext: 'jpg',
  file_url: 'https://cdn.donmai.us/100.jpg',
  tag_string: 'hatsune_miku',
};

test('GET /api/image streams a proxied image', async (t) => {
  const downloader = {
    fetchBuffer: async (url) => {
      assert.equal(url, 'https://cdn.donmai.us/sample/abc.jpg');
      return Buffer.from('imgbytes');
    },
  };
  const { base } = await bootApp(t, { downloader });

  const res = await fetch(`${base}/api/image?url=${encodeURIComponent('https://cdn.donmai.us/sample/abc.jpg')}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/*');
  assert.equal(await res.text(), 'imgbytes');
});

test('GET /api/image rejects URLs outside the CDN allowlist', async (t) => {
  const downloader = { fetchBuffer: async () => Buffer.from('x') };
  const { base } = await bootApp(t, { downloader });

  for (const url of [
    'http://cdn.donmai.us/evil.jpg',
    'https://evil.example.com/x.jpg',
    // A subdomain of the allowed host must not pass the exact-match check.
    'https://evil.cdn.donmai.us/x.jpg',
    'file:///etc/passwd',
    'not a url',
  ]) {
    const res = await fetch(`${base}/api/image?url=${encodeURIComponent(url)}`);
    assert.equal(res.status, 400, `expected 400 for ${url}`);
  }
});

test('GET /api/image returns 502 when the upstream fetch fails', async (t) => {
  const downloader = {
    fetchBuffer: async () => {
      throw new Error('boom');
    },
  };
  const { base } = await bootApp(t, { downloader });

  const res = await fetch(`${base}/api/image?url=${encodeURIComponent('https://cdn.donmai.us/x.jpg')}`);
  assert.equal(res.status, 502);
  const data = await res.json();
  assert.equal(data.error, 'image fetch failed');
});

test('POST /api/roll/:postId banks the image and triggers a download', async (t) => {
  let banked = null;
  const { base } = await bootApp(t, {
    downloader: {
      bank: async (state, args) => {
        banked = args;
        state.earned_posts.push({ post_id: args.post.id });
        return { entry: { post_id: args.post.id }, downloaded: true };
      },
    },
  });

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
  let calls = 0;
  const { base, store } = await bootApp(t, {
    state: { earned_posts: [{ post_id: 100 }] },
    downloader: {
      bank: async () => {
        calls += 1;
        return { entry: { post_id: 100 }, downloaded: true, already: true };
      },
    },
  });

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
  assert.equal(store.get().earned_posts.length, 1);
});

test('POST /api/roll/:postId rejects an unknown or mismatched post', async (t) => {
  const { base } = await bootApp(t, { downloader: { bank: async () => ({ downloaded: false }) } });

  const res = await fetch(`${base}/api/roll/999`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: bankPost, banner_tag: 'hatsune_miku' }),
  });
  assert.equal(res.status, 422);
});

test('POST /api/roll/:postId rejects a non-integer post id', async (t) => {
  const { base } = await bootApp(t, { downloader: { bank: async () => ({ downloaded: false }) } });

  const res = await fetch(`${base}/api/roll/abc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: bankPost, banner_tag: 'hatsune_miku' }),
  });
  assert.equal(res.status, 422);
});

test('POST /api/roll/:postId rejects a missing banner tag', async (t) => {
  const { base } = await bootApp(t, { downloader: { bank: async () => ({ downloaded: false }) } });

  const res = await fetch(`${base}/api/roll/100`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: bankPost }),
  });
  assert.equal(res.status, 422);
});

test('POST /api/roll/:postId sanitizes a path-traversal banner tag before banking', async (t) => {
  let bankedBannerTag = null;
  const { base } = await bootApp(t, {
    downloader: {
      bank: async (state, args) => {
        bankedBannerTag = args.bannerTag;
        return { entry: { post_id: args.post.id }, downloaded: true };
      },
    },
  });

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
  const { base } = await bootApp(t, {
    downloader: {
      bank: async (state, args) => {
        bankedBannerTag = args.bannerTag;
        return { entry: { post_id: args.post.id }, downloaded: true };
      },
    },
  });

  const res = await fetch(`${base}/api/roll/100`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post: bankPost, banner_tag: 'hatsune_miku_(cosplay)' }),
  });

  assert.equal(res.status, 200);
  assert.equal(bankedBannerTag, 'hatsune_miku__cosplay_');
});

test('a hostile banner tag cannot write outside the collections directory', async (t) => {
  const { base, collectionsDir } = await bootApp(t, {
    downloader: (dir) =>
      new Downloader({
        collectionsDir: dir,
        backoffMs: 0,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          arrayBuffer: async () => new TextEncoder().encode('img').buffer,
        }),
      }),
  });

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

function earnedEntry(postId, day) {
  return {
    post_id: postId,
    file_path: `tag/${postId}.jpg`,
    banner_tag: 'tag',
    earned_at: `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  };
}

test('GET /api/earned lists earned images with pagination metadata', async (t) => {
  const { base } = await bootApp(t, {
    state: { earned_posts: [earnedEntry(1, 1), earnedEntry(2, 2)] },
  });

  const res = await fetch(`${base}/api/earned`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.entries.length, 2);
  assert.equal(data.page, 1);
  assert.equal(data.limit, 30);
  assert.equal(data.total, 2);
});

test('GET /api/earned returns newest entries first', async (t) => {
  const { base } = await bootApp(t, {
    state: { earned_posts: [earnedEntry(1, 1), earnedEntry(2, 5), earnedEntry(3, 3)] },
  });

  const data = await (await fetch(`${base}/api/earned?limit=3`)).json();
  assert.deepEqual(
    data.entries.map((e) => e.post_id),
    [2, 3, 1],
  );
});

test('GET /api/earned reports the downloaded flag per entry', async (t) => {
  const { base, collectionsDir } = await bootApp(t, {
    state: { earned_posts: [earnedEntry(1, 1), earnedEntry(2, 2)] },
  });
  fs.mkdirSync(path.join(collectionsDir, 'tag'), { recursive: true });
  fs.writeFileSync(path.join(collectionsDir, 'tag', '1.jpg'), 'x');

  const data = await (await fetch(`${base}/api/earned`)).json();
  const byId = Object.fromEntries(data.entries.map((e) => [e.post_id, e.downloaded]));
  assert.equal(byId[1], true);
  assert.equal(byId[2], false);
});

test('GET /api/earned paginates with page and limit', async (t) => {
  const { base } = await bootApp(t, {
    state: { earned_posts: [1, 2, 3, 4, 5].map((id) => earnedEntry(id, id)) },
  });

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
  const { base } = await bootApp(t);

  for (const query of ['page=0', 'page=-1', 'page=abc', 'limit=0', 'limit=300', 'limit=abc']) {
    const res = await fetch(`${base}/api/earned?${query}`);
    assert.equal(res.status, 422, `expected 422 for ${query}`);
  }
});

test('DELETE /api/earned/:postId removes the file and metadata', async (t) => {
  const { base, dataDir, collectionsDir } = await bootApp(t, {
    state: { earned_posts: [earnedEntry(1, 1), earnedEntry(2, 2)] },
  });
  fs.mkdirSync(path.join(collectionsDir, 'tag'), { recursive: true });
  fs.writeFileSync(path.join(collectionsDir, 'tag', '1.jpg'), 'data');

  const res = await fetch(`${base}/api/earned/1`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  assert.equal(fs.existsSync(path.join(collectionsDir, 'tag', '1.jpg')), false);
  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  assert.equal(onDisk.earned_posts.length, 1);
});

test('DELETE /api/earned/:postId returns 404 for an unknown post', async (t) => {
  const { base } = await bootApp(t);

  const res = await fetch(`${base}/api/earned/999`, { method: 'DELETE' });
  assert.equal(res.status, 404);
});

test('collections images are served statically', async (t) => {
  const { base, collectionsDir } = await bootApp(t);
  fs.mkdirSync(path.join(collectionsDir, 'tag'), { recursive: true });
  fs.writeFileSync(path.join(collectionsDir, 'tag', '1.jpg'), 'imgbytes');

  const res = await fetch(`${base}/collections/tag/1.jpg`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'imgbytes');
});

test('GET /api/balance returns the current balance', async (t) => {
  const { base } = await bootApp(t);

  const res = await fetch(`${base}/api/balance`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.balance, 50);
});

test('pool request deducts one roll on success', async (t) => {
  const { base } = await bootApp(t, {
    danbooru: { buildRollPool: async () => ({ ok: true, pool: poolPosts }) },
  });

  const res = await fetch(`${base}/api/roll/pool?tag=hatsune_miku`);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.balance, 49);
  assert.equal(data.posts.length, 5);

  const bal = await (await fetch(`${base}/api/balance`)).json();
  assert.equal(bal.balance, 49);
});

test('pool request is blocked with 402 on insufficient balance', async (t) => {
  let poolCalls = 0;
  const { base, store } = await bootApp(t, {
    state: { balance: 0, first_open_bonus_claimed: true },
    danbooru: {
      buildRollPool: async () => {
        poolCalls += 1;
        return { ok: true, pool: poolPosts };
      },
    },
  });

  const res = await fetch(`${base}/api/roll/pool?tag=hatsune_miku`);
  assert.equal(res.status, 402);
  assert.equal(poolCalls, 0);

  const bal = await (await fetch(`${base}/api/balance`)).json();
  assert.equal(bal.balance, 0);
  assert.equal(store.get().balance, 0);
});

test('a blocked pool does not consume a roll', async (t) => {
  const { base } = await bootApp(t, {
    danbooru: {
      buildRollPool: async () => ({ ok: false, reason: 'insufficient' }),
    },
  });

  const res = await fetch(`${base}/api/roll/pool?tag=tiny_tag`);
  assert.equal(res.status, 409);

  const bal = await (await fetch(`${base}/api/balance`)).json();
  assert.equal(bal.balance, 50);
});
