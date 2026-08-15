'use strict';

function shuffleIndices(n, random) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function imgSrc(url) {
  return `/api/image?url=${encodeURIComponent(url)}`;
}

function createRoll({
  document,
  fetch: fetchImpl,
  setTimeout: timerSetTimeout,
  clearTimeout: timerClearTimeout,
  random = Math.random,
  onBanked,
}) {
  const setTimeoutImpl = timerSetTimeout || setTimeout;
  const clearTimeoutImpl = timerClearTimeout || clearTimeout;
  const PEEK_MS = 3000;

  const root = document.createElement('div');
  root.className = 'roll';

  const bannerLabel = document.createElement('div');
  bannerLabel.className = 'roll-banner';

  const balanceEl = document.createElement('div');
  balanceEl.className = 'roll-balance';
  balanceEl.textContent = 'Rolls: \u2026';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Roll';
  button.disabled = true;

  const grid = document.createElement('div');
  grid.className = 'roll-grid';

  const errorEl = document.createElement('div');
  errorEl.className = 'roll-error';
  errorEl.hidden = true;

  const flipPanel = document.createElement('div');
  flipPanel.className = 'flip-panel';
  flipPanel.hidden = true;

  const flipStatus = document.createElement('div');
  flipStatus.className = 'flip-status';

  const callHeads = document.createElement('button');
  callHeads.type = 'button';
  callHeads.className = 'call-heads';
  callHeads.textContent = 'Heads';

  const callTails = document.createElement('button');
  callTails.type = 'button';
  callTails.className = 'call-tails';
  callTails.textContent = 'Tails';

  const flipBtn = document.createElement('button');
  flipBtn.type = 'button';
  flipBtn.className = 'flip-button';
  flipBtn.textContent = 'Flip';
  flipBtn.disabled = true;

  const backOutBtn = document.createElement('button');
  backOutBtn.type = 'button';
  backOutBtn.className = 'back-out';
  backOutBtn.textContent = 'Back out & bank';
  backOutBtn.hidden = true;

  const flipResult = document.createElement('div');
  flipResult.className = 'flip-result';

  const liveRegion = document.createElement('div');
  liveRegion.className = 'flip-live sr-only';
  liveRegion.setAttribute('aria-live', 'polite');

  flipPanel.append(flipStatus, callHeads, callTails, flipBtn, backOutBtn, flipResult, liveRegion);

  const resultsEl = document.createElement('div');
  resultsEl.className = 'roll-results';
  resultsEl.hidden = true;

  root.append(bannerLabel, balanceEl, button, grid, flipPanel, resultsEl, errorEl);

  let banner = null;
  let posts = [];
  let cards = [];
  let state = 'idle';
  let coverTimer = null;
  let flipOrder = [];
  let flipIndex = 0;
  let pendingWins = [];
  let call = null;
  let balance = 0;

  function setBalance(value) {
    balance = value;
    balanceEl.textContent = `Rolls: ${balance}`;
    button.disabled = !banner || balance < 1;
  }

  function setBanner(tag) {
    banner = tag;
    bannerLabel.textContent = tag ? `Banner: ${tag.label}` : '';
    button.disabled = !tag || balance < 1;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function renderCards(postList) {
    posts = postList;
    grid.textContent = '';
    cards = posts.map((post, idx) => {
      const card = document.createElement('figure');
      card.className = 'card';
      card.dataset.postId = String(post.id);
      card.dataset.position = String(idx + 1);
      const img = document.createElement('img');
      img.src = imgSrc(post.large_file_url || post.preview_file_url || post.file_url);
      img.alt = `post ${post.id}`;
      card.append(img);
      grid.append(card);
      return card;
    });
  }

  function revealCard(pos) {
    const card = cards[pos];
    if (!card) {
      return;
    }
    card.classList.remove('covered');
    const back = card.querySelector('.card-back');
    if (back) {
      back.remove();
    }
    const img = card.querySelector('img');
    if (img) {
      img.hidden = false;
    }
  }

  function coverCards() {
    state = 'covered';
    coverTimer = null;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      card.classList.add('covered');
      const img = card.querySelector('img');
      if (img) {
        img.hidden = true;
      }
      const back = document.createElement('div');
      back.className = 'card-back';
      back.dataset.number = String(i + 1);
      back.textContent = String(i + 1);
      card.append(back);
    }
    beginFlips();
  }

  function beginPeek() {
    state = 'peek';
    if (coverTimer) {
      clearTimeoutImpl(coverTimer);
    }
    coverTimer = setTimeoutImpl(coverCards, PEEK_MS);
  }

  function cancelCover() {
    if (coverTimer) {
      clearTimeoutImpl(coverTimer);
      coverTimer = null;
    }
  }

  function beginFlips() {
    flipOrder = shuffleIndices(cards.length, random);
    flipIndex = 0;
    pendingWins = [];
    call = null;
    renderFlipControls();
  }

  function renderFlipControls() {
    flipPanel.hidden = false;
    flipResult.textContent = '';
    callHeads.disabled = false;
    callTails.disabled = false;
    flipBtn.disabled = true;
    backOutBtn.hidden = pendingWins.length === 0;
    flipStatus.textContent = `Card ${flipOrder[flipIndex] + 1}: call heads or tails`;
  }

  function setCall(side) {
    if (state !== 'covered') {
      return;
    }
    call = side;
    callHeads.disabled = true;
    callTails.disabled = true;
    flipBtn.disabled = false;
    flipStatus.textContent = `You called ${call}. Flip the coin.`;
  }

  function flipCoin(value) {
    return value < 0.5 ? 'heads' : 'tails';
  }

  async function bankPending() {
    if (pendingWins.length === 0) {
      return [];
    }
    const won = [...pendingWins];
    pendingWins = [];
    flipPanel.hidden = true;
    for (const post of won) {
      try {
        await fetchImpl(`/api/roll/${post.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post, banner_tag: banner.value }),
        });
      } catch {
        // banking is idempotent; a failed call can be repeated later
      }
    }
    state = 'banked';
    renderResults(won);
    if (onBanked) {
      onBanked();
    }
    return won;
  }

  async function resolveFlip(result) {
    if (state !== 'covered') {
      return null;
    }
    const pos = flipOrder[flipIndex];
    if (result !== call) {
      state = 'lost';
      pendingWins = [];
      flipPanel.hidden = true;
      flipResult.textContent = `It was ${result} — you lost the roll. No images are kept.`;
      renderResults([]);
      return { outcome: 'loss' };
    }
    revealCard(pos);
    pendingWins.push(posts[pos]);
    flipIndex += 1;
    if (flipIndex >= cards.length) {
      const banked = await bankPending();
      return { outcome: 'banked', banked };
    }
    flipResult.textContent = `It was ${result} — it matches! Card kept. ${5 - flipIndex} to go.`;
    renderFlipControls();
    backOutBtn.hidden = false;
    return { outcome: 'win', pending: pendingWins.length, done: false };
  }

  function renderResults(banked) {
    resultsEl.textContent = '';
    const heading = document.createElement('h2');
    const noun = banked.length === 1 ? 'image' : 'images';
    heading.textContent = `You kept ${banked.length} ${noun}`;
    resultsEl.append(heading);
    if (banked.length > 0) {
      const resultGrid = document.createElement('div');
      resultGrid.className = 'roll-grid';
      for (const post of banked) {
        const card = document.createElement('figure');
        card.className = 'card';
        const img = document.createElement('img');
        img.src = imgSrc(post.large_file_url || post.file_url);
        img.alt = `post ${post.id}`;
        card.append(img);
        resultGrid.append(card);
      }
      resultsEl.append(resultGrid);
    }
    resultsEl.hidden = false;
  }

  function clearRollUi() {
    flipPanel.hidden = true;
    flipResult.textContent = '';
    resultsEl.hidden = true;
    errorEl.hidden = true;
    flipOrder = [];
    flipIndex = 0;
    pendingWins = [];
    call = null;
  }

  async function requestPool(tag = banner) {
    if (!tag) {
      return null;
    }
    const res = await fetchImpl(`/api/roll/pool?tag=${encodeURIComponent(tag.value)}`);
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Could not build a roll');
      return null;
    }
    if (typeof data.balance === 'number') {
      setBalance(data.balance);
    }
    return data.posts || [];
  }

  async function loadBalance() {
    try {
      const res = await fetchImpl('/api/balance');
      const data = await res.json();
      if (typeof data.balance === 'number') {
        setBalance(data.balance);
      }
    } catch {
      balanceEl.textContent = 'Rolls: ?';
    }
  }

  async function startRoll() {
    errorEl.hidden = true;
    cancelCover();
    clearRollUi();
    try {
      const nextPosts = await requestPool();
      if (!nextPosts) {
        return null;
      }
      renderCards(nextPosts);
      beginPeek();
      return nextPosts;
    } catch (err) {
      showError(`Network error: ${err.message}`);
      return null;
    }
  }

  function destroy() {
    cancelCover();
  }

  callHeads.addEventListener('click', () => setCall('heads'));
  callTails.addEventListener('click', () => setCall('tails'));
  flipBtn.addEventListener('click', () => {
    const result = flipCoin(random());
    resolveFlip(result);
  });
  backOutBtn.addEventListener('click', () => {
    bankPending();
  });
  button.addEventListener('click', () => {
    startRoll();
  });

  return {
    el: root,
    setBanner,
    setBalance,
    loadBalance,
    startRoll,
    requestPool,
    renderCards,
    coverCards,
    cancelCover,
    destroy,
    setCall,
    flipCoin,
    resolveFlip,
    bankPending,
    getBalance: () => balance,
    getFlipOrder: () => [...flipOrder],
    getPendingWins: () => [...pendingWins],
    getPosts: () => posts,
    getCards: () => cards,
    getBanner: () => banner,
    getState: () => state,
  };
}

if (typeof window !== 'undefined') {
  window.createRoll = createRoll;
}

if (typeof module !== 'undefined') {
  module.exports = { createRoll };
}
