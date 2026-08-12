'use strict';

const express = require('express');
const { removeEarned } = require('./state');
const economy = require('./economy');
const { safeTag } = require('./download');

const SAFE_RATING = 'safe';

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
        rating: SAFE_RATING,
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
    res.json({ entries: ctx.store.get().earned_posts });
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
