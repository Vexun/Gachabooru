'use strict';

function createApp({
  document,
  fetch: fetchImpl,
  createBannerPicker: pickerFactory,
  createRoll: rollFactory,
  createWebSocket,
  wireCloseDetection: closeDetection,
}) {
  const statusEl = document.getElementById('server-status');
  const bannerSection = document.getElementById('banner-section');
  const rollSection = document.getElementById('roll-section');
  const gameState = { banner: null };
  const MODES = ['hero', 'rolling', 'top'];

  function setMode(mode) {
    for (const name of MODES) {
      document.body.classList.remove(`mode-${name}`);
    }
    document.body.classList.add(`mode-${mode}`);
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
      onRollStart: () => setMode('rolling'),
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
