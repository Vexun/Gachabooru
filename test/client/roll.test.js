'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDocument, fakeTimers } = require('./helpers');
const { createRoll } = require('../../public/roll');

function fakeFetch(body, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function post(id, score) {
  const p = {
    id,
    file_ext: 'jpg',
    large_file_url: `https://cdn.donmai.us/${id}.jpg`,
    preview_file_url: `https://cdn.donmai.us/preview/${id}.jpg`,
    file_url: `https://cdn.donmai.us/orig/${id}.jpg`,
  };
  if (score !== undefined) {
    p.score = score;
  }
  return p;
}

function makeRoll(t, fetchImpl, random = Math.random) {
  const { doc } = createDocument();
  const timers = fakeTimers();
  const roll = createRoll({
    document: doc,
    fetch: fetchImpl,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    random,
  });
  t.after(() => roll.destroy());
  return { roll, timers };
}

function routingFetch({ pool, onBank }) {
  return async (url, opts = {}) => {
    if (opts.method === 'POST') {
      if (onBank) {
        onBank(url, opts);
      }
      return { ok: true, status: 200, json: async () => ({ downloaded: true }) };
    }
    return { ok: true, status: 200, json: async () => ({ posts: pool }) };
  };
}

const banner = { value: 'hatsune_miku', label: 'hatsune miku', category: 4, post_count: 100 };
const fivePosts = [post(1), post(2), post(3), post(4), post(5)];

function imgsOf(roll) {
  return roll.getCards().map((card) => card.querySelector('.card-front').querySelector('img'));
}

function settleImages(roll, type = 'load') {
  for (const img of imgsOf(roll)) {
    img.dispatchEvent({ type });
  }
}

function fireAnimEnd(roll) {
  const last = roll.getCards()[roll.getCards().length - 1];
  last.dispatchEvent({ type: 'animationend' });
}

function fireTransEnd(roll) {
  const lastInner = roll.getCards()[roll.getCards().length - 1].querySelector('.card-inner');
  lastInner.dispatchEvent({ type: 'transitionend' });
}

test('roll button is disabled until a banner is chosen', (t) => {
  const { roll } = makeRoll(t, fakeFetch({ posts: [] }));
  roll.setBalance(10);

  const button = roll.el.querySelector('button');
  assert.equal(button.disabled, true);

  roll.setBanner(banner);
  assert.equal(button.disabled, false);
  assert.match(roll.el.textContent, /Banner: hatsune miku/);
});

test('the flip panel contains a polite aria-live region', (t) => {
  const { roll } = makeRoll(t, fakeFetch({ posts: [] }));

  const live = roll.el.querySelector('.flip-live');
  assert.ok(live, 'aria-live region exists');
  assert.equal(live.getAttribute('aria-live'), 'polite');
  assert.equal(live.classList.contains('sr-only'), true);
});

test('requesting a pool renders 5 hidden covered cards while images load', async (t) => {
  const { roll, timers } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  const posts = await roll.startRoll();

  assert.equal(posts.length, 5);
  assert.equal(roll.getState(), 'loading');
  assert.equal(timers.count(), 0);
  const cards = roll.el.querySelectorAll('.card');
  assert.equal(cards.length, 5);
  assert.equal(cards[0].dataset.postId, '1');
  for (const card of cards) {
    assert.equal(card.classList.contains('covered'), true);
    assert.equal(card.classList.contains('pre-entry'), true);
    assert.equal(card.classList.contains('entering'), false);
  }
  const frontImg = cards[0].querySelector('.card-inner').querySelector('.card-front').querySelector('img');
  assert.equal(frontImg.src, `/api/image?url=${encodeURIComponent('https://cdn.donmai.us/1.jpg')}`);
  assert.equal(frontImg.hidden, false);
});

test('cards slide in, reveal, glow, then cover through the sequence', async (t) => {
  const { roll, timers } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  await roll.startRoll();
  settleImages(roll);

  assert.equal(roll.getState(), 'entering');
  const cards = roll.el.querySelectorAll('.card');
  for (const card of cards) {
    assert.equal(card.classList.contains('entering'), true);
    assert.equal(card.classList.contains('pre-entry'), false);
    assert.equal(card.classList.contains('covered'), true);
  }

  fireAnimEnd(roll);

  assert.equal(roll.getState(), 'revealed');
  for (const card of cards) {
    assert.equal(card.classList.contains('entering'), false);
    assert.equal(card.classList.contains('covered'), false);
    assert.equal(card.classList.contains('revealed'), true);
  }

  fireTransEnd(roll);

  assert.equal(roll.getState(), 'peek');
  assert.equal(timers.pending()[0], 3000);

  timers.fireAll();

  assert.equal(roll.getState(), 'covered');
  for (const card of cards) {
    assert.equal(card.classList.contains('covered'), true);
    assert.equal(card.classList.contains('revealed'), false);
  }
});

test('renderCards builds a two-sided card structure', async (t) => {
  const { roll } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  await roll.startRoll();

  const cards = roll.el.querySelectorAll('.card');
  assert.equal(cards.length, 5);
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    assert.equal(card.dataset.position, String(i + 1));
    const inner = card.querySelector('.card-inner');
    assert.ok(inner, 'card has a card-inner');
    const front = inner.querySelector('.card-front');
    const back = inner.querySelector('.card-back');
    assert.ok(front, 'card-inner has a card-front');
    assert.ok(back, 'card-inner has a card-back');
    assert.ok(front.querySelector('img'), 'card-front holds the image');
    const number = back.querySelector('.card-number');
    assert.ok(number, 'card-back holds a numbered span');
    assert.equal(number.textContent, String(i + 1));
  }
});

