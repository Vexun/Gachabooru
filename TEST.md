# TEST.md — Gachabooru testing instructions

How to test Gachabooru. Follow this file slice by slice. Each slice ends
with a testable state.

## Setup

- Install dependencies: `npm install`.
- Run the automated tests: `npm test`.
- Run the linter: `npm run lint`.
- Start the app: `npm start`. This starts the server and opens the app in
  your default browser at `http://127.0.0.1:3000`. It works on Windows,
  macOS, and Linux. Use `npm run serve` or `node server/index.js` to run
  the server without opening a browser. The launcher lives in `run.js`.
- Close behavior: with `npm start`, closing the browser tab shuts the
  server down a few seconds later. Refreshing the page or keeping several
  tabs open keeps the server alive. With `npm run serve`, the server stays
  up until you stop it.

## Slice 0 — Skeleton

Slice 0 delivers the project scaffold: an Express server, the static
client page, and the server-side state module.

### Automated checks

- `npm test` — the full suite. Slice 0 covers:
  - `test/state.test.js` — default state creation, persistence and
    reload, atomic save, backup written on save, recovery from the backup
    on corruption, fresh start when no backup exists (corrupt file
    preserved), recovery of a deleted state file, rollback on
    structurally-invalid JSON, refusal to write invalid state, and a
    successful app boot with a corrupt state file.
  - `test/economy.test.js` — first-open bonus grants +10 exactly once.
  - `test/routes.test.js` — `GET /api/health` returns 200; the static
    client page is served.
  - `test/client/app.test.js` — `index.html` declares the sections
    `createApp` depends on and loads the client scripts in order;
    `createApp` wires the banner picker, the roll, and the close-detection
    websocket, and the status indicator turns "online" on a healthy health
    check and "unreachable" when it fails.
- `npm run lint` — clean output, no warnings.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Confirm the page shows the title "Gachabooru".
4. Confirm the status text in the header changes to "online".
5. Confirm `curl http://127.0.0.1:3000/api/health` returns `{"ok":true}`.
6. Confirm `data/state.json` exists after first launch and contains a
   balance of 50 (first-open bonus) and `first_open_bonus_claimed: true`.
7. Confirm `data/state.json.bak` is created after the first save.
8. Stop the app, replace `data/state.json` with garbage, and start again.
   Confirm the app boots, recovers the previous state, and leaves a
   `data/state.json.corrupt` file.
9. Confirm `collections/` exists.

### Notes

- `data/` and `collections/` are gitignored and created on first run.
- Stopping and restarting the app keeps the same state; the first-open
  bonus is not granted again.

## Slice 1 — Banner picker

Slice 1 delivers tag autocomplete: a Danbooru API proxy and a searchable
banner picker in the UI.

### Automated checks

- `npm test` — Slice 1 adds:
  - `test/danbooru.test.js` — autocomplete maps results, filters to
    general/copyright/character categories (0, 3, 4), skips artist and
    meta tags, requests the correct URL, returns empty for an empty
    query, and throws a typed error on network or HTTP failure. `Throttle`
    lets the first wait through, spaces consecutive waits by the minimum
    interval, and never sleeps at a zero interval.
  - `test/routes.test.js` — `GET /api/autocomplete` returns mapped
    results, rejects an empty query with 422, and returns 502 on
    upstream failure.
  - `test/client/banner-picker.test.js` — the picker renders an input,
    shows suggestions for a query, selects a tag on click (calls
    `onChange`, shows the chosen banner), hides suggestions after
    selection, shows a no-results message, and clears on empty input.
- `npm run lint` — clean output.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Type "hatsune" in the banner tag box.
4. Confirm a list of suggestions appears, showing character and copyright
   tags (artist and meta tags are excluded).
5. Click a suggestion.
6. Confirm the input fills with the tag label and the chosen banner is
   shown below the input.
7. Confirm `curl "http://127.0.0.1:3000/api/autocomplete?q=hatsune"` returns
   only general/copyright/character results.
8. Confirm `curl "http://127.0.0.1:3000/api/autocomplete?q="` returns 422.

## Slice 2 — Roll pool

Slice 2 builds the 5-image roll pool from the selected banner.

### Automated checks

- `npm test` — Slice 2 adds:
  - `test/danbooru.test.js` — `searchPosts` builds the query (tag,
    general-only rating filter, `order:score`, limit), filters out
    non-static formats, and falls back to the original URL when no large
    image exists. `buildRollPool` draws 5 distinct posts, fetches deeper
    pages when needed, excludes earned posts, blocks when fewer than 5
    eligible posts exist, and blocks when pages run empty.
  - `test/routes.test.js` — `GET /api/roll/pool` returns 5 posts,
    excludes earned posts, returns 409 on an insufficient pool, 422 on a
    missing tag, and 502 on upstream failure.
  - `test/client/roll.test.js` — the roll button stays disabled until a
    banner is chosen, a pool request renders 5 cards, a blocked roll shows
    an error state, a network error is surfaced, and a new roll replaces
    the previous cards.
