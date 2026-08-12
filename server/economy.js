'use strict';

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ACCRUAL_PER_HOUR = 2;
const CAP = 30;
const DAILY_BONUS = 5;
const FIRST_OPEN_BONUS = 10;

function claimFirstOpenBonus(state) {
  if (state.first_open_bonus_claimed) {
    return false;
  }
  state.first_open_bonus_claimed = true;
  state.balance += FIRST_OPEN_BONUS;
  return true;
}

function getBalance(state, now = Date.now()) {
  if (now < state.last_accrual_at) {
    return state.balance;
  }
  let balance = state.balance;

  const wholeHours = Math.floor((now - state.last_accrual_at) / HOUR_MS);
  const headroom = Math.max(0, CAP - balance);
  balance += Math.min(headroom, wholeHours * ACCRUAL_PER_HOUR);

  const daysCrossed =
    Math.floor(now / DAY_MS) - Math.floor(state.last_accrual_at / DAY_MS);
  if (daysCrossed > 0 && balance < CAP) {
    balance += DAILY_BONUS;
  }

  state.balance = balance;
  state.last_accrual_at = now;
  return balance;
}

function spendRoll(state) {
  state.balance = Math.max(0, state.balance - 1);
  return state.balance;
}

module.exports = {
  HOUR_MS,
  DAY_MS,
  ACCRUAL_PER_HOUR,
  CAP,
  DAILY_BONUS,
  FIRST_OPEN_BONUS,
  claimFirstOpenBonus,
  getBalance,
  spendRoll,
};