test('cards gain the entering class only after their images settle', async (t) => {
  const { roll } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  await roll.startRoll();

  const cards = roll.el.querySelectorAll('.card');
  for (const card of cards) {
    assert.equal(card.classList.contains('entering'), false);
    assert.equal(card.classList.contains('pre-entry'), true);
  }

  settleImages(roll);

  for (const card of cards) {
    assert.equal(card.classList.contains('entering'), true);
    assert.equal(card.classList.contains('pre-entry'), false);
  }
});

test('an errored image also counts as settled', async (t) => {
  const { roll } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  await roll.startRoll();

  const imgs = imgsOf(roll);
  for (const img of imgs.slice(0, 4)) {
    img.dispatchEvent({ type: 'load' });
  }
  imgs[4].dispatchEvent({ type: 'error' });

  assert.equal(roll.getState(), 'entering');
});

test('renderCards maps the post score to a rarity class', async (t) => {
  const posts = [
    post(1, 150),
    post(2, 100),
    post(3, 60),
    post(4, 50),
    post(5, 12),
  ];
  const { roll } = makeRoll(t, fakeFetch({ posts }));
  roll.setBanner(banner);

  await roll.startRoll();

  const cards = roll.el.querySelectorAll('.card');
  assert.equal(cards[0].classList.contains('rarity-gold'), true);
  assert.equal(cards[1].classList.contains('rarity-gold'), true);
  assert.equal(cards[2].classList.contains('rarity-silver'), true);
  assert.equal(cards[3].classList.contains('rarity-silver'), true);
  assert.equal(cards[4].classList.contains('rarity-gold'), false);
  assert.equal(cards[4].classList.contains('rarity-silver'), false);
  for (const card of cards) {
    assert.equal(card.classList.contains('revealed'), false);
  }

  settleImages(roll);
  fireAnimEnd(roll);

  for (const card of cards) {
    assert.equal(card.classList.contains('revealed'), true);
  }
});

test('coverCards toggles the covered class without appending backs', async (t) => {
  const { roll } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  await roll.startRoll();
  const before = roll.el.querySelectorAll('.card-back').length;

  roll.coverCards();

  const cards = roll.el.querySelectorAll('.card');
  assert.equal(cards.length, 5);
  for (const card of cards) {
    assert.equal(card.classList.contains('covered'), true);
  }
  assert.equal(roll.el.querySelectorAll('.card-back').length, before);
});

test('revealCard removes the covered class from the target card only', async (t) => {
  const { roll } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  await roll.startRoll();
  roll.coverCards();

  roll.revealCard(2);

  const cards = roll.el.querySelectorAll('.card');
  assert.equal(cards[2].classList.contains('covered'), false);
  assert.equal(cards[0].classList.contains('covered'), true);
  assert.equal(cards[4].classList.contains('covered'), true);
});