- `npm run lint` — clean output.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Pick a large tag such as "hatsune miku".
4. Confirm the Roll button becomes enabled.
5. Click Roll.
6. Confirm 5 image cards appear.
7. Pick a tiny tag such as "fictional_high_school" and click Roll.
8. Confirm an error message appears and no cards are shown.
9. Confirm `curl "http://127.0.0.1:3000/api/roll/pool?tag=hatsune_miku"`
   returns 5 posts and `?tag=` returns 422.

## Slice 3 — Peek and cover

Slice 3 shows the 5 cards face-up for 3 seconds, then covers them with
identical numbered backs.

### Automated checks

- `npm test` — Slice 3 adds to `test/client/roll.test.js`:
  - A roll enters the peek state and shows 5 images (served through the
    image proxy).
  - The cover fires after the 3-second timer (fake timers).
  - Covered cards show identical `.card-back` elements, numbered 1 to 5.
  - A new roll clears the cover state and restarts the peek.
  - `cancelCover` clears the pending peek timer.
  - `test/routes.test.js` — `GET /api/image` proxies images from
    `cdn.donmai.us`, rejects URLs outside the allowlist with 400, and
    returns 502 on upstream failure. `test/download.test.js` covers
    `fetchBuffer`.
- `npm run lint` — clean output.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Pick a tag and click Roll.
4. Confirm all 5 images are visible face-up for 3 seconds (loaded through
   the app's image proxy, so they load even if the CDN would reject a
   direct browser request).
5. Confirm the images then disappear and are replaced by identical
   striped card backs numbered 1 to 5.
6. Roll again and confirm the peek/cover cycle repeats.

## Slice 4 — Coin flip, back-out, banking

Slice 4 adds the coin-flip flow, back-out, and server-side banking with
image downloads.

### Automated checks

- `npm test` — Slice 4 adds:
  - `test/download.test.js` — banking downloads the file and records
    metadata, retries on failure, queues failed downloads (metadata is
    kept, file is not written), is idempotent per post, and retries a
    missing file for an already-earned post.
  - `test/routes.test.js` — `POST /api/roll/:postId` banks an image and
    triggers the download, is idempotent, and rejects unknown or
    mismatched posts and missing banner tags with 422.
  - `test/client/roll.test.js` — the flip order is a permutation of the
    5 positions, calling heads or tails arms the flip button, a win
    reveals the card, a loss erases pending wins and ends the roll,
    backing out banks pending wins and shows only banked images, winning
    all 5 banks all 5, the coin flip resolves heads/tails fairly, banking
    hides the flip panel, a second back-out press does not wipe the
    results, and banking fires the `onBanked` callback.
  - `test/client/app.test.js` — the main page wires the banner picker,
    roll, and close detection, and the server status indicator reflects
    the health check.
- `npm run lint` — clean output.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Pick a tag and click Roll.
4. After the peek and cover, the flip panel appears.
5. Click Heads or Tails, then Flip.
6. Confirm a win reveals that card and a Back out & bank button appears.
7. Confirm a loss ends the roll and shows "You kept 0 images".
8. Win a few cards, then click Back out & bank.
9. Confirm the results screen shows only the banked images.
10. Confirm the files exist under `collections/<tag>/` and
    `data/state.json` lists the earned posts.
11. Confirm re-banking the same post is idempotent
    (`curl -X POST .../api/roll/<id>` twice).

## Slice 5 — Gallery

Slice 5 shows the earned collection and supports deletion.

### Automated checks

- `npm test` — Slice 5 adds:
  - `test/state.test.js` — the state lists earned posts, `removeEarned`
    deletes the file and metadata (including queued downloads), tolerates
    a missing file, and reports not-removed for an unknown post.
  - `test/download.test.js` — `drainPending` retries queued downloads,
    keeps items that still fail, and is a no-op on an empty queue.
    `test/drain.test.js` — `startDrain` schedules a startup and an
    interval pass, drains and saves on success, skips an empty queue,
    does not save when nothing retried, guards against overlapping runs,
    and swallows downloader errors.
  - `test/routes.test.js` — `GET /api/earned` lists earned images newest
    first with pagination metadata (`page`, `limit`, `total`), reports a
    `downloaded` flag per entry, paginates across pages, returns an empty
    page past the end, and rejects invalid pagination with 422. `DELETE
    /api/earned/:postId` removes the file and metadata and returns 404 for
    an unknown post, and `collections/` images are served statically.
  - `test/client/gallery.test.js` — the gallery renders a grid, hides the
    load-more button when everything fits on one page, loads more pages
    and appends cards, resets to the first page on reload, shows an empty
    state, opens a full-size view on click, requires confirmation before
    deleting (and removes the item afterwards), closes without deleting,
    and marks images with a pending badge when their file is missing.
  - `test/client/collection.test.js` — the collection page mounts the
    gallery and loads it, and opens the close-detection websocket.
  - `test/client/close-detection.test.js` — the websocket keep-alive
    reconnects up to three times then stops, and an open resets the retry
    count.
