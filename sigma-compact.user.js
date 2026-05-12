// ==UserScript==
// @name         Sigma Trade — Compact Chain Layout
// @namespace    https://github.com/jorgegarcias60/Sigma.trade.mask
// @version      1.7.1
// @description  Compact, tastytrade-inspired option-chain layout for Sigma Trade. ~2x vertical density with strictly uniform row heights, modern typography (SF Pro / Inter system stack), refined section banners with subtle green/red tinting, uppercase tracked column headers, volume + OI bars (horizontal magnitude fill behind each cell), and row-hover highlight. The Sigma site navbar (with Ctrl+K search) and the stock-info header are pinned at all scroll positions. Price line and price-pill are hidden permanently. Sigma-boundary pills are hidden by default and revealed on hover or click.
// @author       jorgegarcias60
// @homepageURL  https://github.com/jorgegarcias60/Sigma.trade.mask
// @supportURL   https://github.com/jorgegarcias60/Sigma.trade.mask/issues
// @updateURL    https://raw.githubusercontent.com/jorgegarcias60/Sigma.trade.mask/main/sigma-compact.user.js
// @downloadURL  https://raw.githubusercontent.com/jorgegarcias60/Sigma.trade.mask/main/sigma-compact.user.js
// @match        https://web.sigma.trade/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Tunables ----------
  const ROW_HEIGHT          = 24;
  const BODY_FONT_PX        = 12.5;
  const HEADER_FONT_PX      = 10.5;
  const STRIKE_FONT_PX      = 12;
  const MARKER_PILL_FONT_PX = 10;
  const HIDE_ROOT_SYMBOL    = true;
  const SHOW_BIDASK_UNDERLINE = true;
  const ROW_BORDER_OPACITY  = 0.05;
  const ITM_STRIKE_BG_OPACITY = 0.08;
  // The colored sigma-boundary line is always visible. Set to 0 to hide it entirely.
  const LINE_OPACITY        = 0.7;
  // Keep the stock-info header (Ford Motor Co | price | holdings | IV | IVR) pinned to the
  // top of the viewport when scrolling the chain. Set to false to disable.
  const STICKY_HEADER       = true;
  // Also pin Sigma's own site navbar (the row with Dashboard / Trade / search / account info)
  // at the very top so the symbol search (Ctrl+K) stays accessible while scrolling. Set to
  // false if you prefer the navbar to scroll away with the page — in that case STICKY_HEADER
  // will simply pin our Ford bar at viewport top:0 and the navbar will scroll normally.
  const STICKY_SIGMA_NAVBAR = true;
  // The Sigma navbar's height. Used to position the Ford bar just below it. Doesn't need
  // tweaking unless Sigma changes their navbar.
  const SIGMA_NAVBAR_HEIGHT = 66;
  // ---- Modern styling toggles (v1.7+) ----
  // Modern system font stack (SF Pro / Inter) instead of Sigma's default.
  const MODERN_TYPOGRAPHY   = true;
  // Subtle row-hover highlight (helps when scanning across CALLS ↔ STRIKE ↔ PUTS).
  const ROW_HOVER_HIGHLIGHT = true;
  // Volume + OI bars: horizontal background fill behind those cells, scaled to the max
  // value visible. Green for calls volume, red for puts volume, subtle white for OI.
  const VOLUME_BARS         = true;
  // Section banner gradient (green for CALLS, red for PUTS, fading toward center).
  // Sigma's default is a heavy 0.9-alpha gradient; this softens it to ~0.18 alpha.
  const SOFT_SECTION_TINT   = true;
  // The orange horizontal line at the underlying price (chain_table_center_line__) — hide it
  // since the price is already shown in the (now sticky) header. Sigma-boundary lines, which
  // are a different class, are unaffected.
  const HIDE_PRICE_LINE     = true;
  // The "current underlying price" pill (chain_table_price_center__) — hide it entirely.
  // Same reason as the line above: price lives in the sticky header now. Sigma-boundary pills
  // (1σ, 2σ, 3σ) still hide-by-default-show-on-hover via the rules below.
  const HIDE_PRICE_PILL     = true;

  // ---------- CSS ----------
  const css = `
    /* === Uniform compact rows for all three tables === */
    [class*="chain_table_left__"]  tbody tr,
    [class*="chain_table_right__"] tbody tr,
    [class*="chain_table_strike__"] tbody tr {
      height: ${ROW_HEIGHT}px !important;
    }
    [class*="chain_table_left__"]  tbody td,
    [class*="chain_table_right__"] tbody td {
      height: ${ROW_HEIGHT}px !important;
      padding: 0 6px !important;
      font-size: ${BODY_FONT_PX}px !important;
      line-height: ${ROW_HEIGHT - 2}px !important;
      font-variant-numeric: tabular-nums !important;
      border-bottom: 1px solid rgba(255,255,255,${ROW_BORDER_OPACITY}) !important;
    }

    /* === Column headers === */
    [class*="chain_table_left__"]  thead th,
    [class*="chain_table_right__"] thead th,
    [class*="chain_table_strike__"] thead th {
      font-size: ${HEADER_FONT_PX}px !important;
      padding: 4px 6px !important;
      letter-spacing: 0.4px !important;
      height: auto !important;
    }
    [class*="chain_table_left__"]  thead tr,
    [class*="chain_table_right__"] thead tr,
    [class*="chain_table_strike__"] thead tr {
      height: auto !important;
    }

    /* === Strike cell === */
    [class*="chain_table_strikeCell__"] {
      height: ${ROW_HEIGHT}px !important;
      padding: 0 !important;
      font-size: ${STRIKE_FONT_PX}px !important;
      font-weight: 600 !important;
      line-height: ${ROW_HEIGHT - 2}px !important;
      font-variant-numeric: tabular-nums !important;
      position: relative !important;
      background: rgba(255, 249, 231, ${ITM_STRIKE_BG_OPACITY}) !important;
      color: rgba(255,255,255,0.95) !important;
    }

    /* Root-symbol subtitle (SPXW, F, etc.) */
    ${HIDE_ROOT_SYMBOL ? `
    [class*="chain_table_symbol_style__"] { display: none !important; }` : ``}

    /* Vertical "you-are-here" ruler slimmed */
    [class*="chain_table_strike_ruler__"] { height: 3px !important; }

    /* === Marker overlay container (collapses out of flow so it doesn't push rows) === */
    [class*="chain_table_center_info__"] {
      position: absolute !important;
      top: -1px !important;
      left: 0; right: 0;
      height: 0 !important;
      overflow: visible !important;
      z-index: 5;
    }

    /* The horizontal deviation/price line: ALWAYS visible (subtle) */
    [class*="chain_table_deviation_center_line__"] {
      height: 1px !important;
      opacity: ${LINE_OPACITY} !important;
    }

    /* All pill children of center_info (sigma boundaries + current-price marker):
       HIDDEN by default. The :not() excludes the line element. */
    [class*="chain_table_center_info__"] > *:not([class*="_line__"]) {
      opacity: 0 !important;
      transition: opacity 0.12s ease-in-out !important;
      font-size: ${MARKER_PILL_FONT_PX}px !important;
      padding: 1px 6px !important;
      line-height: 14px !important;
      height: 14px !important;
      white-space: nowrap !important;
      z-index: 20 !important;
      position: relative !important;
      top: -7px !important;
      pointer-events: auto !important;
      cursor: pointer !important;
    }

    /* Hover on the strike cell reveals its pill(s) */
    [class*="chain_table_strikeCell__"]:hover [class*="chain_table_center_info__"] > *:not([class*="_line__"]) {
      opacity: 1 !important;
    }

    /* Pinned (click-to-keep-open) state */
    [class*="chain_table_strikeCell__"][data-marker-pinned] [class*="chain_table_center_info__"] > *:not([class*="_line__"]) {
      opacity: 1 !important;
    }

    /* Bid/Ask underline softer */
    [class*="chain_table_left__"]  tbody u,
    [class*="chain_table_right__"] tbody u {
      ${SHOW_BIDASK_UNDERLINE ? `
      text-decoration-color: rgba(255,255,255,0.3) !important;
      text-underline-offset: 1px !important;
      text-decoration-thickness: 1px !important;` : `
      text-decoration: none !important;`}
    }

    /* "Calls"/"Puts" section banners */
    [class*="chain_table_left__"]  thead tr:first-child th,
    [class*="chain_table_right__"] thead tr:first-child th,
    [class*="chain_table_strike__"] thead tr:first-child th {
      font-size: 11px !important;
      padding: 3px 6px !important;
      letter-spacing: 1px !important;
    }

    /* Tighter column widths */
    [class*="chain_table_col-60__"] { width: 50px !important; }
    [class*="chain_table_col-70__"] { width: 58px !important; }
    [class*="chain_table_col-80__"] { width: 64px !important; }
    [class*="chain_table_col-90__"] { width: 72px !important; }

    /* === Modern styling (v1.7) === */
    ${MODERN_TYPOGRAPHY ? `
    /* System sans-serif stack — matches tastytrade / moomoo look */
    [class*="chain_table_left__"],
    [class*="chain_table_right__"],
    [class*="chain_table_strike__"] {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Helvetica Neue", system-ui, sans-serif !important;
      font-feature-settings: "tnum" 1 !important;
    }
    /* Column headers: muted, uppercase, letter-spaced */
    [class*="chain_table_left__"]  thead th,
    [class*="chain_table_right__"] thead th,
    [class*="chain_table_strike__"] thead th {
      color: rgba(255,255,255,0.45) !important;
      text-transform: uppercase !important;
      font-size: 9.5px !important;
      letter-spacing: 0.9px !important;
      font-weight: 500 !important;
      padding: 6px 8px !important;
    }
    /* Section banners (CALLS / PUTS / STRIKE row) */
    [class*="chain_table_left__"]  thead tr:first-child th,
    [class*="chain_table_right__"] thead tr:first-child th,
    [class*="chain_table_strike__"] thead tr:first-child th {
      font-weight: 600 !important;
      text-transform: uppercase !important;
      letter-spacing: 2.5px !important;
      font-size: 10px !important;
      color: rgba(255,255,255,0.7) !important;
      padding: 6px 8px !important;
    }
    /* Strike numbers: subtle weight bump */
    [class*="chain_table_strikeCell__"] {
      font-weight: 600 !important;
      letter-spacing: 0.2px !important;
    }
    /* Body cells: more breathing room */
    [class*="chain_table_left__"]  tbody td,
    [class*="chain_table_right__"] tbody td {
      padding: 0 8px !important;
    }
    /* Bid/Ask: dotted underline instead of solid (subtler) */
    [class*="chain_table_left__"]  tbody u,
    [class*="chain_table_right__"] tbody u {
      text-decoration: none !important;
      border-bottom: 1px dotted rgba(255,255,255,0.28) !important;
      padding-bottom: 1px !important;
    }
    ` : ``}

    ${SOFT_SECTION_TINT ? `
    /* Tone down the section row's heavy gradient (Sigma's default is 0.9 alpha) */
    [class*="chain_table_left__"]  thead tr:first-child {
      background-image: linear-gradient(90deg, rgba(34, 197, 94, 0.18), transparent 60%) !important;
    }
    [class*="chain_table_right__"] thead tr:first-child {
      background-image: linear-gradient(270deg, rgba(239, 68, 68, 0.18), transparent 60%) !important;
    }
    [class*="chain_table_strike__"] thead tr:first-child {
      background: rgba(255,255,255,0.03) !important;
    }
    /* Strike column subtle distinguishing tint + ITM lift */
    [class*="chain_table_strikeCell__"] {
      background: rgba(255, 249, 231, 0.04) !important;
      border-left: 1px solid rgba(255,255,255,0.05) !important;
      border-right: 1px solid rgba(255,255,255,0.05) !important;
    }
    ` : ``}

    ${ROW_HOVER_HIGHLIGHT ? `
    /* Row-hover sweep — helps the eye trace across CALLS ↔ STRIKE ↔ PUTS */
    [class*="chain_table_left__"]  tbody td,
    [class*="chain_table_right__"] tbody td,
    [class*="chain_table_strikeCell__"] {
      transition: background 80ms ease-out !important;
    }
    [class*="chain_table_left__"]  tbody tr:hover td,
    [class*="chain_table_right__"] tbody tr:hover td {
      background: rgba(120, 160, 220, 0.06) !important;
    }
    [class*="chain_table_strikeCell__"]:hover {
      background: rgba(255, 249, 231, 0.14) !important;
    }
    ` : ``}

    /* === Full-row ITM tint ===
       Sigma applies the chain_table_itm__ class only to some cells (Change, Delta, IV, Mid,
       Bid, Ask), but not to Volume, OI, or the EXT/INT columns the extrinsic script injects.
       The result is a "broken" striped shadow with gaps. This :has() rule extends the tint
       across ALL cells in any row that has at least one ITM cell, giving a clean continuous
       band. background-color (not background shorthand) so it stacks with volume-bar
       background-image. */
    [class*="chain_table_left__"]  tbody tr:has([class*="chain_table_itm__"]) td,
    [class*="chain_table_right__"] tbody tr:has([class*="chain_table_itm__"]) td {
      background-color: rgba(255, 249, 231, 0.22) !important;
    }

    /* === Pinned headers ===
       Sigma's own site navbar (body > header) contains the symbol search (Ctrl+K) and
       navigation — we pin it at top:0 so search stays accessible. The Ford stock-info
       header sits just below it. Both use position:fixed so they work at ALL scroll
       positions, including the very bottom of long chains. z-index 300/200 win over
       Sigma's chains_sticky_header (z:112) which was previously covering us.
       Padding compensates for fixed-position elements being removed from normal flow. */
    ${STICKY_HEADER ? `
    ${STICKY_SIGMA_NAVBAR ? `
    body { padding-top: ${SIGMA_NAVBAR_HEIGHT}px !important; }
    body > header {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      z-index: 300 !important;
      background: rgb(0, 0, 0) !important;
    }` : ``}

    .card-header {
      position: fixed !important;
      top: ${STICKY_SIGMA_NAVBAR ? SIGMA_NAVBAR_HEIGHT : 0}px !important;
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      z-index: 200 !important;
      background: rgb(0, 0, 0) !important;
      box-shadow: 0 1px 6px rgba(0,0,0,0.5) !important;
    }
    .trade.card { padding-top: 67px !important; }

    /* Sigma's chains_sticky_header (expirations row + IV row) defaults to top:0 with
       z-index 112 — would cover our headers. Push it below them. */
    [class*="chains_sticky_header__"] {
      top: ${(STICKY_SIGMA_NAVBAR ? SIGMA_NAVBAR_HEIGHT : 0) + 67}px !important;
      z-index: 99 !important;
      background: rgb(0, 0, 0) !important;
    }

    /* Sigma's chain column-headers strip — push it below the chains_sticky_header
       (~151px tall: 105 expirations + 46 IV). */
    [class*="chain_table_main_container_sticky__"] {
      top: ${(STICKY_SIGMA_NAVBAR ? SIGMA_NAVBAR_HEIGHT : 0) + 67 + 151}px !important;
      z-index: 50 !important;
      background: rgb(0, 0, 0) !important;
    }` : ``}

    /* === Hide the orange underlying-price line ===
       chain_table_center_line__ is the orange line at the current price. The substring
       match below does NOT match chain_table_deviation_center_line__ (sigma boundary lines)
       because "chain_table_center_line__" doesn't appear contiguously in that class name. */
    ${HIDE_PRICE_LINE ? `
    [class*="chain_table_center_line__"] {
      display: none !important;
    }` : ``}

    /* === Hide the underlying-price pill entirely ===
       Different from sigma-boundary pills which still hide-by-default-show-on-hover.
       The price is in the sticky header, no need to duplicate. */
    ${HIDE_PRICE_PILL ? `
    [class*="chain_table_price_center__"] {
      display: none !important;
    }` : ``}
  `;

  // ---------- Style injection ----------
  function applyStyles() {
    document.querySelectorAll('style[data-sigma-compact]').forEach(function (el) { el.remove(); });
    const style = document.createElement('style');
    style.setAttribute('data-sigma-compact', '1');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }
  applyStyles();

  // ---------- Click-to-pin handler ----------
  // Click anywhere in a strike cell that contains a marker → toggle the pin.
  // We use a single delegated listener attached once so it survives re-renders.
  if (!window.__sigmaCompactClickPinAttached) {
    document.addEventListener('click', function (e) {
      const cell = e.target.closest('[class*="chain_table_strikeCell__"]');
      if (!cell) return;
      // Only react if the cell actually has a (non-line) marker pill.
      const hasPill = cell.querySelector('[class*="chain_table_center_info__"] > *:not([class*="_line__"])');
      if (!hasPill) return;
      cell.toggleAttribute('data-marker-pinned');
    });
    window.__sigmaCompactClickPinAttached = true;
  }

  // ---------- Volume / OI bars ----------
  // Subtle horizontal background fill behind Volume and OI cells, scaled to the maximum
  // visible value. Green for calls, red for puts, white for OI. Re-runs whenever the chain
  // re-renders (symbol change, expiration change, price ticks).
  function applyVolumeBars() {
    if (!VOLUME_BARS) return;
    const callsHead = document.querySelector('[class*="chain_table_left__"] table thead');
    const putsHead  = document.querySelector('[class*="chain_table_right__"] table thead');
    const callsBody = document.querySelector('[class*="chain_table_left__"] table tbody');
    const putsBody  = document.querySelector('[class*="chain_table_right__"] table tbody');
    if (!callsHead || !putsHead || !callsBody || !putsBody) return;

    function findColIdx(headEl, text) {
      const ths = headEl.querySelectorAll('tr:last-child th');
      for (let i = 0; i < ths.length; i++) {
        if (ths[i].textContent.trim().toLowerCase() === text.toLowerCase()) return i;
      }
      return -1;
    }
    const parseN = function (t) { return parseInt((t || '').replace(/,/g, '')) || 0; };

    function applyBars(body, colIdx, color, fillFrom, attr) {
      if (colIdx < 0) return;
      const rows = Array.from(body.rows);
      const vals = rows.map(function (r) { return parseN(r.cells[colIdx] && r.cells[colIdx].textContent); });
      const max = Math.max.apply(null, vals.concat([1]));
      rows.forEach(function (r, i) {
        const cell = r.cells[colIdx];
        if (!cell) return;
        // Clear any legacy `background` shorthand from earlier versions (which would clobber
        // Sigma's ITM background-color). We only set background-image so the color from CSS
        // classes (ITM tint, hover tint) shows through underneath the bar.
        if (cell.style.background) cell.style.background = '';
        const v = vals[i];
        if (v > 0) {
          const pct = Math.min(100, (v / max) * 100);
          cell.style.backgroundImage = `linear-gradient(to ${fillFrom}, ${color} ${pct}%, transparent ${pct}%)`;
          cell.setAttribute(attr, '1');
        } else if (cell.hasAttribute(attr)) {
          cell.style.backgroundImage = '';
          cell.removeAttribute(attr);
        }
      });
    }

    // Calls: fill from RIGHT (toward strike column). Puts: fill from LEFT (toward strike).
    applyBars(callsBody, findColIdx(callsHead, 'Volume'), 'rgba(34, 197, 94, 0.18)', 'right', 'data-volbar');
    applyBars(putsBody,  findColIdx(putsHead,  'Volume'), 'rgba(239, 68, 68, 0.18)', 'left',  'data-volbar');
    applyBars(callsBody, findColIdx(callsHead, 'OI'),     'rgba(255, 255, 255, 0.06)', 'right', 'data-oibar');
    applyBars(putsBody,  findColIdx(putsHead,  'OI'),     'rgba(255, 255, 255, 0.06)', 'left',  'data-oibar');
  }

  // Initial run + retries since the chain may not be mounted yet at document-end.
  setTimeout(applyVolumeBars, 500);
  setTimeout(applyVolumeBars, 1500);
  setTimeout(applyVolumeBars, 3000);

  // ---------- Re-inject style if Sigma blows it away ----------
  // Also re-runs volume bars on every DOM mutation (debounced).
  let _volTimer = null;
  function _scheduleVolBars() {
    clearTimeout(_volTimer);
    _volTimer = setTimeout(applyVolumeBars, 250);
  }
  const observer = new MutationObserver(function () {
    if (!document.querySelector('style[data-sigma-compact]')) applyStyles();
    _scheduleVolBars();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