test('the 3D structure survives a peek-cover-reveal cycle', async (t) => {
  const { roll, timers } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  await roll.startRoll();
  settleImages(roll);
  fireAnimEnd(roll);
  fireTransEnd(roll);
  timers.fireAll();
  roll.revealCard(0);

  const cards = roll.el.querySelectorAll('.card');
  assert.equal(cards.length, 5);
  assert.equal(cards[0].classList.contains('covered'), false);
  for (let i = 1; i < cards.length; i++) {
    assert.equal(cards[i].classList.contains('covered'), true);
  }
  for (const card of cards) {
    assert.ok(card.querySelector('.card-inner'));
    assert.ok(card.querySelector('.card-inner').querySelector('.card-front'));
    assert.ok(card.querySelector('.card-inner').querySelector('.card-back'));
  }
});

test('covered cards show identical numbered backs', async (t) => {
  const { roll } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  await roll.startRoll();

  const backs = roll.el.querySelectorAll('.card-back');
  assert.equal(backs.length, 5);
  backs.forEach((back, idx) => {
    assert.equal(back.classList.contains('card-back'), true);
    assert.equal(back.querySelector('.card-number').textContent, String(idx + 1));
  });
});

test('shows an error state when the roll is blocked', async (t) => {
  const { roll } = makeRoll(t, fakeFetch({ error: 'insufficient pool' }, 409));
  roll.setBanner(banner);

  const posts = await roll.startRoll();

  assert.equal(posts, null);
  const errorEl = roll.el.querySelector('.roll-error');
  assert.equal(errorEl.hidden, false);
  assert.equal(errorEl.textContent, 'insufficient pool');
  assert.equal(roll.el.querySelectorAll('.card').length, 0);
});

test('surfaces a network error in the error area', async (t) => {
  const { roll } = makeRoll(t, async () => {
    throw new Error('fetch failed');
  });
  roll.setBanner(banner);

  const posts = await roll.startRoll();

  assert.equal(posts, null);
  const errorEl = roll.el.querySelector('.roll-error');
  assert.equal(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Network error/);
});

test('a new roll replaces the previous cards and restarts the sequence', async (t) => {
  const { roll, timers } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  await roll.startRoll();
  settleImages(roll);
  fireAnimEnd(roll);
  fireTransEnd(roll);
  timers.fireAll();
  assert.equal(roll.getState(), 'covered');

  await roll.startRoll();
  assert.equal(roll.getState(), 'loading');
  const cards = roll.el.querySelectorAll('.card');
  assert.equal(cards.length, 5);
  for (const card of cards) {
    assert.equal(card.classList.contains('covered'), true);
    assert.equal(card.classList.contains('pre-entry'), true);
    assert.equal(card.classList.contains('entering'), false);
  }
});

test('cancelCover clears the pending peek timer', async (t) => {
  const { roll, timers } = makeRoll(t, fakeFetch({ posts: fivePosts }));
  roll.setBanner(banner);

  await roll.startRoll();
  settleImages(roll);
  fireAnimEnd(roll);
  fireTransEnd(roll);
  assert.equal(timers.count(), 1);

  roll.cancelCover();
  assert.equal(timers.count(), 0);
});

function coveredRoll(t, fetchImpl, random) {
  const { roll, timers } = makeRoll(t, fetchImpl, random);
  roll.setBanner(banner);
  return { roll, timers };
}

test('flip order is a permutation of the 5 positions', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  const order = roll.getFlipOrder();
  assert.equal(order.length, 5);
  assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
});

test('calling heads or tails arms the flip button', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  const flipBtn = roll.el.querySelector('.flip-button');
  assert.equal(flipBtn.disabled, true);

  roll.setCall('heads');
  assert.equal(flipBtn.disabled, false);
  assert.match(roll.el.textContent, /You called heads/);
});

test('the flip panel contains a coin with heads and tails faces', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  const coin = roll.el.querySelector('.coin-container').querySelector('.coin');
  assert.ok(coin, 'coin exists');
  assert.ok(coin.querySelector('.coin-heads'));
  assert.ok(coin.querySelector('.coin-tails'));
  assert.equal(coin.classList.contains('show-heads'), false);
  assert.equal(coin.classList.contains('show-tails'), false);
});