- `npm run lint` — clean output.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Roll, win a few cards, and back out to bank them.
4. Click Collection in the header to open the Collection page and confirm
   the earned images appear.
5. Click an image and confirm the full-size view opens with a link to the
   Danbooru post.
6. Use the arrow buttons on the sides of the screen (or the Left and Right
   arrow keys) to move between images. Confirm the position counter
   updates, deeper pages load as you reach the end, and navigation stops
   at the newest and oldest images.
7. Press Escape (or click Close) to leave the full-size view.
8. Click Delete, confirm the confirmation prompt, and confirm the image
   disappears from the grid.
9. Confirm the deleted image becomes eligible again by rolling: it can
   appear in a new roll pool.
10. Confirm `curl "http://127.0.0.1:3000/api/earned"` lists the remaining
    images newest first and `curl -X DELETE .../api/earned/<id>` removes
    one.
11. Bank more than 30 images and confirm the Collection shows the newest
    ones first with a "Load more" button that appends the rest.
12. Confirm pagination works via the API:
    `curl "http://127.0.0.1:3000/api/earned?limit=2&page=2"` returns the
    next slice with `page`, `limit`, and `total` fields, and
    `?limit=0` returns 422.
13. To observe pending downloads, bank an image while the CDN is
    unreachable (for example, disconnect the network during a roll).
    Confirm the image shows a "pending" badge in the Collection. Restore
    the network and restart the app (or wait for the periodic retry), and
    confirm the file downloads and the badge clears. Confirm
    `curl "http://127.0.0.1:3000/api/earned"` reports `downloaded: false`
    while the file is missing and `downloaded: true` once it lands.

## Slice 6 — Economy

Slice 6 adds the roll balance: accrual over time, the 24-hour bonus, and
spending a roll on each successful pool request.

### Automated checks

- `npm test` — Slice 6 adds:
  - `test/economy.test.js` — 10 rolls per whole hour, whole-hour
    flooring, the accrual cap at 300 (without reducing an existing
    balance above the cap), the 24-hour bonus only when below 300 at a
    boundary, no bonus while at or above the cap, no bonus stacking
    across boundaries at the cap, the first-open +50 once, the balance
    floor at 0, and clock-skew handling.
  - `test/routes.test.js` — `GET /api/balance` returns the balance, a
    successful pool request deducts one roll, a pool request is blocked
    with 402 on an insufficient balance (without calling upstream), and a
    blocked pool does not consume a roll.
  - `test/client/roll.test.js` — `loadBalance` shows the balance and
    disables the roll button at zero, a successful roll updates the
    displayed balance, and an insufficient balance blocks the roll with
    an error.
- `npm run lint` — clean output.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Confirm the header shows "Rolls: 50" on first launch.
4. Roll and confirm the count drops by 1 each time.
5. Confirm the Roll button disables when the balance reaches 0.
6. To check recharge quickly, temporarily lower the accrual constants in
   `server/economy.js` (for example set `HOUR_MS` to 1000), restart the
   app, and confirm the balance rises over time up to the cap.
7. Confirm `curl "http://127.0.0.1:3000/api/balance"` matches the UI and
   that an extra roll at balance 0 returns 402.

## Slice 7 — General-only filter, docs, final QA

Slice 7 removes the rating setting. The app always filters to general-rated
posts (completely safe for work).

### Automated checks

- `npm test` — Slice 7 adds:
  - `test/danbooru.test.js` — the client always applies the general-only
    filter (`rating:g`).
  - `test/download.test.js` — `safeTag` prevents path traversal in banner
    tags and preserves Unicode letters while replacing other characters
    with underscores.
  - `test/routes.test.js` — responses include a restrictive
    Content-Security-Policy (default-src none, self-only scripts and
    styles, images from `cdn.donmai.us`, same-origin websocket) and the
    `nosniff` / `no-referrer` companion headers. The API rate limiter
    returns 429 over the limit and exempts `/api/health`.
  - `test/security.test.js` — `securityHeaders` reflects a valid host with
    port, falls back to the default for a missing or injectable Host
    header, and sets the companion headers.
  - `test/rate-limit.test.js` — the limiter passes requests under the
    limit, returns 429 with Retry-After over it, resets when the window
    expires, and never blocks exempt paths.
  - The rating picker and the `/api/settings` endpoints are removed, with
    their tests.
