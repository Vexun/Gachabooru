# TEST.md — Gachabooru testing instructions

This document describes the automated test suite and the manual smoke
tests. Read it before changing tests, and keep it in sync with the code.

## How to run

```sh
npm install        # once
npm test           # full suite (node:test)
npm test -- --test-name-pattern="spinner"   # one area, by name
npm run lint       # oxlint
npm run serve      # run the app for manual smoke tests
```

The suite runs about 243 tests in under a second. Tests never touch the
real Danbooru API or the network beyond a loopback HTTP server.

## Layout

| File | Covers |
| --- | --- |
| `test/helpers.js` | Temp dirs and a loopback server harness for API tests |
| `test/state.test.js` | State file load, save, backup, recovery |
| `test/economy.test.js` | Accrual, cap, daily bonus, first-open bonus |
| `test/danbooru.test.js` | Throttle, autocomplete, post search, roll pool |
| `test/download.test.js` | File downloads, banking, retry queue, drain |
| `test/drain.test.js` | The periodic pending-download scheduler |
| `test/rate-limit.test.js` | Fixed-window API rate limiter |
| `test/security.test.js` | CSP header construction and Host sanitization |
| `test/shutdown.test.js` | Close-tab WebSocket watchdog |
| `test/routes.test.js` | Full API surface over real HTTP |
| `test/client/harness.test.js` | The fake DOM itself (see below) |
| `test/client/app.test.js` | Play page wiring and mode machine |
| `test/client/banner-picker.test.js` | Tag search box and keyboard flow |
| `test/client/roll.test.js` | The whole roll lifecycle (largest file) |
| `test/client/gallery.test.js` | Collection grid, pager, detail view |
| `test/client/collection.test.js` | Collection page bootstrap |
| `test/client/close-detection.test.js` | Client side of the shutdown socket |

## Conventions

- **Dependency injection.** Every client component is a factory that
  takes `document`, `fetch`, timers, and `random` as arguments. Tests
  inject fakes; production passes the real ones at the bottom of each
  file. Follow this pattern for new components.
- **Fake DOM.** `test/client/helpers.js` implements just enough DOM for
  this app: elements, class lists, attributes, events, and simple
  selectors (compound like `.a.b`, descendants like `.wrap .target`).
  Its behavior is pinned by `harness.test.js`. Do not reach for real
  browser features there without extending both.
- **Fake timers.** Client tests use `fakeTimers()` from the same
  helpers; animation fallbacks are driven by firing timers instead of
  waiting. Server-side scheduling tests use their own `fakeScheduler`.
  Exact pending-timer assertions (for example `[1200]`) are deliberate:
  they lock animation choreography.
- **No network.** `fetchImpl` stubs replace every upstream call.
  `routes.test.js` is the exception: it starts a real HTTP server on an
  ephemeral port through `startServer`.
- **Class toggling is the contract.** Most client assertions check
  which classes a component adds or removes. Keep class names stable,
  or update TEST.md together with the tests.

## What the suite covers

### Part 1 — Server

**State (`state.test.js`).** Default state creation, persistence across
reload, atomic saves with `.bak` backups, skip-write when unchanged,
backup recovery from corrupt files, `.corrupt` preservation, structural
validation rejects, refusal to write invalid state, backfill of missing
fields from older files, and `removeEarned` file-plus-metadata deletion.

**Economy (`economy.test.js`).** Five rolls per whole hour, floor
behavior, cap at 200, balances above the cap stay untouched, daily bonus
at day boundaries including at-cap stacking rules, first-open +50
exactly once, spend clamps at zero, and no double-grant on repeated
reads within one accrual period.

**Danbooru client (`danbooru.test.js`).** Throttle spacing with a fake
clock, autocomplete mapping plus category filtering plus empty-query
short-circuit, URL construction, `rating:g order:score` enforcement,
static-format filtering, large-image fallback, and roll pool building:
distinct draws, earned exclusion, deep paging, page-cap stop, and the
insufficient-pool result.

**Downloader (`download.test.js`).** Extension and banner-tag
sanitization including Unicode and traversal, path building, successful
banking with metadata, retry then success, queueing on CDN failure,
idempotent banking, re-download of a lost file, buffer fetch retries,
retry exhaustion throwing, and drain semantics for queued items.

**Drain scheduler (`drain.test.js`).** Startup timeout plus interval
scheduling, save only after successful retries, no-op on an empty
queue, overlap guard, and error swallowing with recovery.

**Rate limiter (`rate-limit.test.js`).** Passes under the limit, 429
with `Retry-After` over it, window reset using injected time, and exempt
paths.

