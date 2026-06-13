# Sigma Trade userscripts — handoff for Claude Code

You are picking up two Tampermonkey userscripts that customize https://web.sigma.trade. Files are in this conversation's outputs and presumably already in the user's `~/Library/Application Support/Google/Chrome/Default/Extensions/...` Tampermonkey store. The user (Jorge, FL-based PE / options trader) installs via Tampermonkey and refreshes Sigma to test.

## Files

- `sigma-extrinsic.user.js` (v1.3.3) — injects two new columns into the option chain: **EXT** (extrinsic = mid − intrinsic) and **INT** (intrinsic), mirrored across the strike column. Pure JS DOM injection (Sigma's chain is 3 separate `<table>` elements, can't do via CSS).
- `sigma-compact.user.js` (v1.11.1) — compact, modern, tastytrade-inspired layout. CSS + JS for volume/OI bars, ATM highlight + strike-edge bars, cross-section hover, click-to-pin marker pills, privacy mode.

Both scripts `@match` `https://web.sigma.trade/*` and `@run-at` `document-end`. Both use a `MutationObserver` to survive Sigma's re-renders.

## Sigma DOM reference (read this before changing anything)

Sigma's chain is built from CSS modules (hashed class suffixes). All selectors use substring-match attribute selectors like `[class*="chain_table_left__"]` to survive hash changes. Key prefixes you'll need:

```
chain_table_left__           — calls side wrapper
chain_table_right__          — puts side wrapper
chain_table_strike__         — strike column wrapper
chain_table_strikeCell__     — individual strike cell (td)
chain_table_strike_ruler__   — colored tick in strike column (3px)
chain_table_symbol_style__   — SPXW/F root-symbol subtitle (hidden by compact)
chain_table_itm__            — applied to ITM cells (only some — see gotcha below)
chain_table_center_info__    — wrapper for marker pills + line
chain_table_deviation_center_line__   — sigma boundary line (dashed)
chain_table_deviation_center__        — sigma boundary pill (1σ/2σ/3σ)
chain_table_center_line__    — orange underlying-price line
chain_table_price_center__   — underlying-price pill
chain_table_main_container_sticky__   — Sigma's chain column-headers strip (sticky, top:0 by default)
chain_table_sideTitle__      — "Calls"/"Puts" banner th
chain_table_tagCol__         — icon column (position 0)
chain_table_col-60/70/80/90__  — column-width utility classes

chains_sticky_header__       — wraps expirations + IV row (sticky, top:0, z-index 112 — important!)
chains_date_change_container__   — expirations dates row (105px)
chains_chain_iv__            — Implied Volatility row (46px)

trade_stockInfo__            — inside .card-header (the Ford Motor Co bar)
.card-header                 — the .trade.card's stock-info header (height 67px)
.trade.card                  — the chain card (height ~1334px for Ford)
body > header                — Sigma's site navbar (height 66px, position:static by default, contains Ctrl+K search)

custom-ticker_tickerControls__   — ▲ Hide / ⚙ Edit row inside .trade.card
custom-ticker_tickerWrapper__    — SPY/QQQ ticker info row
ticker-alerts_exdivBanner__      — ex-dividend banner
chain_table_table__              — the actual <table> element
chain_table_strikeTable__        — the strike-side <table>
chain_table_wrap__               — wrap div around each table; two per side (header wrap + body wrap)
```

### Column orders (post-injection)

**Calls** (left side): `[icon(0), Change(1), Delta(2), EXT(3), INT(4), IV(5), Volume(6), OI(7), Mid(8), Bid(9), Ask(10)]`

**Puts** (right side): `[Bid(0), Ask(1), Mid(2), OI(3), Volume(4), IV(5), INT(6), EXT(7), Delta(8), Change(9), icon(10)]`

Note: puts are mirrored. EXT and INT swap positions between sides.

### Three-table structure