test('the flip sequence shows the panel and focuses the active card', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  const flipPanel = roll.el.querySelector('.flip-panel');
  assert.equal(flipPanel.classList.contains('is-visible'), true);

  const firstPos = roll.getFlipOrder()[0];
  const cards = roll.getCards();
  for (let i = 0; i < cards.length; i++) {
    const dimmed = i !== firstPos;
    assert.equal(cards[i].classList.contains('focused'), !dimmed, `card ${i} focused`);
    assert.equal(cards[i].classList.contains('dimmed'), dimmed, `card ${i} dimmed`);
  }
});

test('won cards stay bright while the next card is focused', async (t) => {
  const { roll, timers } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  const firstPos = roll.getFlipOrder()[0];
  roll.setCall('heads');
  await roll.resolveFlip('heads');
  timers.fireAll();

  const secondPos = roll.getFlipOrder()[1];
  const cards = roll.getCards();
  assert.equal(cards[firstPos].classList.contains('dimmed'), false);
  assert.equal(cards[firstPos].classList.contains('focused'), false);
  assert.equal(cards[secondPos].classList.contains('focused'), true);
  for (let i = 0; i < cards.length; i++) {
    const won = i === firstPos;
    const active = i === secondPos;
    assert.equal(cards[i].classList.contains('dimmed'), !won && !active, `card ${i} dimmed`);
  }

  roll.setCall('heads');
  await roll.resolveFlip('heads');
  timers.fireAll();

  const thirdPos = roll.getFlipOrder()[2];
  assert.equal(cards[firstPos].classList.contains('dimmed'), false);
  assert.equal(cards[secondPos].classList.contains('dimmed'), false);
  assert.equal(cards[thirdPos].classList.contains('focused'), true);
});

test('clicking Flip spins the coin and resolves on animationend', async (t) => {
  const { roll, timers } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  const flipBtn = roll.el.querySelector('.flip-button');
  const coin = roll.el.querySelector('.coin-container').querySelector('.coin');
  flipBtn.click();

  assert.equal(coin.classList.contains('flipping'), true);
  assert.equal(flipBtn.disabled, true);
  assert.equal(roll.getPendingWins().length, 0);

  coin.dispatchEvent({ type: 'animationend' });

  assert.equal(coin.classList.contains('flipping'), false);
  assert.equal(coin.classList.contains('show-heads'), true);
  assert.equal(roll.el.querySelector('.flip-live').textContent, '');
  assert.equal(roll.getPendingWins().length, 0);
  assert.equal(timers.pending()[0], 500);

  timers.fireAll();

  assert.equal(roll.el.querySelector('.flip-live').textContent, 'It matches! Card kept.');
  assert.equal(roll.getPendingWins().length, 1);
  assert.equal(coin.classList.contains('show-heads'), true);
  assert.equal(flipBtn.disabled, true);

  timers.fireAll();

  assert.equal(coin.classList.contains('show-heads'), false);
});

test('a coin that settles on tails announces tails and loses the roll', async (t) => {
  const { roll, timers } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0.9);
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  const flipBtn = roll.el.querySelector('.flip-button');
  const coin = roll.el.querySelector('.coin-container').querySelector('.coin');
  flipBtn.click();
  coin.dispatchEvent({ type: 'animationend' });
  timers.fireAll();

  assert.equal(coin.classList.contains('show-tails'), true);
  assert.equal(roll.el.querySelector('.flip-live').textContent, 'Tails — you lost the roll.');
  assert.equal(roll.getState(), 'lost');
  const flipPanel = roll.el.querySelector('.flip-panel');
  assert.equal(flipPanel.classList.contains('is-visible'), false);
  assert.equal(flipPanel.classList.contains('is-leaving'), true);
  const lossEl = roll.el.querySelector('.roll-loss');
  assert.equal(lossEl.classList.contains('is-visible'), true);
  assert.match(lossEl.textContent, /You lost the roll/);
  const losingCard = roll.getCards()[roll.getFlipOrder()[0]];
  assert.equal(losingCard.classList.contains('shake'), true);
  assert.equal(losingCard.classList.contains('lost-tint'), true);
});

