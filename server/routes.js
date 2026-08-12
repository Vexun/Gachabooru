'use strict';

const express = require('express');
const { removeEarned } = require('./state');
const economy = require('./economy');
const { safeTag } = require('./download');

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 200;

function parsePagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? DEFAULT_PAGE_SIZE : Number(query.limit);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    return null;
  }
  return { page, limit };
}

function newestFirst(entries) {
  return [...entries].sort(
    (a, b) => (new Date(b.earned_at).getTime() || 0) - (new Date(a.earned_at).getTime() || 0),
  );
}

function createRouter(ctx) {
  const router = express.Router();
  const now = () => (ctx.now ? ctx.now() : Date.now());

  router.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  router.get('/balance', (req, res) => {
    const state = ctx.store.get();
    const balance = economy.getBalance(state, now());
    ctx.store.save();
    res.json({ balance });
  });

  router.get('/autocomplete', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(422).json({ error: 'empty query' });
    }
    try {
      const results = await ctx.danbooru.autocomplete(query);
      res.json({ results });
    } catch (err) {
      res.status(502).json({ error: 'upstream error', detail: err.message });
    }
  });

  router.get('/roll/pool', async (req, res) => {
    const tag = String(req.query.tag || '').trim();
    if (!tag) {
      return res.status(422).json({ error: 'missing tag' });
    }
    const state = ctx.store.get();
    const balance = economy.getBalance(state, now());
    ctx.store.save();
    if (balance < 1) {
      return res.status(402).json({ error: 'insufficient balance' });
    }
    const earnedIds = state.earned_posts.map((entry) => entry.post_id);
    try {
      const result = await ctx.danbooru.buildRollPool({
        tag,
        earnedIds,
      });
      if (!result.ok) {
        return res.status(409).json({ error: 'insufficient pool' });
      }
      economy.spendRoll(state);
      ctx.store.save();
      res.json({ posts: result.pool, balance: state.balance });
    } catch (err) {
      res.status(502).json({ error: 'upstream error', detail: err.message });
    }
  });

  router.post('/roll/:postId', async (req, res) => {
    const postId = Number(req.params.postId);
    const post = req.body && req.body.post;
    const rawBannerTag = String((req.body && req.body.banner_tag) || '').trim();

    if (!Number.isInteger(postId) || !post || post.id !== postId) {
      return res.status(422).json({ error: 'invalid post' });
    }
    if (!rawBannerTag) {
      return res.status(422).json({ error: 'missing banner' });
    }
    const bannerTag = safeTag(rawBannerTag);

    const state = ctx.store.get();
    const result = await ctx.downloader.bank(state, { post, bannerTag });
    ctx.store.save();
    res.json(result);
  });

  router.get('/earned', (req, res) => {
    const pagination = parsePagination(req.query);
    if (!pagination) {
      return res.status(422).json({ error: 'invalid pagination' });
    }
    const earned = newestFirst(ctx.store.get().earned_posts);
    const start = (pagination.page - 1) * pagination.limit;
    const entries = earned.slice(start, start + pagination.limit);
    res.json({
      entries,
      page: pagination.page,
      limit: pagination.limit,
      total: earned.length,
    });
  });

  router.delete('/earned/:postId', (req, res) => {
    const postId = Number(req.params.postId);
    if (!Number.isInteger(postId)) {
      return res.status(422).json({ error: 'invalid post id' });
    }
    const state = ctx.store.get();
    const result = removeEarned(state, ctx.collectionsDir, postId);
    if (!result.removed) {
      return res.status(404).json({ error: 'not found' });
    }
    ctx.store.save();
    res.json({ removed: true, post_id: postId });
  });

  return router;
}

module.exports = { createRouter };
