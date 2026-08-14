'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const economy = require('../server/economy');

const { HOUR_MS, DAY_MS, CAP, ACCRUAL_PER_HOUR, DAILY_BONUS, FIRST_OPEN_BONUS } = economy;

function makeState(balance, lastAccrualAt) {
  return {
    balance,
    last_accrual_at: lastAccrualAt,
    first_open_bonus_claimed: true,
    earned_posts: [],
    pending_downloads: [],
  };
}

test('exposes economy constants', () => {
  assert.equal(ACCRUAL_PER_HOUR, 10);
  assert.equal(CAP, 300);
  assert.equal(DAILY_BONUS, 20);
  assert.equal(FIRST_OPEN_BONUS, 50);
});

test('accrues 10 rolls per whole hour', () => {
  const state = makeState(0, 0);
  assert.equal(economy.getBalance(state, HOUR_MS), 10);
  assert.equal(economy.getBalance(state, 2 * HOUR_MS), 20);
  assert.equal(economy.getBalance(state, 3 * HOUR_MS), 30);
});

test('floors to whole hours elapsed', () => {
  const state = makeState(0, 0);
  assert.equal(economy.getBalance(state, 1.5 * HOUR_MS), 10);
});

test('caps the balance at 300 from accrual', () => {
  const state = makeState(0, 0);
  assert.equal(economy.getBalance(state, 40 * HOUR_MS), 300);
});

test('does not reduce a balance already above the cap', () => {
  const state = makeState(350, 0);
  assert.equal(economy.getBalance(state, 10 * HOUR_MS), 350);
});

test('grants the 24-hour bonus only when below 300 at the boundary', () => {
  const last = DAY_MS + 23 * HOUR_MS;
  const now = 2 * DAY_MS + 1 * HOUR_MS;
  const state = makeState(20, last);

  assert.equal(economy.getBalance(state, now), 20 + 20 + DAILY_BONUS);
});

test('does not grant the 24-hour bonus while at the cap', () => {
  const last = DAY_MS + 23 * HOUR_MS;
  const now = 2 * DAY_MS + 1 * HOUR_MS;
  const state = makeState(300, last);

  assert.equal(economy.getBalance(state, now), 300);
});

test('does not grant the 24-hour bonus while above the cap', () => {
  const last = DAY_MS + 23 * HOUR_MS;
  const now = 2 * DAY_MS + 1 * HOUR_MS;
  const state = makeState(350, last);

  assert.equal(economy.getBalance(state, now), 350);
});

test('does not stack the 24-hour bonus across crossed boundaries at the cap', () => {
  const last = DAY_MS + 23 * HOUR_MS;
  const now = 4 * DAY_MS + 1 * HOUR_MS;
  const state = makeState(20, last);

  assert.equal(economy.getBalance(state, now), 300);
});

test('first-open bonus grants +50 once', () => {
  const state = { balance: 0, first_open_bonus_claimed: false };

  assert.equal(economy.claimFirstOpenBonus(state), true);
  assert.equal(state.balance, 50);
  assert.equal(economy.claimFirstOpenBonus(state), false);
  assert.equal(state.balance, 50);
});

test('balance never goes below zero on spend', () => {
  const state = makeState(5, 0);
  assert.equal(economy.spendRoll(state), 4);
  assert.equal(economy.spendRoll(state), 3);

  const empty = makeState(0, 0);
  assert.equal(economy.spendRoll(empty), 0);
  assert.equal(economy.spendRoll(empty), 0);
});

test('getBalance ignores a now earlier than the last check', () => {
  const state = makeState(7, 1000);
  assert.equal(economy.getBalance(state, 500), 7);
});

test('getBalance leaves the state untouched when nothing accrues', () => {
  const state = makeState(7, 1000);
  const balance = economy.getBalance(state, 1000 + 30 * 60 * 1000);

  assert.equal(balance, 7);
  assert.equal(state.balance, 7);
  assert.equal(state.last_accrual_at, 1000);
});