test('a second Flip press during the coin spin is ignored', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  const flipBtn = roll.el.querySelector('.flip-button');
  const coin = roll.el.querySelector('.coin-container').querySelector('.coin');
  flipBtn.click();
  flipBtn.click();

  assert.equal(roll.getPendingWins().length, 0);
  assert.equal(coin.classList.contains('flipping'), true);
});

test('a win reveals the card and records a pending win', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  const firstPos = roll.getFlipOrder()[0];
  roll.setCall('heads');
  const outcome = await roll.resolveFlip('heads');

  assert.equal(outcome.outcome, 'win');
  assert.equal(roll.getPendingWins().length, 1);
  const firstCard = roll.getCards()[firstPos];
  assert.equal(firstCard.classList.contains('covered'), false);
  assert.ok(firstCard.querySelector('.card-inner').querySelector('.card-front').querySelector('img'));
});

test('a win flashes the card and floats a plus-one badge', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  const firstPos = roll.getFlipOrder()[0];
  roll.setCall('heads');
  await roll.resolveFlip('heads');

  const wonCard = roll.getCards()[firstPos];
  assert.equal(wonCard.classList.contains('win-flash'), true);

  const badge = wonCard.querySelector('.float-badge');
  assert.ok(badge, 'float badge exists');
  assert.equal(badge.textContent, '+1');

  badge.dispatchEvent({ type: 'animationend' });
  assert.equal(wonCard.querySelector('.float-badge'), null);
});

test('the next card is not focused until the win pause elapses', async (t) => {
  const { roll, timers } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  await roll.resolveFlip('heads');

  const secondPos = roll.getFlipOrder()[1];
  const cards = roll.getCards();
  assert.equal(cards[secondPos].classList.contains('focused'), false);
  assert.equal(timers.pending()[0], 3000);

  timers.fireAll();

  assert.equal(cards[secondPos].classList.contains('focused'), true);
});

test('the roll button stays locked briefly after a loss', async (t) => {
  const { roll, timers } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0.9);
  roll.setBalance(10);
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  await roll.resolveFlip('tails');

  const button = roll.el.querySelector('button');
  assert.equal(button.disabled, true);
  assert.ok(timers.pending().includes(1000), 'loss lockout timer is pending');

  timers.fireAll();

  assert.equal(button.disabled, false);
});

test('startRoll fires onRollStart and onRollFail on a blocked pool', async (t) => {
  let started = 0;
  let failed = 0;
  const { doc } = createDocument();
  const timers = fakeTimers();
  const roll = createRoll({
    document: doc,
    fetch: async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'insufficient pool' }),
    }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onRollStart: () => {
      started += 1;
    },
    onRollFail: () => {
      failed += 1;
    },
  });
  t.after(() => roll.destroy());
  roll.setBanner(banner);

  const posts = await roll.startRoll();

  assert.equal(posts, null);
  assert.equal(started, 1);
  assert.equal(failed, 1);
});

