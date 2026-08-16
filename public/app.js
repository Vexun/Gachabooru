'use strict';

function createApp({
  document,
  fetch: fetchImpl,
  createBannerPicker: pickerFactory,
  createRoll: rollFactory,
  createWebSocket,
  wireCloseDetection: closeDetection,
  setTimeout: timerSetTimeout,
  clearTimeout: timerClearTimeout,
}) {
  const setTimeoutImpl = timerSetTimeout || setTimeout;
  const clearTimeoutImpl = timerClearTimeout || clearTimeout;
  const HERO_FADE_MS = 600;
  const HERO_FADE_BUFFER_MS = 200;
  const statusEl = document.getElementById('server-status');
  const bannerSection = document.getElementById('banner-section');
  const rollSection = document.getElementById('roll-section');
  const gameState = { banner: null };
  const MODES = ['hero', 'rolling', 'top'];
  let heroFadeTimer = null;

  function setMode(mode) {
    for (const name of MODES) {
      document.body.classList.remove(`mode-${name}`);
    }
    document.body.classList.add(`mode-${mode}`);
  }

  function fadeHero() {
    return new Promise((resolve) => {
      document.body.classList.add('hero-leaving');
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        if (heroFadeTimer) {
          clearTimeoutImpl(heroFadeTimer);
          heroFadeTimer = null;
        }
        document.body.classList.remove('hero-leaving');
        resolve();
      };
      const hero = document.getElementById('hero-section');
      if (hero && hero.addEventListener) {
        hero.addEventListener('animationend', finish, { once: true });
      }
      heroFadeTimer = setTimeoutImpl(finish, HERO_FADE_MS + HERO_FADE_BUFFER_MS);
    });
  }

  async function refreshStatus() {
    try {
      const res = await fetchImpl('/api/health');
      const data = await res.json();
      if (statusEl) {
        statusEl.textContent = data.ok ? 'online' : 'error';
      }
    } catch {
      if (statusEl) {
        statusEl.textContent = 'unreachable';
      }
    }
  }

  function wireBannerPicker() {
    if (!bannerSection || !pickerFactory) {
      return;
    }
    const picker = pickerFactory({
      document,
      fetch: fetchImpl,
      onChange: (tag) => {
        gameState.banner = tag;
        if (roll) {
          roll.setBanner(tag);
        }
      },
    });
    bannerSection.append(picker.el);
  }

  function wireRoll() {
    if (!rollSection || !rollFactory) {
      return null;
    }
    const roll = rollFactory({
      document,
      fetch: fetchImpl,
      onRollStart: async () => {
        if (document.body.classList.contains('mode-hero')) {
          await fadeHero();
        }
        setMode('rolling');
      },
      onRollFail: () => setMode('hero'),
      onLost: () => setMode('top'),
      onCelebrateDone: () => setMode('hero'),
    });
    rollSection.append(roll.el);
    return roll;
  }

  const roll = wireRoll();

  return {
    state: gameState,
    init: () => {
      setMode('hero');
      wireBannerPicker();
      if (closeDetection && createWebSocket) {
        closeDetection(createWebSocket);
      }
      if (roll) {
        roll.loadBalance();
      }
      return refreshStatus();
    },
  };
}

if (typeof window !== 'undefined') {
  const app = createApp({
    document,
    fetch,
    createBannerPicker: typeof createBannerPicker !== 'undefined' ? createBannerPicker : null,
    createRoll: typeof createRoll !== 'undefined' ? createRoll : null,
    createWebSocket: (url) => new WebSocket(url),
    wireCloseDetection: typeof wireCloseDetection !== 'undefined' ? wireCloseDetection : null,
  });
  app.init();
}

if (typeof module !== 'undefined') {
  module.exports = { createApp };
}
