# Sigma.trade.mask

Tampermonkey userscripts that customize [web.sigma.trade](https://web.sigma.trade) (a Tradier frontend) with a modern, compact, tastytrade-inspired option chain plus extrinsic/intrinsic columns.

## What's in here

| Script | Version | What it does |
| --- | --- | --- |
| [`sigma-compact.user.js`](sigma-compact.user.js) | 1.10.1 | Compact, tastytrade-styled chain + compact dashboard. **Trade page**: uniform 24px rows, SF Pro / Inter typography, solid dark-blue section banner, sentence-case "Calls" / "Puts" labels, "(Sell)" / "(Buy)" suffixes on Bid / Ask headers, continuous red/green vertical bar on strike-column edges (red above ATM / green below), subtle orange ATM-strike row highlight extending across all three tables, full-row ITM tint via `:has()`, cross-section row hover via JS using `box-shadow: inset`, volume/OI magnitude bars, pinned site navbar + stock-info header (Ctrl+K stays reachable at any scroll). **Dashboard**: compact Position + Orders tables (~50px rows down from ~79px) with expandable rows preserved; sticky stock-info header no longer pinned here so Market Performance + Watch List stay visible. |
| [`sigma-extrinsic.user.js`](sigma-extrinsic.user.js) | 1.3.2 | Injects `EXT` (extrinsic = mid − intrinsic) and `INT` (intrinsic) columns, mirrored around the strike column. Updates live on price/symbol/expiration changes. |

Both scripts target `https://web.sigma.trade/*` and survive Sigma's re-renders via `MutationObserver`. Architecture notes and gotchas: [`docs/sigma-handoff.md`](docs/sigma-handoff.md).

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Click each install link below. Tampermonkey will pop up an install dialog showing the script header — confirm.
   - **Install [sigma-compact](https://raw.githubusercontent.com/jorgegarcias60/Sigma.trade.mask/main/sigma-compact.user.js)**
   - **Install [sigma-extrinsic](https://raw.githubusercontent.com/jorgegarcias60/Sigma.trade.mask/main/sigma-extrinsic.user.js)**
3. Reload https://web.sigma.trade. Both scripts fire at `document-end` / `document-idle`.

### Auto-update

Each script declares `@updateURL` + `@downloadURL` pointing at the `main` branch raw URL. Tampermonkey checks for updates on its own schedule (default: every day, also when you reload a matched page). To force a check: Tampermonkey dashboard → **Installed Userscripts** → **Last updated** column header click, or per-script **Check for updates**.

After every `git push` to `main`, the next time Tampermonkey checks the version is bumped automatically — but **only if the `@version` field in the script header has been incremented**. Don't forget to bump the version when you change a script (e.g. `1.7.1` → `1.7.2`) or installed copies won't update.

## Configuration

Both scripts expose tunable constants at the top. Examples from `sigma-compact.user.js`:

```js
const ROW_HEIGHT          = 24;          // compact density
const STICKY_HEADER       = true;        // pin stock-info header
const STICKY_SIGMA_NAVBAR = true;        // pin site navbar (keeps Ctrl+K visible)
const MODERN_TYPOGRAPHY   = true;        // SF Pro / Inter, uppercase headers
const VOLUME_BARS         = true;        // horizontal magnitude fill
const SOFT_SECTION_TINT   = true;        // softer green/red CALLS/PUTS bands
const HIDE_PRICE_LINE     = true;        // orange underlying-price line
const HIDE_PRICE_PILL     = true;        // and its pill
```

Edit them directly in Tampermonkey's editor, save, reload Sigma.

## Development

Tampermonkey edit-refresh loop is the fastest path. To work from the repo:

1. Edit the `.user.js` file in this repo.
2. In Tampermonkey, the installed script and the file in the repo are two separate copies. Either:
   - Paste the new content into Tampermonkey's editor (fast), or
   - Bump `@version`, commit + push to `main`, then "Check for updates" in Tampermonkey (slower but matches the production flow).
3. Reload https://web.sigma.trade.

For deeper context (Sigma's CSS-module class naming, sticky-header z-index stack, ITM `:has()` rule, sticky-header debugging history, etc.), read [`docs/sigma-handoff.md`](docs/sigma-handoff.md).

## License

MIT (assumed — add a LICENSE file if you want to make it explicit).