test('a successful roll fires onRollStart but not onRollFail', async (t) => {
  let started = 0;
  let failed = 0;
  const { doc } = createDocument();
  const timers = fakeTimers();
  const roll = createRoll({
    document: doc,
    fetch: fakeFetch({ posts: fivePosts }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onRollStart: () => {
      started += 1;
    },
    onRollFail: () => {
      failed += 1;
    },
  });
  t.after(() => roll.destroy());
  roll.setBanner(banner);

  const posts = await roll.startRoll();

  assert.equal(posts.length, 5);
  assert.equal(started, 1);
  assert.equal(failed, 0);
});

test('a loss fires the onLost callback', async (t) => {
  let lost = 0;
  const { doc } = createDocument();
  const timers = fakeTimers();
  const roll = createRoll({
    document: doc,
    fetch: fakeFetch({ posts: fivePosts }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    random: () => 0,
    onLost: () => {
      lost += 1;
    },
  });
  t.after(() => roll.destroy());
  roll.setBanner(banner);
  await roll.startRoll();
  roll.coverCards();
  roll.setCall('heads');
  await roll.resolveFlip('tails');

  assert.equal(lost, 1);
});

test('banking animates the cards out and fires onCelebrateDone', async (t) => {
  let celebrated = 0;
  const { doc } = createDocument();
  const timers = fakeTimers();
  const roll = createRoll({
    document: doc,
    fetch: fakeFetch({ posts: fivePosts }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    random: () => 0,
    onCelebrateDone: () => {
      celebrated += 1;
    },
  });
  t.after(() => roll.destroy());
  roll.setBanner(banner);
  await roll.startRoll();
  roll.coverCards();
  roll.setCall('heads');
  await roll.resolveFlip('heads');

  const grid = roll.el.querySelector('.roll-grid');
  const results = roll.el.querySelector('.roll-results');
  assert.equal(grid.classList.contains('exit-up'), false);

  await roll.bankPending();

  assert.equal(grid.classList.contains('exit-up'), true);
  assert.equal(results.classList.contains('exit-down'), true);
  assert.equal(celebrated, 0);

  timers.fireAll();

  assert.equal(celebrated, 1);

  await roll.startRoll();
  assert.equal(grid.classList.contains('exit-up'), false);
  assert.equal(results.classList.contains('exit-down'), false);
});

test('a re-roll after a loss animates the old cards out first', async (t) => {
  const { roll, timers } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0.9);
  await roll.startRoll();
  roll.coverCards();
  roll.setCall('heads');
  await roll.resolveFlip('tails');
  assert.equal(roll.getState(), 'lost');

  const grid = roll.el.querySelector('.roll-grid');
  assert.equal(grid.querySelectorAll('.card').length, 5);

  const posts = roll.startRoll();
  assert.equal(grid.classList.contains('exit-up'), true);

  timers.fireAll();

  const result = await posts;
  assert.equal(result.length, 5);
  assert.equal(grid.classList.contains('exit-up'), false);
  assert.equal(grid.querySelectorAll('.card').length, 5);
});

test('a re-roll clears stale cards before the pool resolves', async (t) => {
  let releasePool = null;
  let deferPool = false;
  const fetchImpl = async (url, opts = {}) => {
    if (opts.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ downloaded: true }) };
    }
    if (url.includes('/api/roll/pool') && !deferPool) {
      return { ok: true, status: 200, json: async () => ({ posts: fivePosts }) };
    }
    return new Promise((resolve) => {
      releasePool = resolve;
    });
  };
  const { roll } = coveredRoll(t, fetchImpl, () => 0);
  await roll.startRoll();
  roll.coverCards();
  roll.setCall('heads');
  await roll.resolveFlip('heads');
  await roll.bankPending();

  const grid = roll.el.querySelector('.roll-grid');
  assert.equal(grid.querySelectorAll('.card').length, 5);

  deferPool = true;
  const posts = roll.startRoll();
  assert.equal(grid.querySelectorAll('.card').length, 0);

  releasePool({ ok: true, status: 200, json: async () => ({ posts: fivePosts }) });
  const result = await posts;
  assert.equal(result.length, 5);
  assert.equal(grid.querySelectorAll('.card').length, 5);
});

test('a loss erases pending wins and ends the roll', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  await roll.resolveFlip('heads');
  assert.equal(roll.getPendingWins().length, 1);

  roll.setCall('heads');
  const outcome = await roll.resolveFlip('tails');

  assert.equal(outcome.outcome, 'loss');
  assert.equal(roll.getState(), 'lost');
  assert.equal(roll.getPendingWins().length, 0);
  assert.match(roll.el.querySelector('.roll-loss').textContent, /You lost the roll/);
});

test('backing out banks the pending wins and shows only banked images', async (t) => {
  const banked = [];
  const { roll } = coveredRoll(
    t,
    routingFetch({
      pool: fivePosts,
      onBank: (url) => banked.push(url),
    }),
    () => 0,
  );
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  await roll.resolveFlip('heads');
  roll.setCall('heads');
  await roll.resolveFlip('heads');

  const won = await roll.bankPending();

  assert.equal(won.length, 2);
  assert.equal(banked.length, 2);
  assert.match(banked[0], /\/api\/roll\/\d+$/);
  assert.match(banked[1], /\/api\/roll\/\d+$/);
  assert.equal(roll.getState(), 'banked');
  const results = roll.el.querySelector('.roll-results');
  assert.equal(results.hidden, false);
  assert.match(results.textContent, /You kept 2 images/);
  assert.equal(results.querySelectorAll('.card').length, 2);
});