- `npm run lint` — clean output.
- Full suite: `npm test` runs all tests.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Confirm there is no rating picker in the UI.
4. Roll on a large tag and confirm every drawn post is rated general.
5. Confirm `curl -sI "http://127.0.0.1:3000/"` shows a
   `Content-Security-Policy` header whose `connect-src` includes the
   same-origin websocket, plus `X-Content-Type-Options: nosniff` and
   `Referrer-Policy: no-referrer`.
6. Confirm the peek images load (they come from `cdn.donmai.us`, allowed
   by `img-src`).
7. Confirm the API rate limit by firing many quick requests, for example
   `for i in $(seq 1 130); do curl -s -o /dev/null "http://127.0.0.1:3000/api/balance"; done`
   — the last requests return 429 with a `Retry-After` header, while
   `curl "http://127.0.0.1:3000/api/health"` keeps returning 200.
8. Run the full manual flow: pick a tag, roll, flip, win some, back out,
   open the Collection page, delete an image, and watch the balance drain
   and recharge.
9. Confirm `curl "http://127.0.0.1:3000/api/settings"` returns 404 (the
   settings endpoint is gone).

## Launcher — close-from-browser shutdown

Slice for the `run.js` launcher: the server shuts down when the app is
closed from the browser.

### Automated checks

- `npm test` — `test/shutdown.test.js` covers the watchdog:
  - No shutdown before any client connects.
  - Shutdown after the last client disconnects.
  - No shutdown when a client reconnects within the grace period.
  - Multiple concurrent clients keep the server alive until the last one
    disconnects.
  - Connections to a non-`/ws` path are rejected.

### Manual smoke

1. Start the app with `npm start`.
2. Use the app normally.
3. Close the browser tab.
4. Confirm the terminal prints "Browser closed. Shutting down Gachabooru."
   and the process exits on its own within a few seconds.
5. Start again with `npm start`, refresh the page, and confirm the server
   stays up.
6. Start with `npm run serve` and confirm the server stays up after
   closing the browser.

## Play Page Overhaul — Slice 0: Foundation

Slice 0 prepares the codebase for animation work without changing
gameplay behavior. See `PRD.md` and `PLAN.md` for the full overhaul.

### Automated checks

- `npm test` — Slice 0 adds:
  - `test/client/app.test.js` — `index.html` loads
    `vendor/confetti.browser.min.js` before `app.js`, and `styles.css`
    declares the `prefers-reduced-motion: reduce` media query and the
    `.sr-only` utility class.
  - `test/client/roll.test.js` — the flip panel contains an
    `.flip-live` region with `aria-live="polite"`.
- `npm run lint` — clean output.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Confirm `curl -sI "http://127.0.0.1:3000/vendor/confetti.browser.min.js"`
   returns 200.
4. Confirm the page loads with no console errors.
5. Play through a roll (pick a tag, roll, peek, flip, back out) and
   confirm the behavior is unchanged from before the overhaul.
6. Enable `prefers-reduced-motion` in the OS settings and confirm the
   page still renders and plays normally.

### Notes

- `public/vendor/` holds the pinned canvas-confetti 1.9.4 build and its
  ISC license. The file name ends in `.min.js`, so oxlint skips it.

## Play Page Overhaul — Slice 1: Card DOM Restructure & 3D Flip

Slice 1 replaces the flat card DOM with a two-sided 3D structure and
switches cover/reveal to CSS class toggles. See `PRD.md` section 4.1 and
`PLAN.md` Slice 1.

### Automated checks

- `npm test` — Slice 1 adds to `test/client/roll.test.js`:
  - `renderCards` builds `.card-inner` with `.card-front` and `.card-back`
    children; the back holds a numbered `.card-number` span.
  - `coverCards` toggles the `.covered` class without appending new back
    elements.
  - `revealCard` removes `.covered` from the target card only.
  - The 3D structure survives a full peek-cover-reveal cycle.
  - The numbered-backs and peek-state tests assert the new structure.
- `npm run lint` — clean output.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Pick a tag and click Roll.
4. Confirm the 5 images show face-up during the peek.
5. Wait 3 seconds. Confirm all 5 cards flip to their backs with a smooth
   3D rotation and show the striped numbered backs.
6. Play through a win. Confirm the winning card flips back to its image
   smoothly.
7. Enable `prefers-reduced-motion` in the OS settings and confirm the
   cover and reveal happen instantly instead of rotating.