**Security headers (`security.test.js`).** Host reflection into
`connect-src`, fallback to the default host, rejection of injection
attempts and malformed hosts, companion headers, and `sanitizeHost`
directly.

**Shutdown watchdog (`shutdown.test.js`).** Uses real WebSockets over
loopback with condition polling: no early shutdown, shutdown after the
last disconnect, reconnect inside the grace period keeps the app alive,
multiple concurrent clients, and rejection of non-`/ws` upgrade paths.

**API routes (`routes.test.js`).** Every endpoint over real HTTP:
health, static pages, CSP and companion headers, rate limiting,
autocomplete passthrough and errors, pool charging (402 and 409 paths),
image proxy allowlist including subdomain rejection, banking with
sanitization and idempotency, earned listing with pagination and
downloaded flags, deletion, static collection serving, and balance
accounting. Tests share a `bootApp` helper that seeds state, injects
fakes, and returns the base URL plus store and directories.

### Part 2 — Client

**Harness (`harness.test.js`).** Text content assembly, compound and
descendant selector matching, and timer bookkeeping. If a component
test fails here first, suspect the fake DOM, not the component.

**Play page (`app.test.js`).** `index.html` declares everything
`createApp` needs and loads scripts in dependency order. Mode switches
(`hero → rolling → top`) follow roll callbacks, including the hero fade
and controls-rise transitions. Picker, roll, close-detection wiring, and
health status rendering. Reduced-motion and `.sr-only` presence are kept
as a small accessibility contract.

**Banner picker (`banner-picker.test.js`).** Rendering, suggestion
rendering and selection, empty states, keyboard navigation with wrap-around,
Enter/Tab fill versus second-Enter submit, Escape, ARIA combobox roles,
and debounced input producing exactly one request via injected timers.

**Roll (`roll.test.js`).** The largest file, ordered by lifecycle:
button gating and balance display; pool request errors and loading
states; card structure, rarity tiers, slide-in gated on image settle;
spinner visibility, placement in the card-area wrap, and reroll-after-loss
sequencing; peek-cover-reveal cycles preserving 3D structure; flip order
permutation; call and flip flow with focus, dimming, and neighbor shifts
that keep spacing even; coin spin duration randomization (900–3000 ms),
outcome-facing keyframes, and long-spin tiering; win badges, loss shake
and lockout, panel sequencing; banking, celebration choreography,
results view, live-region announcements; and reroll cleanup.

**Gallery (`gallery.test.js`).** Grid rendering, default page size,
page replacement, pager edge disabling, numbered pager windows with
ellipses, skip buttons, pending chips, detail view open/close, prev/next
with cross-page continuation, arrow-key navigation, delete confirmation,
failed-delete and failed-fetch paths.

**Collection page and close detection (`collection.test.js`,
`close-detection.test.js`).** Gallery mount plus websocket wiring, and
the three-attempt reconnect policy with reset on open.

## Manual smoke tests

Run these before a release. Automated tests cannot judge look, feel, or
timing in a real browser.

1. Start with `npm start`. Confirm the browser opens at
   `http://127.0.0.1:3000` and the status shows `online`.
2. Search a tag, pick it from the suggestions with mouse and with
   keyboard only, then press Enter to roll.
3. Watch the spinner appear while images load, hold its position, and
   fade out as the cards slide in.
4. Play through a win: cards focus and neighbors shift apart evenly,
   the coin spins between about 0.9 and 3 seconds, lands on the called
   face, and won cards show badges and stay bright.
5. Back out to bank. Confirm the celebration, results heading, and the
   return to the hero screen.
6. Lose a roll on purpose. Confirm the losing card shakes and tints, the
   controls drop back in, and a reroll exits the old cards before the
   spinner fades back in.
7. Open the Collection page. Confirm the paged gallery, pager buttons
   and page numbers, full-size view with arrow keys, delete with
   confirmation, and the `pending` chip behavior.
8. Close the browser tab. Confirm the server shuts down within a few
   seconds (see the terminal). Refreshing or a second tab must keep it
   alive.
9. Enable OS-level `prefers-reduced-motion` and repeat steps 3–6. All
   animations should be effectively instant, including the coin flip.
10. Set the port with `PORT=4000 npm run serve` and confirm the app
    answers there and stays up until stopped.

## When you change code

- Add or adjust tests next to the behavior you changed. One test per
  behavior, named as a sentence about that behavior.
- Keep new components injectable so they stay testable without a
  browser.
- Run `npm test` and `npm run lint` before committing.
