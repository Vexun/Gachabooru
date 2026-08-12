'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_STATE = {
  earned_posts: [],
  pending_downloads: [],
  balance: 0,
  last_accrual_at: 0,
  first_open_bonus_claimed: false,
};

function createState(now = Date.now()) {
  return { ...DEFAULT_STATE, last_accrual_at: now };
}

function loadState(filePath, now = Date.now()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const state = { ...createState(0), ...parsed };
    if (typeof state.last_accrual_at !== 'number' || state.last_accrual_at === 0) {
      state.last_accrual_at = now;
    }
    return state;
  } catch (err) {
    if (err.code === 'ENOENT') {
      const state = createState(now);
      saveState(filePath, state);
      return state;
    }
    throw err;
  }
}

function saveState(filePath, state) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, filePath);
}

class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = loadState(filePath);
  }

  get() {
    return this.state;
  }

  save() {
    saveState(this.filePath, this.state);
  }
}

function removeEarned(state, collectionsDir, postId) {
  const idx = state.earned_posts.findIndex((entry) => entry.post_id === postId);
  if (idx === -1) {
    return { removed: false };
  }
  const [entry] = state.earned_posts.splice(idx, 1);
  state.pending_downloads = state.pending_downloads.filter(
    (item) => item.post_id !== postId,
  );
  const fullPath = path.join(collectionsDir, entry.file_path);
  fs.rmSync(fullPath, { force: true });
  return { removed: true, entry };
}

module.exports = { DEFAULT_STATE, createState, loadState, saveState, StateStore, removeEarned };
