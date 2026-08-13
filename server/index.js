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
  app.use(
    '/api',
    createRouter({
      store,
      collectionsDir,
      danbooru: opts.danbooru || new DanbooruClient({ userAgent: process.env.GACHABOORU_UA }),
      downloader:
        opts.downloader || new Downloader({ collectionsDir, userAgent: process.env.GACHABOORU_UA }),
    }),
  );

  return { app, store };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const { app } = createApp();
  app.listen(port, HOST, () => {
    console.log(`Gachabooru running at http://${HOST}:${port}`);
  });
}

module.exports = { createApp };