test('banking hides the flip panel', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  await roll.resolveFlip('heads');

  const flipPanel = roll.el.querySelector('.flip-panel');
  assert.equal(flipPanel.classList.contains('is-visible'), true);

  await roll.bankPending();

  assert.equal(flipPanel.classList.contains('is-visible'), false);
});

test('a second back-out press does not wipe the results', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  await roll.resolveFlip('heads');
  await roll.bankPending();

  const second = await roll.bankPending();

  assert.deepEqual(second, []);
  const results = roll.el.querySelector('.roll-results');
  assert.equal(results.hidden, false);
  assert.match(results.textContent, /You kept 1 image/);
  assert.equal(results.querySelectorAll('.card').length, 1);
});

test('banking fires the onBanked callback', async (t) => {
  let bankedEvents = 0;
  const { doc } = createDocument();
  const timers = fakeTimers();
  const roll = createRoll({
    document: doc,
    fetch: fakeFetch({ posts: fivePosts }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    random: () => 0,
    onBanked: () => {
      bankedEvents += 1;
    },
  });
  t.after(() => roll.destroy());
  roll.setBanner(banner);
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  await roll.resolveFlip('heads');
  await roll.bankPending();

  assert.equal(bankedEvents, 1);
});

test('winning all 5 flips banks all 5 images', async (t) => {
  const banked = [];
  const { roll } = coveredRoll(
    t,
    routingFetch({
      pool: fivePosts,
      onBank: (url) => banked.push(url),
    }),
    () => 0,
  );
  await roll.startRoll();
  roll.coverCards();

  let outcome = null;
  for (let i = 0; i < 5; i++) {
    roll.setCall('heads');
    outcome = await roll.resolveFlip('heads');
  }

  assert.equal(outcome.outcome, 'banked');
  assert.equal(outcome.banked.length, 5);
  assert.equal(banked.length, 5);
  assert.equal(roll.getState(), 'banked');
  const results = roll.el.querySelector('.roll-results');
  assert.match(results.textContent, /You kept 5 images/);
  assert.equal(results.querySelectorAll('.card').length, 5);
});

test('a loss shows zero banked images', async (t) => {
  const { roll } = coveredRoll(t, fakeFetch({ posts: fivePosts }), () => 0);
  await roll.startRoll();
  roll.coverCards();

  roll.setCall('heads');
  await roll.resolveFlip('tails');

  const results = roll.el.querySelector('.roll-results');
  assert.equal(results.hidden, false);
  assert.match(results.textContent, /You kept 0 images/);
  assert.equal(results.querySelectorAll('.card').length, 0);
});

test('coin flip is a fair heads or tails from a random value', (t) => {
  const { roll } = makeRoll(t, fakeFetch({ posts: fivePosts }));

  assert.equal(roll.flipCoin(0), 'heads');
  assert.equal(roll.flipCoin(0.49), 'heads');
  assert.equal(roll.flipCoin(0.5), 'tails');
  assert.equal(roll.flipCoin(0.99), 'tails');
});

test('loadBalance shows the balance and disables the roll button at zero', async (t) => {
  const { roll } = makeRoll(
    t,
    fakeFetch({ balance: 0 }, 200),
  );
  roll.setBanner(banner);

  await roll.loadBalance();

  assert.equal(roll.getBalance(), 0);
  assert.match(roll.el.textContent, /Rolls: 0/);
  assert.equal(roll.el.querySelector('button').disabled, true);
});

test('a successful roll updates the displayed balance', async (t) => {
  const { roll } = makeRoll(
    t,
    fakeFetch({ posts: fivePosts, balance: 9 }),
  );
  roll.setBanner(banner);
  roll.setBalance(10);

  await roll.startRoll();

  assert.match(roll.el.textContent, /Rolls: 9/);
  assert.equal(roll.el.querySelector('button').disabled, false);
});

test('an insufficient balance blocks the roll with an error', async (t) => {
  const { roll } = makeRoll(t, fakeFetch({ error: 'insufficient balance' }, 402));
  roll.setBanner(banner);

  const posts = await roll.startRoll();

  assert.equal(posts, null);
  const errorEl = roll.el.querySelector('.roll-error');
  assert.equal(errorEl.hidden, false);
  assert.equal(errorEl.textContent, 'insufficient balance');
});
