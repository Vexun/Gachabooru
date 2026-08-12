'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { DanbooruClient, DanbooruError, buildRollPool, SAFE_TAGS } = require('../server/danbooru');

function fakeFetch(jsonOrError) {
  return async () => {
    if (jsonOrError instanceof Error) {
      throw jsonOrError;
    }
    return {
      ok: true,
      status: 200,
      json: async () => jsonOrError,
    };
  };
}

const rawResults = [
  { type: 'tag-word', label: 'hatsune miku', value: 'hatsune_miku', category: 4, post_count: 100 },
  { type: 'tag', label: 'spaghetti', value: 'spaghetti', category: 0, post_count: 50 },
  { type: 'tag', label: 'touhou', value: 'touhou', category: 3, post_count: 80 },
  { type: 'tag', label: 'matsuura mai', value: 'matsuura_mai', category: 1, post_count: 30 },
  { type: 'tag', label: 'spaghetti sauce', value: 'spaghetti_sauce', category: 5, post_count: 20 },
];

test('autocomplete maps results and filters to general, copyright, character', async () => {
  const client = new DanbooruClient({ fetchImpl: fakeFetch(rawResults), minIntervalMs: 0 });
  const results = await client.autocomplete('hatsune');

  assert.deepEqual(results, [
    { value: 'hatsune_miku', label: 'hatsune miku', category: 4, post_count: 100 },
    { value: 'spaghetti', label: 'spaghetti', category: 0, post_count: 50 },
    { value: 'touhou', label: 'touhou', category: 3, post_count: 80 },
  ]);
});

test('autocomplete requests the expected URL', async () => {
  let requestedUrl = null;
  const client = new DanbooruClient({
    minIntervalMs: 0,
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, json: async () => [] };
    },
  });
  await client.autocomplete('hatsune miku');

  assert.match(requestedUrl, /\/autocomplete\.json\?/);
  assert.match(requestedUrl, /search%5Bquery%5D=hatsune\+miku/);
  assert.match(requestedUrl, /search%5Btype%5D=tag/);
  assert.match(requestedUrl, /limit=10/);
});

test('autocomplete returns empty for an empty query without calling upstream', async () => {
  let called = false;
  const client = new DanbooruClient({
    minIntervalMs: 0,
    fetchImpl: async () => {
      called = true;
      return { ok: true, status: 200, json: async () => [] };
    },
  });

  const results = await client.autocomplete('   ');
  assert.deepEqual(results, []);
  assert.equal(called, false);
});

test('autocomplete throws DanbooruError on network failure', async () => {
  const client = new DanbooruClient({
    minIntervalMs: 0,
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });

  await assert.rejects(() => client.autocomplete('hatsune'), (err) => {
    assert.ok(err instanceof DanbooruError);
    assert.equal(err.code, 'network');
    return true;
  });
});

test('autocomplete throws DanbooruError on non-ok response', async () => {
  const client = new DanbooruClient({
    minIntervalMs: 0,
    fetchImpl: async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' }),
  });

  await assert.rejects(() => client.autocomplete('hatsune'), (err) => {
    assert.ok(err instanceof DanbooruError);
    assert.equal(err.code, 'http');
    assert.equal(err.message, '500 Internal Server Error');
    return true;
  });
});

function rawPost(id, ext = 'jpg') {
  return {
    id,
    score: 100,
    rating: 's',
    file_ext: ext,
    file_url: `https://cdn.donmai.us/original/${id}.${ext}`,
    large_file_url: `https://cdn.donmai.us/sample/${id}.${ext}`,
    preview_file_url: `https://cdn.donmai.us/preview/${id}.jpg`,
    tag_string: `tag_${id}`,
  };
}

