'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const economy = require('./economy');
const { StateStore } = require('./state');
const { createRouter } = require('./routes');
const { DanbooruClient } = require('./danbooru');
const { Downloader } = require('./download');
const { securityHeaders } = require('./security');
const { createRateLimiter } = require('./rate-limit');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;
const DRAIN_DELAY_MS = 1000;
const DRAIN_INTERVAL_MS = 5 * 60 * 1000;

function createApp(opts = {}) {
  const dataDir = opts.dataDir || path.join(__dirname, '..', 'data');
  const collectionsDir =
    opts.collectionsDir || path.join(__dirname, '..', 'collections');
  const stateFile = path.join(dataDir, 'state.json');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(collectionsDir, { recursive: true });

  const store = new StateStore(stateFile);
  if (economy.claimFirstOpenBonus(store.get())) {
    store.save();
  }

  const app = express();
  app.use(securityHeaders());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/collections', express.static(collectionsDir));
  app.use('/api', createRateLimiter(opts.rateLimit || {}));

  const danbooru =
    opts.danbooru || new DanbooruClient({ userAgent: process.env.GACHABOORU_UA });
  const downloader =
    opts.downloader ||
    new Downloader({ collectionsDir, userAgent: process.env.GACHABOORU_UA });

  app.use(
    '/api',
    createRouter({
      store,
      collectionsDir,
      danbooru,
      downloader,
    }),
  );

  function startDrain() {
    let draining = false;
    const runDrain = async () => {
      if (draining || store.get().pending_downloads.length === 0) {
        return;
      }
      draining = true;
      try {
        const result = await downloader.drainPending(store.get());
        if (result.retried > 0) {
          store.save();
        }
      } catch (err) {
        console.warn(`could not retry pending downloads: ${err.message}`);
      } finally {
        draining = false;
      }
    };
    const startup = setTimeout(runDrain, opts.drainDelayMs ?? DRAIN_DELAY_MS);
    startup.unref();
    // Failed downloads often need the CDN to unblock; a slow periodic pass
    // recovers them without hammering the upstream host.
    const interval = setInterval(runDrain, opts.drainIntervalMs ?? DRAIN_INTERVAL_MS);
    interval.unref();
  }

  return { app, store, downloader, startDrain };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const { app, startDrain } = createApp();
  startDrain();
  app.listen(port, HOST, () => {
    console.log(`Gachabooru running at http://${HOST}:${port}`);
  });
}

module.exports = { createApp };
