# Gachabooru

A local single-user gacha game over Danbooru images.

Pick a Danbooru tag as your banner. Draw 5 top-scored images, peek at
them briefly, then flip a coin on each card. Win the flip to keep the
card. Lose the flip to lose the roll. Back out after a win to bank your
earnings.

## Setup

Requirements:

- Node.js 20 or newer (built-in `fetch`).
- npm.

Install and run:

```sh
npm install
npm start
```

`npm start` starts the server and opens the app in your default browser at
`http://127.0.0.1:3000`. It works on Windows, macOS, and Linux. To run the
server without opening a browser, use `npm run serve` instead. You can also
run the launcher directly with `node run.js`.

When launched with `npm start` (or `node run.js`), the server shuts itself
down a few seconds after you close the browser tab. Closing the tab ends
the whole app — you do not need to stop it in the terminal. Refreshing the
page or keeping several tabs open does not stop the server. With
`npm run serve`, the server stays up until you stop it.

## How to play

The app only shows safe content: general and sensitive rated posts. There
is no rating setting.

1. Search for a tag (character, copyright, or general) and select it as
   your banner.
2. Click Roll. A roll costs one roll from your balance.
3. Watch the 5-card peek for 3 seconds. The cards then turn over.
4. For each card in a random order, call heads or tails and flip.
   - A match keeps the card.
   - A mismatch ends the roll and erases this roll's pending wins.
5. After a win, back out to bank the earned images, or keep going.
   Winning all 5 banks all 5.

## Economy

- First launch grants a one-time bonus of 10 rolls.
- The balance accrues 2 rolls per whole hour, capped at 30.
- At each 24-hour boundary, if the balance is below 30, grant 5 more
  rolls (up to 35).
- Balance never drops below 0.

## Collection

Banked images are stored under `collections/<banner_tag>/` and listed in
the gallery. Click an image for a full-size view. Delete an image to
remove its file and metadata; the image becomes eligible for future rolls.

## Configuration

Environment variables:

- `GACHABOORU_UA` — optional User-Agent override for Danbooru API
  requests. Defaults to a generic app identifier.
- `PORT` — the port to bind on. Defaults to 3000.

The app binds to localhost only.

## Danbooru API

The app uses the public Danbooru API. Requests are throttled to about 1
per second to respect rate limits. Image downloads may be challenged by
the CDN; failed downloads are queued and retried on the next bank of the
same image.

## Content disclaimer

The app filters to safe-rated posts only. The gallery and rolls still
reflect the content of the tags you choose. You are responsible for the
content you browse. Keep this app private and do not share collections
that contain sensitive material.

## Development

- Tests: `npm test` (`node:test` for the server, a minimal DOM harness
  for the client).
- Lint: `npm run lint` (`oxlint`).
- Testing instructions: see `TEST.md`.

## License

MIT. See `LICENSE`.