Each "section" (calls, strike, puts) is TWO `chain_table_wrap__` containers stacked: a header wrap (thead+colgroup, no tbody) and a body wrap (tbody+colgroup, no thead). When you inject columns, you need to update **both** colgroups + the header `<th>` + every body row's `<td>`.

The three sections are not in one giant `<table>` — they're three independent ones. Row heights don't auto-sync across them. Any per-row styling that needs to align across sections (e.g. expanded marker rows) requires JS to tag rows by index in all three.

## sigma-extrinsic.user.js — design notes

**Idempotent primitives**: `ensureHeaderTH`, `ensureColgroupCol` (both colgroups), `ensureBodyCells` (per-row check). Every call is safe to repeat. Uses `data-ext-injected`-style markers to avoid duplicates.

**Strike parsing gotcha**: `textContent` concatenates child nodes with no separator. Strike cells contain badges (`-2` position indicator), the strike number, and sometimes a dividend marker. `textContent` of a row with strike 27.5 and a `-2` badge becomes `-227.5`, or worse, two child text nodes "2" + "7.5" become "27.5" when the actual strike is something else. **Use `innerText.split(/\s+/)` and pick the last clean numeric token matching `/^\d+(\.\d+)?$/`.** This is the single most error-prone line in the script — preserve it.

**Mid column lookup**: don't hardcode — call `findColIdxByText('Mid')` against the (already-injected) header. The extrinsic calc needs Mid: extrinsic = mid − max(0, S − K) for calls, mid − max(0, K − S) for puts.

**Body cell insertion order matters**: When inserting multiple cells into a row, insert in **ascending order of current header position** so each insertion doesn't shift the next one's target index.
- Calls: EXT at position 3, INT at position 4 → insert EXT first, then INT.
- Puts: INT at position 6, EXT at position 7 → insert INT first, then EXT.

If you ever change the column order, double-check this.

**Self-heal**: If `fullResetIfNeeded()` detects the header marker is missing (Sigma rebuilt the chain), it clears all `data-ext-injected` attributes, restores the title cell's colspan, and re-runs from scratch. Without this, expiration changes break alignment.

**Colors**:
- EXT positive → `#4a90e2` (blue) — normal extrinsic
- EXT negative → `#e74c3c` (red) — stale/locked quote (mid < intrinsic, free arb in theory)
- INT > 0 → `#f39c12` (orange)
- INT = 0 → gray

