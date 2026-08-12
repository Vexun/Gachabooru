'use strict';

function createApp({
  document,
  fetch: fetchImpl,
  createBannerPicker: pickerFactory,
  createRoll: rollFactory,
  createGallery: galleryFactory,
  createWebSocket,
}) {
  const statusEl = document.getElementById('server-status');
  const bannerSection = document.getElementById('banner-section');
  const rollSection = document.getElementById('roll-section');
  const gallerySection = document.getElementById('gallery-section');
  const gameState = { banner: null };

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
      onBanked: () => {
        if (gallery) {
          gallery.load();
        }
      },
    });
    rollSection.append(roll.el);
    return roll;
  }

  function wireGallery() {
    if (!gallerySection || !galleryFactory) {
      return null;
    }
    const gallery = galleryFactory({ document, fetch: fetchImpl });
    gallerySection.append(gallery.el);
    return gallery;
  }

  const roll = wireRoll();
  const gallery = wireGallery();

  function wireCloseDetection() {
    if (!createWebSocket) {
      return;
    }
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    let attempts = 0;
    function connect() {
      let ws;
      try {
        ws = createWebSocket(wsUrl);
      } catch {
        return;
      }
      ws.onopen = () => {
        attempts = 0;
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        attempts += 1;
        if (attempts <= 3) {
          setTimeout(connect, 2000 * attempts);
        }
      };
    }
    connect();
  }

  return {
    state: gameState,
    init: () => {
      wireBannerPicker();
      wireCloseDetection();
      if (roll) {
        roll.loadBalance();
      }
      if (gallery) {
        gallery.load();
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
    createGallery: typeof createGallery !== 'undefined' ? createGallery : null,
    createWebSocket: (url) => new WebSocket(url),
  });
  app.init();
}

if (typeof module !== 'undefined') {
  module.exports = { createApp };
}
