'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { loadState, saveState, StateStore, removeEarned } = require('../server/state');
const { tempDir } = require('./helpers');

test('init creates default state', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const state = loadState(file, 1000);

  assert.deepEqual(state.earned_posts, []);
  assert.equal(state.balance, 0);
  assert.equal(state.last_accrual_at, 1000);
  assert.equal(state.first_open_bonus_claimed, false);
});

test('state persists and reloads', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const state = loadState(file, 1000);
  state.balance = 7;
  state.first_open_bonus_claimed = true;
  saveState(file, state);

  const reloaded = loadState(file, 2000);
  assert.equal(reloaded.balance, 7);
  assert.equal(reloaded.first_open_bonus_claimed, true);
  assert.equal(reloaded.last_accrual_at, 1000);
});

test('StateStore writes to disk on save', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const store = new StateStore(file);
  store.get().balance = 3;
  store.save();

  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(onDisk.balance, 3);
});

test('state lists earned posts', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const store = new StateStore(file);
  store.get().earned_posts = [
    { post_id: 1, file_path: 'a/1.jpg', banner_tag: 'a' },
    { post_id: 2, file_path: 'b/2.png', banner_tag: 'b' },
  ];

  assert.equal(store.get().earned_posts.length, 2);
});

test('removeEarned deletes the file and metadata', () => {
  const collectionsDir = tempDir();
  const state = {
    earned_posts: [
      { post_id: 1, file_path: 'tag/1.jpg', banner_tag: 'tag' },
      { post_id: 2, file_path: 'tag/2.jpg', banner_tag: 'tag' },
    ],
    pending_downloads: [{ post_id: 1 }],
  };
  fs.mkdirSync(path.join(collectionsDir, 'tag'), { recursive: true });
  fs.writeFileSync(path.join(collectionsDir, 'tag', '1.jpg'), 'data');

  const result = removeEarned(state, collectionsDir, 1);

  assert.equal(result.removed, true);
  assert.equal(result.entry.post_id, 1);
  assert.deepEqual(
    state.earned_posts.map((entry) => entry.post_id),
    [2],
  );
  assert.equal(state.pending_downloads.length, 0);
  assert.equal(fs.existsSync(path.join(collectionsDir, 'tag', '1.jpg')), false);
});

test('removeEarned tolerates a missing file', () => {
  const collectionsDir = tempDir();
  const state = { earned_posts: [{ post_id: 9, file_path: 'tag/9.jpg' }], pending_downloads: [] };

  const result = removeEarned(state, collectionsDir, 9);

  assert.equal(result.removed, true);
  assert.equal(state.earned_posts.length, 0);
});

test('removeEarned returns not removed for an unknown post', () => {
  const state = { earned_posts: [{ post_id: 5, file_path: 'tag/5.jpg' }], pending_downloads: [] };

  const result = removeEarned(state, tempDir(), 99);

  assert.equal(result.removed, false);
  assert.equal(state.earned_posts.length, 1);
});
