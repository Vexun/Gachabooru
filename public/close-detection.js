'use strict';

function wireCloseDetection(createWebSocket, opts = {}) {
  const setTimeoutImpl = opts.setTimeout || setTimeout;
  const loc = typeof location !== 'undefined' ? location : { protocol: 'http:', host: 'localhost' };
  const wsUrl = `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
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
        setTimeoutImpl(connect, 2000 * attempts);
      }
    };
  }

  connect();
}

if (typeof window !== 'undefined') {
  window.wireCloseDetection = wireCloseDetection;
}

if (typeof module !== 'undefined') {
  module.exports = { wireCloseDetection };
}