test('searchPosts builds the query with tag, safe filter, order and limit', async () => {
  let requestedUrl = null;
  const client = new DanbooruClient({
    minIntervalMs: 0,
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, json: async () => [rawPost(1)] };
    },
  });

  await client.searchPosts({ tag: 'hatsune_miku', page: 2, limit: 200 });

  const params = new URL(requestedUrl).searchParams;
  assert.equal(params.get('tags'), 'hatsune_miku rating:g order:score');
  assert.equal(params.get('page'), '2');
  assert.equal(params.get('limit'), '200');
});

test('the client always applies the general-only safe filter', () => {
  assert.deepEqual(SAFE_TAGS, ['rating:g']);
});

test('searchPosts filters out non-static formats', async () => {
  const client = new DanbooruClient({
    minIntervalMs: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [
        rawPost(1, 'jpg'),
        rawPost(2, 'png'),
        rawPost(3, 'webp'),
        rawPost(4, 'gif'),
        rawPost(5, 'mp4'),
        rawPost(6, 'webm'),
        rawPost(7, 'zip'),
        rawPost(8, 'swf'),
      ],
    }),
  });

  const posts = await client.searchPosts({ tag: 'x' });
  assert.deepEqual(
    posts.map((p) => p.id),
    [1, 2, 3, 4],
  );
});

test('searchPosts falls back to the original file URL when no large image exists', async () => {
  const post = rawPost(1);
  delete post.large_file_url;
  const client = new DanbooruClient({
    minIntervalMs: 0,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [post] }),
  });

  const posts = await client.searchPosts({ tag: 'x' });
  assert.equal(posts[0].large_file_url, post.file_url);
});

test('buildRollPool draws 5 distinct posts from a full pool', async () => {
  const posts = Array.from({ length: 8 }, (_, i) => rawPost(i + 1));
  const fakeDanbooru = {
    searchPosts: async () => posts,
  };

  const result = await buildRollPool(fakeDanbooru, { tag: 'x' });
  assert.equal(result.ok, true);
  assert.equal(result.pool.length, 5);
  const ids = new Set(result.pool.map((p) => p.id));
  assert.equal(ids.size, 5);
});

test('buildRollPool fetches deeper pages until 5 eligible posts exist', async () => {
  let pageCalls = 0;
  const fakeDanbooru = {
    searchPosts: async ({ page }) => {
      pageCalls += 1;
      if (page === 1) {
        return [rawPost(1), rawPost(2)];
      }
      return Array.from({ length: 5 }, (_, i) => rawPost(100 + i));
    },
  };

  const result = await buildRollPool(fakeDanbooru, { tag: 'x' });
  assert.equal(result.ok, true);
  assert.equal(result.pool.length, 5);
  assert.ok(pageCalls >= 2);
});

test('buildRollPool excludes earned posts', async () => {
  const earned = [1, 2, 3];
  const posts = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => rawPost(id));
  const fakeDanbooru = {
    searchPosts: async () => posts,
  };

  const result = await buildRollPool(fakeDanbooru, {
    tag: 'x',
    earnedIds: earned,
  });
  const ids = result.pool.map((p) => p.id);
  assert.equal(ids.length, 5);
  for (const id of ids) {
    assert.ok(!earned.includes(id));
  }
});

test('buildRollPool blocks when fewer than 5 eligible posts exist', async () => {
  let calls = 0;
  const fakeDanbooru = {
    searchPosts: async () => {
      calls += 1;
      return calls === 1 ? [rawPost(1), rawPost(2), rawPost(3)] : [];
    },
  };

  const result = await buildRollPool(fakeDanbooru, { tag: 'x' });
  assert.deepEqual(result, { ok: false, reason: 'insufficient' });
});

test('buildRollPool blocks when deeper pages run empty', async () => {
  let calls = 0;
  const fakeDanbooru = {
    searchPosts: async () => {
      calls += 1;
      return calls === 1 ? [rawPost(1), rawPost(2)] : [];
    },
  };

  const result = await buildRollPool(fakeDanbooru, { tag: 'x' });
  assert.equal(result.ok, false);
});
