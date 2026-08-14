'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { loadState, saveState, StateStore, removeEarned, validateState } = require('../server/state');
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

test('validateState rejects malformed states', () => {
  assert.equal(validateState(null), false);
  assert.equal(validateState({}), false);
  assert.equal(validateState('nope'), false);
  assert.equal(
    validateState({
      earned_posts: [],
      pending_downloads: [],
      balance: -1,
      last_accrual_at: 0,
      first_open_bonus_claimed: false,
    }),
    false,
  );
  assert.equal(
    validateState({
      earned_posts: [],
      pending_downloads: [],
      balance: 0,
      last_accrual_at: 0,
      first_open_bonus_claimed: false,
    }),
    true,
  );
});

test('saveState writes a backup copy', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const state = loadState(file, 1000);
  state.balance = 5;
  saveState(file, state);

  const backup = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'));
  assert.equal(backup.balance, 5);
});

test('saveState skips the write when nothing changed', () => {
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const state = loadState(file, 1000);
  state.balance = 5;
  assert.equal(saveState(file, state), true);

  fs.rmSync(`${file}.bak`);
  assert.equal(saveState(file, state), false);
  assert.equal(fs.existsSync(`${file}.bak`), false);
});

test('loadState recovers from the backup when the main file is corrupt', (t) => {
  t.mock.method(console, 'warn', () => {});
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const state = loadState(file, 1000);
  state.balance = 9;
  state.first_open_bonus_claimed = true;
  saveState(file, state);

  fs.writeFileSync(file, '{not valid json');

  const recovered = loadState(file, 2000);
  assert.equal(recovered.balance, 9);
  assert.equal(recovered.first_open_bonus_claimed, true);
  assert.equal(fs.existsSync(`${file}.corrupt`), true);
  const restored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(restored.balance, 9);
});

test('loadState starts fresh when corrupt and no backup exists', (t) => {
  t.mock.method(console, 'warn', () => {});
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, '{broken');

  const state = loadState(file, 1000);
  assert.equal(state.balance, 0);
  assert.equal(state.first_open_bonus_claimed, false);
  assert.equal(fs.existsSync(`${file}.corrupt`), true);
  assert.equal(fs.existsSync(file), true);
});

test('loadState recovers a deleted main file from the backup', (t) => {
  t.mock.method(console, 'warn', () => {});
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const state = loadState(file, 1000);
  state.balance = 4;
  saveState(file, state);

  fs.rmSync(file);

  const recovered = loadState(file, 2000);
  assert.equal(recovered.balance, 4);
  const restored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(restored.balance, 4);
});

test('loadState rolls back when the state is structurally invalid', (t) => {
  t.mock.method(console, 'warn', () => {});
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const state = loadState(file, 1000);
  state.balance = 6;
  saveState(file, state);

  fs.writeFileSync(file, JSON.stringify({ balance: 'not-a-number', earned_posts: 'oops' }));

  const recovered = loadState(file, 2000);
  assert.equal(recovered.balance, 6);
});

test('saveState refuses to write an invalid state', (t) => {
  t.mock.method(console, 'error', () => {});
  const dir = tempDir();
  const file = path.join(dir, 'state.json');
  const state = loadState(file, 1000);
  state.balance = 3;
  saveState(file, state);

  const saved = saveState(file, { balance: 'bad', earned_posts: null });
  assert.equal(saved, false);
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(onDisk.balance, 3);
});

test('createApp boots with a corrupt state file instead of crashing', (t) => {
  t.mock.method(console, 'warn', () => {});
  const dataDir = tempDir();
  const collectionsDir = tempDir();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), '{corrupt');

  const { createApp } = require('../server/index');
  const app = createApp({ dataDir, collectionsDir }).app;
  assert.ok(app);
  assert.equal(fs.existsSync(path.join(dataDir, 'state.json.corrupt')), true);
});