**MutationObserver**: 200ms debounce, observes the entire chain wrap. Triggers on expiration tab clicks, symbol changes, and price ticks (which usually don't change column structure but defensive).

## sigma-compact.user.js — design notes & history

Evolved through 7 versions. Key decisions captured below.

### Layout / density (v1.0–v1.1)

- Forced 24px row height on all tbody trs across the three sections. Strike cells included.
- Strikes/calls/puts rows are different `<table>` elements; row-height alignment requires identical `height` rules per side. No row-spans needed since each table has its own rows.
- Marker pills (sigma boundaries + price) overlapped strike numbers. **v1.0** tried JS to detect marker rows and expand them to 40px across all three tables via a `data-marker-row` attribute. User rejected — non-uniform row heights felt broken. **v1.2+** dropped that approach entirely: rows are strictly uniform 24px, marker pills are `opacity: 0` by default and revealed only on hover or click.

### Marker pills (v1.2)

The container `chain_table_center_info__` holds two kinds of children:
- the line element (`chain_table_deviation_center_line__` for sigma boundaries, `chain_table_center_line__` for underlying price)
- the pill text element (`chain_table_deviation_center__` for sigma boundaries, `chain_table_price_center__` for underlying)

Selector trick: `[class*="chain_table_center_info__"] > *:not([class*="_line__"])` catches all pill variants without enumerating them. Both `deviation_center_line__` and `center_line__` contain `_line__`, so they're correctly excluded.

Click-to-pin: delegated `document.addEventListener('click', ...)` toggles `data-marker-pinned` on the strike cell. Guarded by `window.__sigmaCompactClickPinAttached` so it attaches exactly once even if `applyStyles()` runs many times.

### Hidden marker elements (v1.3, v1.4)

User wanted the orange underlying-price line **and** pill gone entirely (price is in the sticky header, redundant). Two separate CSS rules:
```
[class*="chain_table_center_line__"] { display: none !important; }  /* line */
[class*="chain_table_price_center__"] { display: none !important; } /* pill */
```

`chain_table_center_line__` matches the orange-price line but **not** `chain_table_deviation_center_line__` because the "deviation" substring breaks the contiguous match. Sigma-boundary lines remain visible. Verify this if Sigma ever renames classes.

### Sticky header saga (v1.3 → v1.6)

This was the longest debugging path. Three failed approaches before the working one:

**v1.3** — `.card-header { position: sticky; top: 0; z-index: 100 }`. Worked at low scroll, broke at extreme scroll because:
1. `position: sticky` is bounded by its parent (`.trade.card`, height 1334px). On longer chains it would unstick at the bottom.
2. **Sigma has its own sticky element `chains_sticky_header__` with `z-index: 112`** — this is what was actually covering our card-header when scrolled. Our z-index was too low.

**v1.4** — Same sticky approach but added `chain_table_main_container_sticky__ { top: 67px }` to push it down. Didn't fix the chains_sticky_header overlap.

**v1.5** — Switched to `position: fixed; z-index: 200`. Fixed the parent-bounds issue and beat z-index 112. But fixed at `top: 0` permanently overlapped Sigma's site navbar (`body > header`), hiding the Ctrl+K search. User noticed immediately.

**v1.6 (current sticky setup)** — Pin **both** the Sigma site navbar AND the card-header:
```
body { padding-top: 66px !important; }                /* compensate for fixed navbar */
body > header { position: fixed; top: 0; z-index: 300; }
.card-header { position: fixed; top: 66px; z-index: 200; }
.trade.card { padding-top: 67px !important; }         /* compensate for fixed card-header */
[class*="chains_sticky_header__"] { top: 133px; z-index: 99; }       /* 66+67 */
[class*="chain_table_main_container_sticky__"] { top: 284px; z-index: 50; }   /* 133+151 */
```

Sigma's chains_sticky_header is ~151px (105 expirations + 46 IV). Chain column headers (`chain_table_main_container_sticky__`) is ~60px.

Final stack (top to bottom of viewport):
- 0–66: Sigma navbar (fixed, z 300)
- 66–133: Ford card-header (fixed, z 200)
- 133–284: chains_sticky_header (sticky, z 99)
- 284–344: chain_table_main_container_sticky (sticky, z 50)
- 344+: scrollable chain body

Total ~344px of stuck content. Tunables: `STICKY_HEADER`, `STICKY_SIGMA_NAVBAR`, `SIGMA_NAVBAR_HEIGHT`.

### Modernization pass (v1.7)

Targeting tastytrade/moomoo aesthetics. Four toggles at the top of the file:
- `MODERN_TYPOGRAPHY` — SF Pro / Inter system stack, tabular-nums, uppercase tracked column headers, dotted bid/ask underlines.
- `SOFT_SECTION_TINT` — Sigma's section TR row has a `linear-gradient(90deg, rgba(21,128,61,0.9), rgba(21,128,61,0.2))` for calls (and matching red for puts). Softened to `rgba(34,197,94,0.18)` with a faster fade.
- `ROW_HOVER_HIGHLIGHT` — 80ms transition, `rgba(120,160,220,0.06)` on hover.
- `VOLUME_BARS` — JS-driven horizontal background fill behind Volume and OI cells. Green (calls), red (puts), white (OI). Uses `style.backgroundImage` (NOT `style.background`) so it stacks with the ITM background-color underneath. Re-runs on every MutationObserver tick, debounced 250ms.

### ITM shadow bug (v1.7 → v1.7.1)

**Sigma only applies the `chain_table_itm__` class to a subset of cells in an ITM row** — Change, Delta, IV, Mid, Bid, Ask. Not Volume, not OI, and definitely not the EXT/INT columns the extrinsic script injects.

Pre-modernization this was invisible — the tint was so subtle nobody noticed. After the modernization pass it became a striped/broken shadow with obvious gaps.

Fix in v1.7.1, two parts:
1. Volume bars use `cell.style.backgroundImage = ...` (not `background:` shorthand) so they don't erase `background-color`.
2. CSS `:has()` rule extends the tint across the full row whenever any cell in that row has the ITM class:
```
[class*="chain_table_left__"]  tbody tr:has([class*="chain_table_itm__"]) td,
[class*="chain_table_right__"] tbody tr:has([class*="chain_table_itm__"]) td {
  background-color: rgba(255, 249, 231, 0.22) !important;
}
```

Match Sigma's original 0.22-ish alpha so the band looks like it was there from day one. `:has()` is supported in all modern browsers as of 2023.

## Performance (extrinsic v1.3.3 / compact v1.11.1)

User reported the page got "super slow when getting into the option chain." Root cause was a **DOM mutation/write storm on every streaming quote tick**, not any one feature. A 5-lens audit (observers / reflow / per-tick cost / paint / git history) plus adversarial verification converged on these. Fixes preserve every invariant above (idempotency, self-heal, EXT/INT alignment, re-injection-after-rebuild).

**1. (CRITICAL) extrinsic observer watched `characterData` on the whole `document.body` subtree.**
Every streaming price digit (bid/ask/mid/IV/volume on every row) is a text-node mutation — hundreds–thousands of mutation records/sec on a 200-row chain — so the browser's observer machinery ran continuously even though `schedule()` is debounced. This was the single biggest tax (and the reason an extrinsic script that "never changed" was always a cause).
- Fix: observer is now `{ childList: true, subtree: true }` (no `characterData`). EXT/INT only need to **re-inject** on structural change (childList), which this still catches. `fullResetIfNeeded()` keys off a missing header marker = a childList event, so self-heal is unaffected.
- Because pure price ticks no longer drive an update, EXT/INT **values** are refreshed by a gentle `setInterval(schedule, 1500)` poll instead of reacting to every tick. Routed through `schedule()` so it keeps the reset-check + debounce; the `running` re-entrancy guard prevents overlap. ~1.5s value lag on EXT/INT is the accepted trade-off.

**2. (HIGH) compact `applyAtmHighlight()` re-parsed static strikes + re-tagged ~600 rows every pass.**
Strike prices are immutable between rebuilds, but the pass rebuilt the strikes array (200 `innerText` reads — `innerText` is layout-aware and forces reflow) and re-wrote `data-side`/`data-atm` on all three tables every tick.
- Fix: strikes are cached on `window.__sigmaAtmCache`, re-parsed only when the ladder changes — detected by a **new tbody element OR a change in the `rowCount|firstCellText|lastCellText` signature** (signature uses reflow-free `textContent`; first/last rows sit away from the ticking price marker so it's tick-stable). **Kept `innerText` for the actual parse** — `textContent` would mis-parse a position-badge row (`-2` + `27.5` → `-227.5`); see strike-parsing gotcha above. Tagging switched to read-guarded writes (`getAttribute`/`hasAttribute` first, write only when wrong) — near-zero writes steady-state, still self-heals if Sigma swaps a row element in place.
- **Known edge (low-prob, accepted):** if Sigma ever reuses the same tbody on an expiration change with identical count AND identical first/last strikes but different *interior* strikes, the cached strikes go stale until the next structural change → ATM band points one row off. Doesn't happen on a normal monotonic ladder (same symbol = same ladder; different expirations almost always change the count). Interior sample points were rejected because the ATM price marker would churn the signature every tick. If this is ever observed, invalidate the cache more aggressively.

**3. (HIGH) compact `applyVolumeBars()` wrote `style.backgroundImage` on ~800 cells every pass** regardless of change, which also forced off-screen rows back into layout (defeating `content-visibility: auto`). Fix: only write the gradient when the fill % changed >0.05 (tracked in `cell.dataset.barPct`); cleared on the zero branch. Skips ~80–95% of writes steady-state. Also deleted a dead `style.background` legacy-shorthand clear (v1.7.0 era; current code only sets `backgroundImage`).

**4. (MEDIUM) extrinsic re-scanned the header for the Mid column (`findColIdxByText('Mid')`) every pass.** Fix: `cachedMidIdx()` caches the index in a `WeakMap` keyed on the header element, with an O(1) single-cell re-validation; a rebuilt header (new element) or shifted column re-scans automatically.

**Rejected (audit suggested, verification killed):** changing the strike parse `innerText`→`textContent` (breaks badge rows — #2); rAF-batching the volume-bar writes (breaks idempotency under rapid re-calls); converting the `:has()` ITM tint to a JS-set `data-itm` (adds per-tick JS, likely worse than the CSS). Observer-scope narrowing (documentElement/body → chain wrappers) is a real but lower-priority win left for later — removing `characterData` already removed the dominant cost, and narrowing has tbody-rebuild-catch subtleties.

**Note on compact's observer:** it watches `document.documentElement` `{childList, subtree}` — NO `characterData`. So its heavy passes fire on structural/React-commit mutations (burst: symbol/expiration/All-strikes/scroll), not on every price digit. The caches above make each burst pass cheap; narrowing its scope is the next lever if needed.

### The bid/ask-click freeze on big chains is SIGMA's, not ours (measured 2026-06-13)

User reported SPX still "extremely slow" when clicking bid/ask to build a spread, even after the fixes above. Profiled live on the SPX chain (269 strikes, "All" range, price ~7431) **with Tampermonkey fully DISABLED — zero userscripts**, dispatching a real click on a bid cell and capturing `PerformanceObserver('longtask')` + a classifying `MutationObserver`:

- 1st leg click: **240 ms synchronous** in the handler + long tasks `[460, 122, 232]` ms = **~814 ms main-thread blocking**.
- 2nd leg click (building the vertical): long tasks `[120, 207, 191]` = **~518 ms blocking**.
- Only **11 / 23 DOM mutations** per click (≈7 in-chain, the rest the `strategy-info` panel) — so it's **not** a mutation storm; it's Sigma doing heavy synchronous compute/React reconciliation per leg on a 269-row chain. The renderer even hit a 30 s CDP screenshot timeout ("frozen") mid-test.

**Conclusion: the per-click freeze is Sigma's own rendering and cannot be fixed from the userscripts.** Our scripts add only a few ms on top (the audit measured ~6–8 ms/pass on 269 rows; the dominant JS item is volume bars at ~4 ms). Don't chase the click freeze in the mask.

Levers that actually matter for it (all outside our code):
1. **Reduce the strike range** — the "Strike ▲ All" Ant-select at 269 rows is Sigma's worst case; per-click render scales with rendered rows. A focused ±N range is the single biggest win. (This is a Sigma control, not ours.)
2. Report to Sigma — it's their React re-render/recalc.

Why observer-scope-narrowing does NOT help the click case: the `strategy-info` order/strategy panel (maxLoss/maxProfit/breakeven/POP) that mutates on each leg-click is **inside `.trade.card`** (verified: `tradeCard.contains(panel) === true`), so narrowing our observer to `.trade.card` wouldn't exclude it; narrowing further to the `chain_table_*` wrappers risks missing chain rebuilds (those wrappers are replaced on symbol/expiration change). Given our contribution is a few ms vs Sigma's ~800 ms, scope-narrowing isn't worth the correctness risk for this case. (It would still modestly help the streaming case, but #1 firehose removal already took the dominant cost there.)

One caveat worth a future look: with scripts ON we inject EXT/INT `<td>`s into Sigma's React-managed rows, giving React foreign children to reconcile — this *may* add a little to Sigma's per-click re-render, but scripts-OFF is already ~800 ms, so it's not the user's primary issue.

## Pending / open items

1. **tastytrade visual comparison** — user asked to make the table "look modern like moomoo or tastytrade." Got most of the way there in v1.7 (typography, banners, volume bars, hover, ITM fix). User asked Claude to inspect tastytrade's chain directly to learn their patterns. **The Claude in Chrome extension blocks tastytrade.com on its financial-site safety list — no DOM/screenshot access from this side.** Sandbox network is also allowlisted (anthropic + npm/pypi/github/ubuntu only) so Playwright can't reach it either.
   - **Next move**: ask user to paste a screenshot of their tastytrade chain. Then add specifics like: color-coded delta gradient, ATM strike highlight bar, more aggressive bid/ask styling, etc. Until then, current v1.7.1 is a reasonable approximation.

2. **Symbol search Ctrl+K** — works because we pinned Sigma's site navbar. If user later wants more vertical chain space, the `STICKY_SIGMA_NAVBAR` toggle can be set to `false` and Sigma navbar becomes a normal scrollable element again. Card-header drops to `top: 0` automatically (the script uses a ternary on this toggle).

3. **ATM strike highlight** — not implemented. Sigma doesn't mark the ATM strike with any class. Would require computing ATM ourselves: parse the price out of the (now-hidden) `chain_table_price_center__` element's text, find the closest strike in the strike body, add a class to that row, style it. Probably worth doing as part of next modernization round.

4. **Screenshot tool quirk** — Claude in Chrome's screenshot endpoint sometimes renders the page as if `position: sticky/fixed` elements aren't pinned. The DOM diagnostics (`getBoundingClientRect`, `elementFromPoint`, computed styles) are reliable; the screenshots are not. If you go to verify a sticky-positioned element in the future and the screenshot looks wrong, trust the DOM, not the image.

## Other context

User profile:
- Jorge, FL-based Lead Distribution Engineer at WSP (PE license)
- Active options trader (wheel, PMCC, iron condors, spreads)
- Trades a friend's funds via FL multi-member LLC investment club, Tradier entity account `6YA32419`
- Has built / is building: pyOptionTracker (Railway-deployed, Fernet-encrypted Tradier keys, Stripe billing), Wheeler (Go), Tradier MCP integration for Claude, autonomous SPY iron condor system
- Has a `-2` position open at F strike 12 (visible in screenshots as a red position badge — script preserves it; don't hide).
- Sigma Trade is a Spanish-language Tradier frontend he uses heavily.
- Uses Claude Code with `--dangerously-skip-permissions`, worktrees, `/loop`.

How to test changes:
1. Edit the file in Tampermonkey's editor or paste a new version.
2. Refresh https://web.sigma.trade. The userscript fires at `document-end`.
3. Try symbol changes, expiration changes, switching strike count to "All", scrolling to absolute bottom, hovering rows. Each one has historically exposed a different bug.

What tests to keep in mind:
- "All strikes" dropdown → makes the chain long. Tests sticky behavior at extreme scroll.
- Expiration tab click → tests MutationObserver-driven re-injection of EXT/INT and volume bars.
- Symbol change (Ctrl+K → type new symbol) → tests full reset.
- Position badges → don't accidentally hide them (they're not in `chain_table_center_info__`; they're separate elements).
- ITM/OTM transition strikes → make sure the ITM tint band starts/ends cleanly at the right strike, not one off.

If something looks "broken", the first move is always: open devtools, inspect the affected cell, compare its computed background/border to a neighbor, check what classes Sigma added vs what classes the userscripts added.
