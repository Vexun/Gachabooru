'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BACKUP_SUFFIX = '.bak';
const CORRUPT_SUFFIX = '.corrupt';

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

function validateState(state) {
  return (
    state !== null &&
    typeof state === 'object' &&
    Array.isArray(state.earned_posts) &&
    Array.isArray(state.pending_downloads) &&
    typeof state.balance === 'number' &&
    Number.isFinite(state.balance) &&
    state.balance >= 0 &&
    typeof state.last_accrual_at === 'number' &&
    typeof state.first_open_bonus_claimed === 'boolean'
  );
}

function parseStateFile(filePath, now = Date.now()) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return { ok: false, err };
  }
  const state = { ...createState(0), ...parsed };
  if (typeof state.last_accrual_at !== 'number' || state.last_accrual_at === 0) {
    state.last_accrual_at = now;
  }
  return { ok: true, state };
}

function preserveCorrupt(filePath) {
  try {
    fs.copyFileSync(filePath, `${filePath}${CORRUPT_SUFFIX}`);
  } catch (err) {
    console.warn(`could not preserve corrupt state file: ${err.message}`);
  }
}

function loadState(filePath, now = Date.now()) {
  const primary = parseStateFile(filePath, now);
  if (primary.ok && validateState(primary.state)) {
    return primary.state;
  }

  const backupPath = `${filePath}${BACKUP_SUFFIX}`;
  const backup = parseStateFile(backupPath, now);
  if (backup.ok && validateState(backup.state)) {
    console.warn(`state file is corrupt or missing; recovered from ${backupPath}`);
    if (fs.existsSync(filePath)) {
      preserveCorrupt(filePath);
    }
    saveState(filePath, backup.state);
    return backup.state;
  }

  if (fs.existsSync(filePath)) {
    preserveCorrupt(filePath);
  }
  console.warn('state file is corrupt and no valid backup exists; starting fresh');
  const state = createState(now);
  saveState(filePath, state);
  return state;
}

function saveState(filePath, state) {
  if (!validateState(state)) {
    console.error(`refusing to write invalid state to ${filePath}`);
    return false;
  }
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, filePath);
  try {
    fs.copyFileSync(filePath, `${filePath}${BACKUP_SUFFIX}`);
  } catch (err) {
    console.warn(`could not write state backup: ${err.message}`);
  }
  return true;
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

module.exports = {
  DEFAULT_STATE,
  createState,
  loadState,
  saveState,
  StateStore,
  removeEarned,
  validateState,
};
