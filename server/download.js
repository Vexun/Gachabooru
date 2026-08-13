'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; Gachabooru/0.1; local personal gacha app)';

class DownloadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DownloadError';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeExt(fileExt) {
  return String(fileExt || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
}

function safeTag(bannerTag) {
  return String(bannerTag || '').replace(/[^\p{L}\p{N}_]/gu, '_') || 'untagged';
}

class Downloader {
  constructor(opts = {}) {
    this.collectionsDir = opts.collectionsDir;
    this.fetch = opts.fetchImpl || globalThis.fetch;
    this.retries = opts.retries ?? 2;
    this.backoffMs = opts.backoffMs ?? 300;
    this.userAgent = opts.userAgent || DEFAULT_USER_AGENT;
  }

  headers() {
    return {
      'User-Agent': this.userAgent,
      Accept: 'image/*,*/*;q=0.8',
      Referer: 'https://danbooru.donmai.us/',
      'Accept-Encoding': 'identity',
    };
  }

  pathFor(post, bannerTag) {
    return path.join(safeTag(bannerTag), `${post.id}.${safeExt(post.file_ext)}`);
  }

  async fetchBuffer(url) {
    let lastErr;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await this.fetch(url, { headers: this.headers() });
        if (!res.ok) {
          throw new DownloadError(`HTTP ${res.status}`);
        }
        return Buffer.from(await res.arrayBuffer());
      } catch (err) {
        lastErr = err;
        if (attempt < this.retries) {
          await sleep(this.backoffMs * (attempt + 1));
        }
      }
    }
    throw lastErr;
  }

  async fetchFile(url, destPath) {
    const buffer = await this.fetchBuffer(url);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buffer);
    return destPath;
  }

  removeQueued(state, postId) {
    state.pending_downloads = (state.pending_downloads || []).filter(
      (item) => item.post_id !== postId,
    );
  }

  async bank(state, { post, bannerTag }) {
    const filePath = this.pathFor(post, bannerTag);
    const fullPath = path.join(this.collectionsDir, filePath);
    const existing = state.earned_posts.find((entry) => entry.post_id === post.id);

    if (existing) {
      if (fs.existsSync(fullPath)) {
        return { entry: existing, downloaded: true, already: true };
      }
      try {
        await this.fetchFile(post.file_url, fullPath);
        this.removeQueued(state, post.id);
        return { entry: existing, downloaded: true };
      } catch (err) {
        return { entry: existing, downloaded: false, queued: true, detail: err.message };
      }
    }

    const entry = {
      post_id: post.id,
      file_path: filePath,
      banner_tag: bannerTag,
      earned_at: new Date().toISOString(),
      danbooru_url: `https://danbooru.donmai.us/posts/${post.id}`,
      tags: typeof post.tag_string === 'string' ? post.tag_string : '',
      file_ext: post.file_ext,
    };

    state.earned_posts.push(entry);
    try {
      await this.fetchFile(post.file_url, fullPath);
      this.removeQueued(state, post.id);
      return { entry, downloaded: true };
    } catch (err) {
      state.pending_downloads.push({ post_id: post.id, post, banner_tag: bannerTag });
      return { entry, downloaded: false, queued: true, detail: err.message };
    }
  }
}

module.exports = { DownloadError, Downloader, safeExt, safeTag };
