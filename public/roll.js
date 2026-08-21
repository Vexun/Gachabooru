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
  onRollStart,
  onRollFail,
  onLost,
  onCelebrateDone,
}) {
  const setTimeoutImpl = timerSetTimeout || setTimeout;
  const clearTimeoutImpl = timerClearTimeout || clearTimeout;
  const PEEK_MS = 3000;
  const SLIDE_STEP_MS = 80;
  const SLIDE_DURATION_MS = 600;
  const FLIP_DURATION_MS = 600;
  const COIN_DURATION_MS = 900;
  const COIN_MAX_DURATION_MS = 3000;
  const COIN_LONG_SPIN_MS = 1950;
  const RESOLVE_DELAY_MS = 600;
  const WIN_PAUSE_MS = 2000;
  const LOSS_LOCKOUT_MS = 2000;
  const PANEL_SLIDE_MS = 500;
  const PRESS_MS = 150;
  const SHAKE_MS = 500;
  const EXIT_MS = 600;
  const CELEBRATE_MS = 1200;
  const HERO_DELAY_MS = 1000;
  const FALLBACK_BUFFER_MS = 200;

  const root = document.createElement('div');
  root.className = 'roll';

  const bannerLabel = document.createElement('div');
  bannerLabel.className = 'roll-banner';

  const balanceEl = document.createElement('div');
  balanceEl.className = 'roll-balance';
  balanceEl.textContent = 'Rolls: \u2026';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'roll-button';
  button.textContent = 'Roll';
  button.disabled = true;

  const grid = document.createElement('div');
  grid.className = 'roll-grid';

  // The wrap keeps the loading overlay anchored to the card area so it
  // does not drift when the component height changes.
  const gridWrap = document.createElement('div');
  gridWrap.className = 'roll-grid-wrap';

  const loadingEl = document.createElement('div');
  loadingEl.className = 'roll-loading';
  loadingEl.setAttribute('aria-hidden', 'true');
  const spinner = document.createElement('div');
  spinner.className = 'roll-spinner';
  loadingEl.append(spinner);

  gridWrap.append(grid, loadingEl);

  const errorEl = document.createElement('div');
  errorEl.className = 'roll-error';
  errorEl.hidden = true;

  const flipPanel = document.createElement('div');
  flipPanel.className = 'flip-panel';

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

  const coinContainer = document.createElement('div');
  coinContainer.className = 'coin-container';
  coinContainer.setAttribute('aria-hidden', 'true');
  const coin = document.createElement('div');
  coin.className = 'coin';
  const headsFace = document.createElement('div');
  headsFace.className = 'coin-face coin-heads';
  const star = document.createElement('div');
  star.className = 'coin-star';
  headsFace.append(star);
  const tailsFace = document.createElement('div');
  tailsFace.className = 'coin-face coin-tails';
  const tag = document.createElement('div');
  tag.className = 'coin-tag';
  tag.setAttribute('data-hole', '');
  tailsFace.append(tag);
  coin.append(headsFace, tailsFace);
  coinContainer.append(coin);

  flipPanel.append(
    flipStatus,
    coinContainer,
    callHeads,
    callTails,
    flipBtn,
    backOutBtn,
    flipResult,
    liveRegion,
  );

  const resultsEl = document.createElement('div');
  resultsEl.className = 'roll-results';

  const lossEl = document.createElement('div');
  lossEl.className = 'roll-loss';

  root.append(bannerLabel, balanceEl, button, gridWrap, flipPanel, lossEl, resultsEl, errorEl);

  let banner = null;
  let posts = [];
  let cards = [];
  let state = 'idle';
  let coverTimer = null;
  let entranceTimer = null;
  let flipTimer = null;
  let coinTimer = null;
  let resolveTimer = null;
  let focusTimer = null;
  let panelTimer = null;
  let rollLockTimer = null;
  let exitTimer = null;
  let pressTimer = null;
  let flipping = false;
  let rollSeq = 0;
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

  function setRollLoading(loading) {
    button.classList.toggle('loading', loading);
    button.textContent = loading ? 'Summoning\u2026' : 'Roll';
    button.disabled = loading || !banner || balance < 1;
  }

  function showLoading() {
    gridWrap.classList.add('is-loading');
    loadingEl.classList.add('is-visible');
  }

  function hideLoading() {
    gridWrap.classList.remove('is-loading');
    loadingEl.classList.remove('is-visible');
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
    state = 'loading';
    grid.textContent = '';
    cards = posts.map((post, idx) => {
      const card = document.createElement('figure');
      card.className = 'card covered pre-entry';
      card.dataset.postId = String(post.id);
      card.dataset.position = String(idx + 1);

      const inner = document.createElement('div');
      inner.className = 'card-inner';

      const front = document.createElement('div');
      front.className = 'card-front';
      const img = document.createElement('img');
      img.src = imgSrc(post.large_file_url || post.preview_file_url || post.file_url);
      img.alt = `post ${post.id}`;
      front.append(img);

      const back = document.createElement('div');
      back.className = 'card-back';
      const number = document.createElement('span');
      number.className = 'card-number';
      number.textContent = String(idx + 1);
      back.append(number);

      inner.append(front, back);
      card.append(inner);

      if (post.score >= 100) {
        card.classList.add('rarity-gold');
      } else if (post.score >= 50) {
        card.classList.add('rarity-silver');
      }

      grid.append(card);
      return card;
    });
    waitForImages();
  }

  function waitForImages() {
    const mySeq = ++rollSeq;
    let settled = 0;
    const total = cards.length;
    const images = cards.map((card) => card.querySelector('.card-front').querySelector('img'));

    function settle() {
      if (mySeq !== rollSeq) {
        return;
      }
      settled += 1;
      if (settled >= total) {
        beginEntrance();
      }
    }

    for (const img of images) {
      if (img.complete) {
        settle();
        continue;
      }
      img.addEventListener('load', settle);
      img.addEventListener('error', settle);
    }
  }

  function beginEntrance() {
    state = 'entering';
    hideLoading();
    for (const card of cards) {
      card.classList.remove('pre-entry');
      card.classList.add('entering');
    }
    const last = cards[cards.length - 1];
    const onSlideDone = () => revealCards();
    last.addEventListener('animationend', onSlideDone, { once: true });
    const lastStartMs = (cards.length - 1) * SLIDE_STEP_MS;
    entranceTimer = setTimeoutImpl(
      onSlideDone,
      lastStartMs + SLIDE_DURATION_MS + FALLBACK_BUFFER_MS,
    );
  }

  function revealCards() {
    if (state !== 'entering') {
      return;
    }
    state = 'revealed';
    if (entranceTimer) {
      clearTimeoutImpl(entranceTimer);
      entranceTimer = null;
    }
    for (const card of cards) {
      // The slide-in is done; drop `.entering` so removing `.revealed`
      // later cannot restart the slide-in animation on gold cards.
      card.classList.remove('entering');
      card.classList.remove('covered');
      card.classList.add('revealed');
    }
    const lastInner = cards[cards.length - 1].querySelector('.card-inner');
    const onFlipped = () => beginPeek();
    lastInner.addEventListener('transitionend', onFlipped, { once: true });
    flipTimer = setTimeoutImpl(onFlipped, FLIP_DURATION_MS + FALLBACK_BUFFER_MS);
  }

  function revealCard(pos) {
    const card = cards[pos];
    if (!card) {
      return;
    }
    card.classList.remove('covered');
  }

  function coverCards() {
    state = 'covered';
    coverTimer = null;
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.add('covered');
      cards[i].classList.remove('revealed');
    }
    beginFlips();
  }

  function beginPeek() {
    if (state !== 'revealed') {
      return;
    }
    state = 'peek';
    if (flipTimer) {
      clearTimeoutImpl(flipTimer);
      flipTimer = null;
    }
    if (coverTimer) {
      clearTimeoutImpl(coverTimer);
    }
    coverTimer = setTimeoutImpl(coverCards, PEEK_MS);
  }

  function cancelCover() {
    rollSeq += 1;
    flipping = false;
    if (coverTimer) {
      clearTimeoutImpl(coverTimer);
      coverTimer = null;
    }
    if (entranceTimer) {
      clearTimeoutImpl(entranceTimer);
      entranceTimer = null;
    }
    if (flipTimer) {
      clearTimeoutImpl(flipTimer);
      flipTimer = null;
    }
    if (coinTimer) {
      clearTimeoutImpl(coinTimer);
      coinTimer = null;
    }
    if (resolveTimer) {
      clearTimeoutImpl(resolveTimer);
      resolveTimer = null;
    }
    if (focusTimer) {
      clearTimeoutImpl(focusTimer);
      focusTimer = null;
    }
    if (panelTimer) {
      clearTimeoutImpl(panelTimer);
      panelTimer = null;
    }
    if (rollLockTimer) {
      clearTimeoutImpl(rollLockTimer);
      rollLockTimer = null;
    }
    if (exitTimer) {
      clearTimeoutImpl(exitTimer);
      exitTimer = null;
    }
    if (pressTimer) {
      clearTimeoutImpl(pressTimer);
      pressTimer = null;
    }
  }

  function beginFlips() {
    flipOrder = shuffleIndices(cards.length, random);
    flipIndex = 0;
    pendingWins = [];
    call = null;
    renderFlipControls();
  }

  function focusCard(pos) {
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (i !== pos) {
        if (card.classList.contains('covered')) {
          card.classList.add('dimmed');
        } else {
          card.classList.remove('dimmed');
        }
        // Slide neighbors away so the expanded card keeps an even gap.
        card.classList.toggle('shift-left', i < pos);
        card.classList.toggle('shift-right', i > pos);
      } else {
        card.classList.remove('dimmed', 'shift-left', 'shift-right');
      }
    }
    const active = cards[pos];
    if (active) {
      active.classList.add('focused');
    }
  }

  function unfocusCards() {
    for (const card of cards) {
      card.classList.remove('focused', 'dimmed', 'shift-left', 'shift-right');
    }
  }

  function showBackOut(visible) {
    const wasHidden = backOutBtn.hidden;
    backOutBtn.hidden = !visible;
    if (visible) {
      if (wasHidden) {
        backOutBtn.classList.add('entering');
      }
    } else {
      backOutBtn.classList.remove('entering');
    }
  }

  function flashPress(btn) {
    callHeads.classList.remove('pressed');
    callTails.classList.remove('pressed');
    btn.classList.add('pressed');
    if (pressTimer) {
      clearTimeoutImpl(pressTimer);
    }
    pressTimer = setTimeoutImpl(() => {
      pressTimer = null;
      callHeads.classList.remove('pressed');
      callTails.classList.remove('pressed');
    }, PRESS_MS);
  }

  function renderFlipControls() {
    flipPanel.classList.add('is-visible');
    flipPanel.classList.remove('is-leaving');
    if (panelTimer) {
      clearTimeoutImpl(panelTimer);
      panelTimer = null;
    }
    flipResult.textContent = '';
    flipping = false;
    if (coinTimer) {
      clearTimeoutImpl(coinTimer);
      coinTimer = null;
    }
    if (resolveTimer) {
      clearTimeoutImpl(resolveTimer);
      resolveTimer = null;
    }
    coin.classList.remove('show-heads');
    coin.classList.remove('show-tails');
    callHeads.disabled = false;
    callTails.disabled = false;
    flipBtn.disabled = true;
    showBackOut(pendingWins.length > 0);
    flipStatus.textContent = `Card ${flipOrder[flipIndex] + 1}: call heads or tails`;
    unfocusCards();
    focusCard(flipOrder[flipIndex]);
    callHeads.focus();
  }

  function showFloatBadge(card) {
    const badge = document.createElement('div');
    badge.className = 'float-badge';
    badge.textContent = '+1';
    card.append(badge);
    badge.addEventListener('animationend', () => badge.remove(), { once: true });
  }

  function hideFlipPanel(onHidden) {
    flipPanel.classList.remove('is-visible');
    flipPanel.classList.add('is-leaving');
    let done = false;
    const onLeave = () => {
      if (done) {
        return;
      }
      done = true;
      flipPanel.classList.remove('is-leaving');
      if (panelTimer) {
        clearTimeoutImpl(panelTimer);
        panelTimer = null;
      }
      if (onHidden) {
        onHidden();
      }
    };
    flipPanel.addEventListener('animationend', onLeave, { once: true });
    panelTimer = setTimeoutImpl(onLeave, PANEL_SLIDE_MS + FALLBACK_BUFFER_MS);
  }

  function coinDurationMs() {
    const span = COIN_MAX_DURATION_MS - COIN_DURATION_MS;
    return COIN_DURATION_MS + Math.floor(random() * span);
  }

  function animateCoin(result, callback) {
    if (flipping) {
      return;
    }
    flipping = true;
    flipBtn.disabled = true;
    const durationMs = coinDurationMs();
    coin.style.animationDuration = `${durationMs}ms`;
    // The spin's keyframes end on the actual result face, so the settle
    // switch below never has to jump to the other side.
    coin.classList.remove('to-heads', 'to-tails', 'spin-long');
    coin.classList.add(result === 'heads' ? 'to-heads' : 'to-tails');
    if (durationMs >= COIN_LONG_SPIN_MS) {
      coin.classList.add('spin-long');
    }
    coin.classList.add('flipping');
    const onSettled = () => {
      if (!flipping) {
        return;
      }
      flipping = false;
      if (coinTimer) {
        clearTimeoutImpl(coinTimer);
        coinTimer = null;
      }
      coin.style.animationDuration = '';
      coin.classList.remove('flipping');
      coin.classList.add(result === 'heads' ? 'show-heads' : 'show-tails');
      resolveTimer = setTimeoutImpl(() => {
        resolveTimer = null;
        liveRegion.textContent = result === 'heads' ? 'Heads.' : 'Tails.';
        callback();
      }, RESOLVE_DELAY_MS);
    };
    coin.addEventListener('animationend', onSettled, { once: true });
    coinTimer = setTimeoutImpl(onSettled, durationMs + FALLBACK_BUFFER_MS);
  }

  function setCall(side) {
    if (state !== 'covered') {
      return;
    }
    call = side;
    callHeads.disabled = true;
    callTails.disabled = true;
    flipBtn.disabled = false;
    flipBtn.focus();
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
    if (focusTimer) {
      clearTimeoutImpl(focusTimer);
      focusTimer = null;
    }
    flipPanel.classList.remove('is-visible');
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
    const noun = won.length === 1 ? 'image' : 'images';
    liveRegion.textContent = `You kept ${won.length} ${noun}.`;
    if (onBanked) {
      onBanked();
    }
    for (const post of won) {
      const idx = posts.indexOf(post);
      if (idx !== -1) {
        cards[idx].classList.add('celebrating');
      }
    }
    let done = false;
    const onExitDone = () => {
      if (done) {
        return;
      }
      done = true;
      if (exitTimer) {
        clearTimeoutImpl(exitTimer);
        exitTimer = null;
      }
      // Pause before handing the page back to the hero.
      exitTimer = setTimeoutImpl(() => {
        exitTimer = null;
        if (onCelebrateDone) {
          onCelebrateDone();
        }
        button.focus();
      }, HERO_DELAY_MS);
    };
    exitTimer = setTimeoutImpl(() => {
      grid.classList.add('exit-up');
      resultsEl.classList.add('exit-down');
      grid.addEventListener('animationend', onExitDone, { once: true });
      resultsEl.addEventListener('animationend', onExitDone, { once: true });
      exitTimer = setTimeoutImpl(onExitDone, EXIT_MS + FALLBACK_BUFFER_MS);
    }, CELEBRATE_MS);
    return won;
  }

  async function resolveFlip(result) {
    if (state !== 'covered') {
      return null;
    }
    if (focusTimer) {
      clearTimeoutImpl(focusTimer);
      focusTimer = null;
    }
    const pos = flipOrder[flipIndex];
    if (result !== call) {
      state = 'lost';
      pendingWins = [];
      const losingCard = cards[pos];
      losingCard.classList.add('shake', 'lost-tint');
      unfocusCards();
      lossEl.textContent = 'You lost the roll. No images are kept.';
      lossEl.classList.add('is-visible');
      liveRegion.textContent = `${result[0].toUpperCase()}${result.slice(1)} — you lost the roll.`;
      // Fade the panel down only after the shake ends, then tell the app
      // so the top controls can drop back in.
      let finished = false;
      const hideAfterShake = () => {
        if (finished) {
          return;
        }
        finished = true;
        if (panelTimer) {
          clearTimeoutImpl(panelTimer);
          panelTimer = null;
        }
        losingCard.removeEventListener('animationend', hideAfterShake);
        hideFlipPanel(() => {
          if (onLost) {
            onLost();
          }
        });
      };
      losingCard.addEventListener('animationend', hideAfterShake, { once: true });
      panelTimer = setTimeoutImpl(hideAfterShake, SHAKE_MS + FALLBACK_BUFFER_MS);
      renderResults([]);
      button.disabled = true;
      rollLockTimer = setTimeoutImpl(() => {
        rollLockTimer = null;
        setBalance(balance);
        button.focus();
      }, LOSS_LOCKOUT_MS);
      return { outcome: 'loss' };
    }
    revealCard(pos);
    const wonCard = cards[pos];
    wonCard.classList.add('win-flash');
    showFloatBadge(wonCard);
    unfocusCards();
    pendingWins.push(posts[pos]);
    flipIndex += 1;
    if (flipIndex >= cards.length) {
      const banked = await bankPending();
      return { outcome: 'banked', banked };
    }
    flipResult.textContent = `It was ${result} — it matches! Card kept. ${5 - flipIndex} to go.`;
    liveRegion.textContent = 'It matches! Card kept.';
    focusTimer = setTimeoutImpl(() => {
      focusTimer = null;
      renderFlipControls();
    }, WIN_PAUSE_MS);
    return { outcome: 'win', pending: pendingWins.length, done: false };
  }

  function renderResults(banked) {
    resultsEl.textContent = '';
    const heading = document.createElement('h2');
    heading.className = 'heading-bounce';
    const noun = banked.length === 1 ? 'image' : 'images';
    heading.textContent = `You kept ${banked.length} ${noun}`;
    resultsEl.append(heading);
    if (banked.length > 0) {
      const resultGrid = document.createElement('div');
      resultGrid.className = 'roll-grid';
      for (const post of banked) {
        const card = document.createElement('figure');
        card.className = 'card entering';
        const img = document.createElement('img');
        img.src = imgSrc(post.large_file_url || post.file_url);
        img.alt = `post ${post.id}`;
        card.append(img);
        resultGrid.append(card);
      }
      resultsEl.append(resultGrid);
    }
    resultsEl.classList.add('is-visible');
  }

  function clearRollUi() {
    hideLoading();
    flipPanel.classList.remove('is-visible');
    flipPanel.classList.remove('is-leaving');
    grid.classList.remove('exit-up');
    resultsEl.classList.remove('exit-down');
    flipResult.textContent = '';
    resultsEl.classList.remove('is-visible');
    errorEl.hidden = true;
    lossEl.classList.remove('is-visible');
    lossEl.textContent = '';
    flipOrder = [];
    flipIndex = 0;
    pendingWins = [];
    call = null;
    unfocusCards();
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

  function exitGridCards() {
    return new Promise((resolve) => {
      grid.classList.add('exit-up');
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        if (exitTimer) {
          clearTimeoutImpl(exitTimer);
          exitTimer = null;
        }
        grid.classList.remove('exit-up');
        grid.textContent = '';
        cards = [];
        resolve();
      };
      grid.addEventListener('animationend', finish, { once: true });
      exitTimer = setTimeoutImpl(finish, EXIT_MS + FALLBACK_BUFFER_MS);
    });
  }

  async function startRoll() {
    errorEl.hidden = true;
    cancelCover();
    clearRollUi();
    setRollLoading(true);
    if (onRollStart) {
      await onRollStart();
    }
    if (state === 'lost' && grid.children.length > 0) {
      await exitGridCards();
    } else {
      grid.textContent = '';
      cards = [];
    }
    // Show the spinner only once the previous cards have finished moving
    // up and out, so it fades in on a settled card area.
    showLoading();
    try {
      const nextPosts = await requestPool();
      setRollLoading(false);
      if (!nextPosts) {
        hideLoading();
        if (onRollFail) {
          onRollFail();
        }
        return null;
      }
      renderCards(nextPosts);
      return nextPosts;
    } catch (err) {
      setRollLoading(false);
      hideLoading();
      showError(`Network error: ${err.message}`);
      if (onRollFail) {
        onRollFail();
      }
      return null;
    }
  }

  function destroy() {
    cancelCover();
  }

  callHeads.addEventListener('click', () => {
    flashPress(callHeads);
    setCall('heads');
  });
  callTails.addEventListener('click', () => {
    flashPress(callTails);
    setCall('tails');
  });
  flipBtn.addEventListener('click', () => {
    const result = flipCoin(random());
    animateCoin(result, () => resolveFlip(result));
  });
  backOutBtn.addEventListener('click', () => {
    bankPending();
  });
  backOutBtn.addEventListener('animationend', () => {
    backOutBtn.classList.remove('entering');
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
    revealCard,
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
