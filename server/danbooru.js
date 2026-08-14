'use strict';

const DANBOORU_BASE = 'https://danbooru.donmai.us';

const ALLOWED_CATEGORIES = new Set([0, 3, 4]);
const STATIC_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const SAFE_TAGS = ['rating:g'];
const POSTS_LIMIT = 200;
const DEFAULT_POOL_SIZE = 5;
const DEFAULT_MAX_PAGES = 10;

function defaultUserAgent() {
  return 'Gachabooru/0.1 (local personal gacha app)';
}

class DanbooruError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DanbooruError';
    this.code = code;
  }
}

class Throttle {
  constructor(minIntervalMs, opts = {}) {
    this.minIntervalMs = minIntervalMs;
    this.now = opts.now || Date.now;
    this.sleep = opts.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.nextAt = 0;
  }

  async wait() {
    const now = this.now();
    const delay = Math.max(0, this.nextAt - now);
    this.nextAt = Math.max(this.nextAt, now) + this.minIntervalMs;
    if (delay > 0) {
      await this.sleep(delay);
    }
  }
}

class DanbooruClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || DANBOORU_BASE;
    this.userAgent = opts.userAgent || defaultUserAgent();
    this.fetch = opts.fetchImpl || globalThis.fetch;
    this.throttle = new Throttle(opts.minIntervalMs ?? 1000);
  }

  async getJson(path, params) {
    await this.throttle.wait();
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
    let res;
    try {
      res = await this.fetch(url.toString(), {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
      });
    } catch (err) {
      throw new DanbooruError('network', err.message);
    }
    if (!res.ok) {
      throw new DanbooruError('http', `${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async autocomplete(query, limit = 10) {
    if (!String(query || '').trim()) {
      return [];
    }
    const data = await this.getJson('/autocomplete.json', {
      'search[query]': query,
      'search[type]': 'tag',
      limit,
    });
    return data
      .filter((item) => ALLOWED_CATEGORIES.has(item.category))
      .map((item) => ({
        value: item.value,
        label: item.label,
        category: item.category,
        post_count: item.post_count,
      }));
  }

  async searchPosts(opts = {}) {
    const { tag, page = 1, limit = POSTS_LIMIT } = opts;
    const tags = [tag, ...SAFE_TAGS, 'order:score'];
    const data = await this.getJson('/posts.json', {
      tags: tags.join(' '),
      limit,
      page,
    });
    return data.filter((post) => STATIC_EXTS.has(post.file_ext)).map((post) => ({
      id: post.id,
      score: post.score,
      rating: post.rating,
      file_ext: post.file_ext,
      file_url: post.file_url,
      large_file_url: post.large_file_url || post.file_url,
      preview_file_url: post.preview_file_url,
      tag_string: post.tag_string,
    }));
  }

  buildRollPool(opts) {
    return buildRollPool(this, opts);
  }
}

function sampleWithoutReplacement(items, size) {
  const pool = [...items];
  const result = [];
  for (let i = 0; i < size && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

async function buildRollPool(danbooru, opts = {}) {
  const { tag, earnedIds = [], size = DEFAULT_POOL_SIZE, maxPages = DEFAULT_MAX_PAGES } = opts;
  const earned = new Set(earnedIds);
  const eligible = [];

  for (let page = 1; page <= maxPages; page++) {
    const posts = await danbooru.searchPosts({ tag, page });
    if (posts.length === 0) {
      break;
    }
    for (const post of posts) {
      if (!earned.has(post.id)) {
        eligible.push(post);
      }
    }
    if (eligible.length >= size) {
      break;
    }
  }

  if (eligible.length < size) {
    return { ok: false, reason: 'insufficient' };
  }
  return { ok: true, pool: sampleWithoutReplacement(eligible, size) };
}

module.exports = {
  DANBOORU_BASE,
  ALLOWED_CATEGORIES,
  STATIC_EXTS,
  SAFE_TAGS,
  POSTS_LIMIT,
  DEFAULT_POOL_SIZE,
  DEFAULT_MAX_PAGES,
  DanbooruError,
  DanbooruClient,
  Throttle,
  sampleWithoutReplacement,
  buildRollPool,
};
