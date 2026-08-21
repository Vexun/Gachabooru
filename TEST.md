# TEST.md — Gachabooru testing instructions

How to test Gachabooru. The file has three parts: the core game slices
(Part 1), the close-from-browser launcher, and the play page overhaul
slices (Part 2). A play page flow overview closes the file. Each slice
ends with a testable state.

## Contents

- [Setup](#setup)
- [Part 1 — Core game](#part-1--core-game)
  - [Slice 0 — Skeleton](#slice-0--skeleton)
  - [Slice 1 — Banner picker](#slice-1--banner-picker)
  - [Slice 2 — Roll pool](#slice-2--roll-pool)
  - [Slice 3 — Peek and cover](#slice-3--peek-and-cover)
  - [Slice 4 — Coin flip, back-out, banking](#slice-4--coin-flip-back-out-banking)
  - [Slice 5 — Gallery](#slice-5--gallery)
  - [Slice 6 — Economy](#slice-6--economy)
  - [Slice 7 — General-only filter, docs, final QA](#slice-7--general-only-filter-docs-final-qa)
- [Launcher — close-from-browser shutdown](#launcher--close-from-browser-shutdown)
- [Part 2 — Play page overhaul](#part-2--play-page-overhaul)
  - [Slice 0 — Foundation](#slice-0--foundation)
  - [Slice 1 — Card DOM Restructure & 3D Flip](#slice-1--card-dom-restructure--3d-flip)
  - [Slice 2 — Covered Slide-In Reveal](#slice-2--covered-slide-in-reveal)
  - [Slice 3 — Coin Flip & Flip Panel Polish](#slice-3--coin-flip--flip-panel-polish)
  - [Slice 4 — Win/Loss Micro-Animations](#slice-4--winloss-micro-animations)
  - [Slice 5 — Bank Celebration & Results Transition](#slice-5--bank-celebration--results-transition)
  - [Slice 6 — Button States & Micro-Interactions](#slice-6--button-states--micro-interactions)
  - [Slice 7 — Integration, Accessibility & Performance](#slice-7--integration-accessibility--performance)
- [Play page flow](#play-page-flow)

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

## Part 1 — Core game

The core game is built in slices 0 to 7. Each slice ends with a testable
state.

### Slice 0 — Skeleton

Slice 0 delivers the project scaffold: an Express server, the static
client page, and the server-side state module.

#### Automated checks

- `npm test` — the full suite. Slice 0 covers:
  - `test/state.test.js` — default state creation, persistence and
    reload, atomic save, backup written on save, recovery from the backup
    on corruption, fresh start when no backup exists (corrupt file
    preserved), recovery of a deleted state file, rollback on
    structurally-invalid JSON, refusal to write invalid state, and a
    successful app boot with a corrupt state file.
  - `test/economy.test.js` — first-open bonus grants +50 exactly once.
  - `test/routes.test.js` — `GET /api/health` returns 200; the static
    client page is served.
  - `test/client/app.test.js` — `index.html` declares the sections
    `createApp` depends on and loads the client scripts in order;
    `createApp` wires the banner picker, the roll, and the close-detection
    websocket, and the status indicator turns "online" on a healthy health
    check and "unreachable" when it fails.
- `npm run lint` — clean output, no warnings.

#### Manual smoke

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

#### Notes

- `data/` and `collections/` are gitignored and created on first run.
- Stopping and restarting the app keeps the same state; the first-open
  bonus is not granted again.

### Slice 1 — Banner picker

Slice 1 delivers tag autocomplete: a Danbooru API proxy and a searchable
banner picker in the UI.

#### Automated checks

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

#### Manual smoke

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

### Slice 2 — Roll pool

Slice 2 builds the 5-image roll pool from the selected banner.

#### Automated checks

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

#### Manual smoke

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

### Slice 3 — Peek and cover

Slice 3 shows the 5 cards face-up for 3 seconds, then covers them with
identical numbered backs.

#### Automated checks

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

#### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Pick a tag and click Roll.
4. Confirm all 5 images are visible face-up for 3 seconds (loaded through
   the app's image proxy, so they load even if the CDN would reject a
   direct browser request).
5. Confirm the images then disappear and are replaced by identical
   striped card backs numbered 1 to 5.
6. Roll again and confirm the peek/cover cycle repeats.

### Slice 4 — Coin flip, back-out, banking

Slice 4 adds the coin-flip flow, back-out, and server-side banking with
image downloads.

#### Automated checks

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

#### Manual smoke

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

### Slice 5 — Gallery

Slice 5 shows the earned collection and supports deletion.

#### Automated checks

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
  - `test/client/gallery.test.js` — the gallery renders a grid, defaults
    to 20 images per page, hides the pager when everything fits on one
    page, replaces the grid with the target page, disables the pager edge
    buttons at the boundaries, marks the current page number, keeps the
    first and last page numbers with ellipses, jumps on the skip buttons,
    moves one page on next and previous, resets to the first page on
    reload, shows an empty state, opens a full-size view on click,
    browses across page boundaries in the full view, requires
    confirmation before deleting (and refreshes the page afterwards),
    closes without deleting, and marks images with a pending badge when
    their file is missing.
  - `test/client/collection.test.js` — the collection page mounts the
    gallery and loads it, and opens the close-detection websocket.
  - `test/client/close-detection.test.js` — the websocket keep-alive
    reconnects up to three times then stops, and an open resets the retry
    count.
- `npm run lint` — clean output.

#### Manual smoke

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
11. Bank more than 20 images and confirm the Collection shows the newest
    20 in a 5-column grid of 3:4 thumbnails. Use the pager to move to the
    next and previous page, jump with the page numbers, and skip to the
    first and last page.
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

### Slice 6 — Economy

Slice 6 adds the roll balance: accrual over time, the 24-hour bonus, and
spending a roll on each successful pool request.

#### Automated checks

- `npm test` — Slice 6 adds:
  - `test/economy.test.js` — 5 rolls per whole hour, whole-hour
    flooring, the accrual cap at 200 (without reducing an existing
    balance above the cap), the 24-hour bonus when at or below 200 at a
    boundary, the bonus granting at the cap (up to 210), no bonus while
    above the cap, no bonus stacking across boundaries, the first-open
    +50 once, the balance floor at 0, and clock-skew handling.
  - `test/routes.test.js` — `GET /api/balance` returns the balance, a
    successful pool request deducts one roll, a pool request is blocked
    with 402 on an insufficient balance (without calling upstream), and a
    blocked pool does not consume a roll.
  - `test/client/roll.test.js` — `loadBalance` shows the balance and
    disables the roll button at zero, a successful roll updates the
    displayed balance, and an insufficient balance blocks the roll with
    an error.
- `npm run lint` — clean output.

#### Manual smoke

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

### Slice 7 — General-only filter, docs, final QA

Slice 7 removes the rating setting. The app always filters to general-rated
posts (completely safe for work).

#### Automated checks

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

#### Manual smoke

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

The `run.js` launcher shuts the server down when the app is closed from
the browser.

#### Automated checks

- `npm test` — `test/shutdown.test.js` covers the watchdog:
  - No shutdown before any client connects.
  - Shutdown after the last client disconnects.
  - No shutdown when a client reconnects within the grace period.
  - Multiple concurrent clients keep the server alive until the last one
    disconnects.
  - Connections to a non-`/ws` path are rejected.

#### Manual smoke

1. Start the app with `npm start`.
2. Use the app normally.
3. Close the browser tab.
4. Confirm the terminal prints "Browser closed. Shutting down Gachabooru."
   and the process exits on its own within a few seconds.
5. Start again with `npm start`, refresh the page, and confirm the server
   stays up.
6. Start with `npm run serve` and confirm the server stays up after
   closing the browser.

## Part 2 — Play page overhaul

The play page overhaul reworks the roll flow in slices 0 to 7. The core
game behavior stays unchanged while the visual state machine is built up.
See `PRD.md` and `PLAN.md` for the full plan.

### Slice 0 — Foundation

Slice 0 prepares the codebase for animation work without changing
gameplay behavior. See `PRD.md` and `PLAN.md` for the full overhaul.

#### Automated checks

- `npm test` — Slice 0 adds:
  - `test/client/app.test.js` — `index.html` loads no vendor scripts,
    and `styles.css` declares the `prefers-reduced-motion: reduce` media
    query and the `.sr-only` utility class.
  - `test/client/roll.test.js` — the flip panel contains an
    `.flip-live` region with `aria-live="polite"`.
- `npm run lint` — clean output.

#### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Confirm the page loads with no console errors.
4. Play through a roll (pick a tag, roll, peek, flip, back out) and
   confirm the behavior is unchanged from before the overhaul.
5. Enable `prefers-reduced-motion` in the OS settings and confirm the
   page still renders and plays normally.

### Slice 1 — Card DOM Restructure & 3D Flip

Slice 1 replaces the flat card DOM with a two-sided 3D structure and
switches cover/reveal to CSS class toggles. See `PRD.md` section 4.1 and
`PLAN.md` Slice 1.

#### Automated checks

- `npm test` — Slice 1 adds to `test/client/roll.test.js`:
  - `renderCards` builds `.card-inner` with `.card-front` and `.card-back`
    children; the back holds a numbered `.card-number` span.
  - `coverCards` toggles the `.covered` class without appending new back
    elements.
  - `revealCard` removes `.covered` from the target card only.
  - The 3D structure survives a full peek-cover-reveal cycle.
  - The numbered-backs and peek-state tests assert the new structure.
- `npm run lint` — clean output.

#### Manual smoke

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

### Slice 2 — Covered Slide-In Reveal

Slice 2 makes the roll cards slide in covered from the right, then flip
to reveal their images once the images have loaded. Rarity glow shows
while the fronts are visible. See `PRD.md` sections 4.2 and `PLAN.md`
Slice 2.

#### Automated checks

- `npm test` — Slice 2 adds to `test/client/roll.test.js`:
  - A roll renders 5 hidden, covered cards while the images load.
  - Cards gain the `.entering` class only after all images settle; an
    image that errors also counts as settled.
  - The sequence runs slide-in, reveal, and cover in order: `.entering`
    while covered, `.covered` removed and `.revealed` added when shown,
    then `.revealed` removed again when covered.
  - `renderCards` maps `post.score` to a rarity class: score at least 100
    gives `.rarity-gold`, at least 50 gives `.rarity-silver`, otherwise no
    rarity class. The `.revealed` class gates the glow.
  - A new roll resets the cards to the hidden, covered state.
- `npm run lint` — clean output.

#### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Pick a tag and click Roll.
4. Confirm the cards stay hidden until the images load, then slide in
   covered from the right, one after another with a staggered delay.
5. Once in place, confirm the cards flip to show their images.
6. Roll on a high-score tag and confirm cards with a score of 100 or
   more show a pulsing gold border and cards with a score of 50 or more
   show a silver border while the images are visible.
7. After about 3 seconds, confirm the cards flip back to covered and the
   flip panel appears.
8. Enable `prefers-reduced-motion` in the OS settings and confirm the
   slide-in and flips happen instantly.

### Slice 3 — Coin Flip & Flip Panel Polish

Slice 3 adds a 3D coin that spins when the player flips, highlights the
active card while dimming the others, and slides the flip panel in. See
`PRD.md` sections 4.3 and 4.4 and `PLAN.md` Slice 3.

#### Automated checks

- `npm test` — Slice 3 adds to `test/client/roll.test.js`:
  - The flip panel contains a coin with `.coin-heads` and `.coin-tails`
    faces.
  - The flip panel shows via the `.is-visible` class, and the active card
    gets `.focused` while the other covered cards get `.dimmed`.
  - Won cards stay bright (no `.dimmed`, no `.focused`) while the next
    card is focused.
  - Clicking Flip adds `.flipping` to the coin, disables the flip button,
    and a second press during the spin is ignored.
  - The spin duration is random per flip between 900 ms and 3000 ms: the
    inline `animation-duration` and the fallback timer match the picked
    duration, and settling clears the inline duration.
  - The spin's keyframes end on the actual result face through the
    `to-heads` / `to-tails` classes (no last-instant side switch), and
    flips of 1950 ms or longer add the extra-turn `spin-long` class.
  - Dispatching `animationend` on the coin settles it, waits for the
    resolution pause, then announces the face through the `.flip-live`
    region and resolves the flip (a win records a pending win; a tails
    loss ends the roll and hides the panel).
  - Banking hides the flip panel via the `.is-visible` class.
- `npm run lint` — clean output.

#### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Roll and play through to the flip sequence.
4. Confirm the flip panel slides up and the active card scales up with a
   glow while the other covered cards dim.
5. Click Heads or Tails, then click Flip.
6. Confirm the coin has a minted-metal look: a sheened rim on both faces,
   an embossed gacha star on the gold heads face, and an embossed tag on
   the silver tails face, with a soft ground shadow below. Confirm the
   spin always decelerates onto the correct result face with no
   last-instant switch, that short flips turn fewer times than long
   ones, and that it settles on the result face. The spin length varies
   per flip between about 0.9 and 3 seconds.
7. Confirm the coin holds on the settled face for about 0.6 seconds,
   then the outcome lands: the card reveals and the result text appears.
8. Win two cards and confirm both won images stay bright while the next
   card is focused.
9. Confirm a mismatch ends the roll and hides the panel.
10. Confirm the coin result is announced to screen readers.
11. Enable `prefers-reduced-motion` in the OS settings and confirm the
    coin flip is instant.

### Slice 4 — Win/Loss Micro-Animations

Slice 4 adds emotional feedback for each flip outcome: a gold flash and
floating "+1" badge on a win, and a shake, red tint, panel slide-down,
and loss message on a loss. See `PRD.md` section 4.2 and `PLAN.md`
Slice 4.

#### Automated checks

- `npm test` — Slice 4 adds to `test/client/roll.test.js`:
  - A win adds `.win-flash` to the won card and creates a `.float-badge`
    inside it; the badge is removed on `animationend`.
  - The next card is not focused until the focus delay elapses.
  - A loss adds `.shake` and `.lost-tint` to the active card, shows the
    `.roll-loss` message, and puts the flip panel into `.is-leaving`
    before it hides.
  - The `.flip-live` region announces the outcome after the resolution
    pause.
- `npm run lint` — clean output.

#### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Roll and play through to the flip sequence.
4. Win a card. Confirm the card flips face-up with a gold flash and a
   "+1" badge that floats up and fades, and that the "It matches" message
   holds for about 2 seconds before the next card's controls appear.
5. Confirm the won card stays bright beside the next highlighted card.
6. Lose a card. Confirm the card shakes and tints red, a muted "You lost
   the roll" message fades in, then after the shake ends the flip panel
   slides down and fades out, and the search bar and Roll button drop
   back in from the top, pushing the grid down. The Roll button stays
   disabled for about two seconds before a new roll can start.
7. Confirm the outcome is announced to screen readers.
8. Enable `prefers-reduced-motion` in the OS settings and confirm all
   win/loss animations are instant.

### Slice 5 — Bank Celebration & Results Transition

Slice 5 makes banking feel rewarding: the results panel holds for about
1.2 seconds while the won cards glow, the heading bounces in, and the
banked thumbnails enter one after another. See `PLAN.md` Slice 5.

#### Automated checks

- `npm test` — Slice 5 adds to `test/client/roll.test.js`:
  - The exit animations (`exit-up` on the grid and `exit-down` on the
    results) start only after the 1200 ms celebration hold, and
    `onCelebrateDone` fires after the exit completes.
  - `renderResults` shows the results via the `.is-visible` class instead
    of toggling `hidden`, the heading carries the `heading-bounce` class,
    and the banked thumbnails carry `.entering`.
  - `bankPending` adds `.celebrating` to exactly the won cards.
  - The `.flip-live` region announces "You kept N image(s)." on bank.
- `npm run lint` — clean output.

#### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Roll and win a few cards, then click Back out & bank.
4. Confirm the results heading bounces in with "You kept N images".
5. Confirm the won cards in the play grid scale up with a gold glow while
   the hold lasts (about 1.2 seconds).
6. Confirm the banked thumbnails enter one after another with a staggered
   fade-and-scale.
7. Confirm the whole grid and the results then fade out, the screen
   holds for about a second, and the centered hero fades back in with the
   previous search still filled.
8. Lose a roll and confirm "You kept 0 images" still shows, now with the
   same fade-in.
9. Enable `prefers-reduced-motion` in the OS settings and confirm the
   hold, bounces, and card entrances happen instantly.

### Slice 6 — Button States & Micro-Interactions

Slice 6 polishes every interactive element: the Roll button shows a
loading state while it fetches the pool, Heads/Tails flash on press, the
Back-out button fades in on first appearance, and the Flip button pulses
when it is armed. See `PLAN.md` Slice 6.

#### Automated checks

- `npm test` — Slice 6 adds to `test/client/roll.test.js`:
  - The roll button gets `.loading`, reads "Summoning…", and is disabled
    during a deferred pool request, then reverts on success.
  - A blocked pool also clears the loading state.
  - Clicking Heads adds `.pressed` to that button only and removes it
    after 150 ms.
  - The back-out button gains `.entering` only when it first appears, and
    not again on later rounds.
  - The Flip button stays disabled during the coin spin (existing test).
- `npm run lint` — clean output.

#### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Pick a tag and click Roll. Confirm the button depresses, dims, and
   reads "Summoning…" while the roll loads.
4. Reach the flip sequence. Click Heads. Confirm a brief press flash.
5. Click Flip. Confirm the Flip button pulses softly while armed and stays
   locked during the coin spin; clicking rapidly flips only once.
6. Win a card. Confirm the Back-out & bank button fades up once and does
   not re-animate on the next card.
7. Enable `prefers-reduced-motion` in the OS settings and confirm the
   presses, pulse, and entrance happen instantly.

### Slice 7 — Integration, Accessibility & Performance

Slice 7 finishes the play page: managed keyboard focus, a visible focus
outline, and a final documentation pass. See `PLAN.md` Slice 7.

#### Automated checks

- `npm test` — Slice 7 adds to `test/client/roll.test.js`:
  - Focus moves to the Heads button when the flip panel appears, and to
    the Flip button after a call is made.
  - Focus returns to the Roll button after a loss lockout and after
    banking completes.
  - The full suite passes with no regressions.
- `npm run lint` — clean output.

#### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Enable `prefers-reduced-motion` in the OS settings and confirm every
   phase of the flow is instant.
4. Play the whole flow using only the keyboard: pick a tag, press Enter
   on Roll, call Heads/Tails, flip, win some, bank. Confirm focus moves
   to the flip controls and returns to Roll without tabbing through
   hidden elements, and that a visible focus outline marks the active
   control.
5. Resize the window to 320 px, 768 px, and 1920 px. Confirm the page
   renders and stays playable at each width (at 320 px the cards get
   narrow but the page scrolls gracefully).
6. Roll 10 times rapidly. Confirm no cards get stuck, no timers leak,
   and the balance settles correctly.
7. Repeat the smoke in a second browser (Chrome, Firefox, or Safari).

## Play page flow

This overview documents the finished play page's state machine. It is not
a build slice.

The play page has three states, driven by classes on `<body>`: `mode-hero`
(initial and after winning/banking), `mode-rolling` (a roll in progress),
and `mode-top` (after a loss). The hero shows a centered title, a message
to search for a tag, the tag search, the balance, and the Roll button.

### Automated checks

- `npm test`:
  - `test/client/app.test.js` — `index.html` declares the hero section
    and starts in `mode-hero`; `createApp` switches the body mode from the
    roll callbacks (`onRollStart` → rolling, `onLost` → top, `onRollFail`
    and `onCelebrateDone` → hero).
  - `test/client/roll.test.js` — `startRoll` fires `onRollStart` (and
    `onRollFail` when the pool is blocked); a loss fires `onLost`; banking
    adds `exit-up`/`exit-down` to the grid and results and fires
    `onCelebrateDone` after the exit, with the exit classes stripped on
    the next roll.
- `npm run lint` — clean output.

### Manual smoke

1. Start the app with `npm start`.
2. Open `http://127.0.0.1:3000` in a browser.
3. Confirm the idle page shows the centered Gachabooru title, a message
   to search for a tag, the tag search, the balance, and the Roll button,
   fading in over about a second.
4. Search for a tag and select it. Confirm the chosen tag and the balance
   show in the hero, and the Roll button becomes enabled.
5. Click Roll. Confirm the title, search, balance, and Roll button fade
   out over about 0.6 seconds, then the usual gameplay begins with no
   stale cards visible.
6. Lose a flip. Confirm the loss message plays, then the search and Roll
   button reappear at the top with the previous search still filled, and
   the grid stays visible.
7. Click Roll again after a loss. Confirm the search bar, the balance, and
   the Roll button rise up and fade out first, then the old cards move up
   and fade out, then the new cards enter from the side.
8. Roll again and win all 5 cards (or win some and click Back out & bank).
   Confirm the results hold for about a second with the won cards glowing
   and the heading bouncing in, then the grid and the results fade away,
   the screen holds for about a second, and the centered hero fades in
   over about a second with the previous search still filled.
9. Click Roll from the hero. Confirm the old grid is already cleared (no
   leftover cards flash) and the hero fades out before the new cards
   enter.