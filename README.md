# Gachabooru

Gachabooru is a local, single-user gacha game built on images from
Danbooru.

Pick a tag as your banner and draw five of its top-scored images. Peek
at them briefly, then call heads or tails as each card flips. If your
call matches, you keep the card. If it doesn't match, the roll ends and
you lose that roll's pending wins. Back out after a win to bank what
you earned.

## Setup

You need:

- Node.js 20 or newer (it includes `fetch`)
- npm

To install and start the app:

```sh
npm install
npm start
```

`npm start` starts the server and opens the app in your default browser
at `http://127.0.0.1:3000`. The app runs on Windows, macOS, and Linux.
If you want the server without the browser, use `npm run serve`
instead. You can also start the launcher directly with `node run.js`.

When you launch the app with `npm start` or `node run.js`, the server
shuts down a few seconds after you close the browser tab. You don't
need to stop anything in the terminal. Refreshing the page or keeping
several tabs open keeps the server running. With `npm run serve`, the
server stays up until you stop it yourself.

## How to play

The app shows general-rated posts only. Danbooru classifies these posts
as suitable for everyone, so there's no rating setting.

1. Search for a tag (character, copyright, or general), then select it
   as your banner.
2. Click **Roll**. A roll costs one roll from your balance.
3. Watch the peek: all five cards reveal their images for 3 seconds,
   then turn face-down.
4. For each card in random order, call heads or tails, then flip.
   - If your call matches, you keep the card.
   - If it doesn't match, the roll ends and this roll's pending wins
     are gone.
5. After a win, click **Back out & bank** to keep your wins, or keep
   flipping. If you win all five, the game banks all five.

## Economy

- Your first launch grants a one-time bonus of 50 rolls.
- The balance grows by 5 rolls every whole hour, up to a cap of 200.
- At each 24-hour boundary, if your balance is 200 or less, the game
  adds 10 rolls (up to 210).
- The balance never drops below 0.

## Collection

Banked images are stored under `collections/<banner_tag>/`.

To browse them, select **Collection** in the header. The gallery shows
the newest images first, 20 per page in a five-column grid of 3:4
thumbnails. The pager under the grid jumps to the first, previous,
next, or last page, or straight to any page number.

Click an image to view it at full size. To remove an image, click
**Delete**: the app deletes the file and its metadata, and the image
becomes eligible for future rolls again. Images whose download is still
pending carry a small badge; the app retries those downloads
automatically.

## Data

Your collection and balance live in `data/state.json`. Every save also
writes a backup to `data/state.json.bak`. If the state file is
corrupted, the app recovers from the backup at startup. If no valid
backup exists, the app starts fresh and preserves the broken file as
`data/state.json.corrupt` so you can inspect it.

## Configuration

You can set these environment variables:

- `GACHABOORU_UA`: optional User-Agent override for requests to the
  Danbooru API. Default: a generic app identifier.
- `PORT`: the port to bind on. Default: `3000`.

The server accepts connections from localhost only.

## Danbooru API

The app uses the public Danbooru API and sends about one request per
second at most, to respect its rate limits. The CDN sometimes
challenges image downloads. When a download fails, the app queues the
image and retries it at startup and periodically while it runs.

## Security

Responses include a Content-Security-Policy that allows only the app's
own scripts and styles, local images, images from `cdn.donmai.us`, and
same-origin connections for the API and the close-detection WebSocket.
Responses also set `X-Content-Type-Options: nosniff` and
`Referrer-Policy: no-referrer`. The API allows up to 120 requests in
any 10-second window and returns 429 beyond that limit;
`/api/health` is exempt. Because the server accepts localhost
connections only, these measures act as a second line of defense
behind your machine's own network boundary.

## Content disclaimer

The app shows general-rated posts only, which are completely safe for
work. Rolls and the gallery still reflect the tags you choose, so you
are responsible for the content you browse. Keep the app private, and
don't share collections that contain sensitive material.

## Development

- Tests: run `npm test`. Server tests use `node:test`; client tests
  use a minimal DOM harness.
- Lint: run `npm run lint` (`oxlint`).
- Testing instructions: see `TEST.md`.
- Accessibility: the play page respects the system-level
  `prefers-reduced-motion` setting and makes every animation instant
  when it's enabled. The page manages keyboard focus across the roll,
  flip, and bank phases.

## License

MIT. See `LICENSE`.
