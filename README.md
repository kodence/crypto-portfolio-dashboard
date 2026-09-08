# Crypto Portfolio Dashboard

A local, single-user dashboard for tracking crypto holdings. Prices come from CoinGecko and every
position is valued in both USD and SGD. Prices refresh only when you ask them to.

![The dashboard in light mode: a table of holdings with USD and SGD sub-totals and a totals row](docs/screenshot.png)

![The same dashboard in dark mode](docs/screenshot-dark.png)

<sub>Demo data, not a real portfolio. The theme follows your system setting.</sub>

## Quick start

```bash
npm install
npm start
```

The first launch asks you to choose a passphrase (twice), encrypts your holdings, and then
serves <http://localhost:3000>. Every later launch asks for it once to unlock. Typing shows one
`*` per character; backspace works, Ctrl+C aborts.

The prompt needs a real terminal. Launched without one — from an IDE run button, a task runner, or
anything that pipes stdin — the server refuses to start rather than proceeding unencrypted.

No API key is required — the dashboard uses CoinGecko's public free tier. If you have a Demo key
and want the higher rate limit, copy `.env.example` to `.env` and set `COINGECKO_API_KEY` (or just
export it in the shell before `npm start`).

## Usage

> **No hosted demo.** The app has no authentication and keeps a single portfolio file, so a public
> instance would let every visitor read and edit the same holdings. The screenshots above show it
> with demo data; running it locally takes about a minute.

### First run

`npm start` asks you to choose a passphrase, twice. Everything you enter afterwards is encrypted
under it, and **there is no recovery** — put it in a password manager before you go further. Later
launches ask once and print `Unlocked N holdings.`

### Adding a holding

1. Type a symbol or name into **Coin** — the search runs after a short pause.
2. **Pick the exact coin from the list.** Tickers are not unique on CoinGecko: searching `SOLANA`
   returns a memecoin, not Solana. The picker is ranked by market cap and stores the canonical coin
   id, so prices always resolve to the asset you meant.
3. Give it **your label** (`Cold wallet`, `Staking`) — this is yours to name, and defaults to the
   coin name.
4. Enter the **asset size** and click **Add holding**.

### Editing

- **Asset size** — click the number, type a new one. Enter or clicking away saves; Escape abandons
  the edit. Sub-totals and the totals row recompute immediately.
- **Remark** — the last column, edited the same way. Up to 200 characters; save an empty one to
  clear it. Handy for recording which wallet or exchange holds the position.
- **Remove** — click `×` on the row, then `Remove?` to confirm. The confirmation resets itself
  after 4 seconds if you change your mind.

### Reading the table

Columns are `#`, Name, Symbol, Price (USD), Asset Size, Sub Total (USD), Sub Total (SGD), Remark,
with totals at the bottom. SGD figures come from CoinGecko's own SGD quote rather than a converted
USD figure, so there is no second rounding step.

Click either sub-total header to sort: largest first, then smallest first, then back to the order
you added them. The `#` column keeps each holding's original number, so a sorted table shows at a
glance where each position ranks. Sorting happens in the browser and survives a price refresh.

### Refreshing prices

Prices load once when the page opens, and after that only when you click **Refresh prices**. The
timestamp beside the button is the last successful fetch. One request covers every holding, so a
refresh costs a single API call no matter how many you own.

### Backing up and moving machines

`data/portfolio.json` is encrypted, so it is safe to copy into a backup, a synced folder, or a USB
stick. To move to another machine, copy the file across, install the project there, and start it
with the same passphrase. Nothing else is needed — the salt travels inside the file.

### If something goes wrong

| Symptom | Cause |
| --- | --- |
| `Wrong passphrase, or the file has been altered.` | Mistyped passphrase, or the file was edited. The server stops rather than risk overwriting good data. |
| No `Passphrase:` prompt appears | Started without a real terminal (IDE run button, task runner, piped stdin). Run it from a terminal. |
| `CoinGecko rate limit hit.` | Too many refreshes on the free tier. Wait a minute, or set a `COINGECKO_API_KEY`. |
| Prices show `—` and a banner appears | CoinGecko is unreachable. Your holdings still display; only the prices are missing. |

## Encryption

`data/portfolio.json` is encrypted at rest with **AES-256-GCM**. The key is derived from your
passphrase with **scrypt** (N=32768, r=8, p=1) and exists only in the server process's memory —
nothing on disk can decrypt the file.

- **Every write gets a fresh random IV**, and the auth tag means an edited file is rejected rather
  than silently decrypted into garbage.
- **The file is self-describing**: it records the cipher, the KDF parameters, and the salt, so the
  parameters can be raised later without stranding data you already have.
- **A wrong passphrase stops the server** with `Wrong passphrase, or the file has been altered.`
  and exit code 1. It never falls back to writing plaintext.
- **There is no recovery.** Forget the passphrase and the holdings are gone — re-enter them by
  hand. Keep it in a password manager.

### What this does and does not protect

It protects the file: a copy of `data/portfolio.json` lifted from a backup, a synced cloud folder,
a stolen drive, or a repo you accidentally pushed reveals nothing. It does **not** protect against
someone who is already on your machine while the server is running — the decrypted holdings are in
memory and served over plain HTTP on localhost.

### Migrating an existing plaintext portfolio

The first `npm start` after upgrading detects the plaintext file, encrypts it in place, and keeps
the original at `data/portfolio.json.plain.bak`. **Delete that backup once you have confirmed you
can unlock** — until you do, your holdings are still sitting there in the clear.

### Unattended runs

`npm run dev` cannot prompt on every `--watch` restart, so it reads `PORTFOLIO_PASSPHRASE` from a
git-ignored `.env` (see `.env.example`). That puts the passphrase on disk beside the data and gives
up most of the benefit — use it for development, not for your real portfolio. `npm start` never
reads `.env`.

## Scripts

| Command | Does |
| --- | --- |
| `npm start` | Run the server on port 3000 (override with `PORT`). |
| `npm run dev` | Same, with `node --watch` restarts on file changes. |
| `npm test` | Unit tests for the valuation logic (`node --test`). |

## Layout

```
server.js              express wiring
src/storage.js         data/portfolio.json read/write (encrypted, atomic, serialized)
src/crypto.js          AES-256-GCM envelope + scrypt key derivation
src/passphrase.js      hidden startup prompt
src/coingecko.js       the only file that talks to CoinGecko
src/portfolio.js       pure valuation: rows + totals
src/routes.js          REST API
public/                index.html, app.js, styles.css — no build step
data/portfolio.json    your holdings, encrypted (git-ignored, created on first run)
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/portfolio` | Holdings + live prices + computed rows and totals. |
| `GET` | `/api/search?q=` | Coin lookup for the add form. |
| `POST` | `/api/holdings` | `{name, symbol, coinId, amount}` |
| `PATCH` | `/api/holdings/:id` | `{amount}` and/or `{remark}` — change an asset size or note. |
| `DELETE` | `/api/holdings/:id` | Remove one holding. |

## Notes

- **Amounts are JavaScript numbers** (float64). That is fine for a display dashboard; if this ever
  becomes an accounting tool, amounts should move to a decimal type.
- **No auth.** It binds to localhost and anyone who can reach the port sees the decrypted
  portfolio — keep it local, or add auth before exposing it beyond your machine.

## License

[MIT](LICENSE) © kodence
