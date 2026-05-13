// ==UserScript==
// @name         Sigma Trade — Compact Chain Layout
// @namespace    https://github.com/jorgegarcias60/Sigma.trade.mask
// @version      1.11.0
// @description  Compact, tastytrade-styled option-chain layout for Sigma Trade, plus a compact dashboard layout. Trade page: solid dark-blue section banner with sentence-case "Calls" / "Puts" labels, sentence-case column headers with "(Sell)" / "(Buy)" suffixes appended to Bid / Ask, continuous red/green vertical bar on the strike-column edges (red above ATM, green below), subtle orange ATM-strike row highlight that extends across all three tables, full-row ITM tint on calls/puts sides, uniform 24px rows, SF Pro / Inter typography, volume + OI magnitude bars, cross-section row hover via box-shadow-inset, pinned Sigma navbar + stock-info header (Ctrl+K always reachable), hidden orange price line/pill, sigma-boundary pills hide-by-default-show-on-hover. Dashboard page: compact Position + Orders tables (~50px rows down from ~79px) with expandable rows preserved. Sigma site navbar pinned site-wide; the trade-only stock-info header pin no longer leaks onto the dashboard (was hiding Market Performance + Watch List).
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
  // Section banner: solid dark blue (tastytrade-style) instead of heavy green/red gradient.
  // Section labels become sentence-case ("Calls" / "Puts") without aggressive letter-spacing.
  const SOFT_SECTION_TINT   = true;
  // The orange horizontal line at the underlying price (chain_table_center_line__) — hide it
  // since the price is already shown in the (now sticky) header. Sigma-boundary lines, which
  // are a different class, are unaffected.
  const HIDE_PRICE_LINE     = true;
  // The "current underlying price" pill (chain_table_price_center__) — hide it entirely.
  // Same reason as the line above: price lives in the sticky header now. Sigma-boundary pills
  // (1σ, 2σ, 3σ) still hide-by-default-show-on-hover via the rules below.
  const HIDE_PRICE_PILL     = true;

  // ---- Tastytrade-style additions (v1.8+) ----
  // Master toggle for the v1.8 tastytrade-look-and-feel pass. Sentence-case headers, solid
  // dark-blue section banner, continuous red/green strike-edge bar (red above ATM / green
  // below ATM), and a subtle orange highlight on the ATM strike row. Flip to false to revert
  // to v1.7 styling (uppercase headers, soft green/red banner gradient, no ATM highlight).
  const TASTYTRADE_STYLE    = true;
  // Section banner background — solid dark blue, like tastytrade's expiration row.
  const SECTION_BANNER_BG   = 'rgba(28, 49, 77, 1)';
  // Color of the continuous bar on the strike-column edges. Above-ATM = red, below-ATM = green.
  // Driven by JS: the script picks the ATM strike (closest to the underlying price) and tags
  // each strike row with data-side="above" or data-side="below" so the CSS bar colors apply.
  // v1.10.4: softened from 3px / 0.75 opacity to 2px / 0.4 opacity for a more modern, less
  // dominant accent. The bar is still clearly visible as an above-vs-below marker but no
  // longer reads as a bold red/green slab next to the strike numbers.
  const STRIKE_EDGE_BAR_WIDTH_PX = 2;
  const STRIKE_EDGE_ABOVE_COLOR  = 'rgba(239, 68, 68, 0.40)';
  const STRIKE_EDGE_BELOW_COLOR  = 'rgba(34, 197, 94, 0.40)';
  // ATM strike row: subtle orange horizontal band. Driven by the same JS pass.
  const ATM_HIGHLIGHT_COLOR = 'rgba(245, 158, 11, 0.16)';

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

    /* === Modern styling (v1.7) — adjusted by TASTYTRADE_STYLE in v1.8 === */
    ${MODERN_TYPOGRAPHY ? `
    /* System sans-serif stack — matches tastytrade / moomoo look */
    [class*="chain_table_left__"],
    [class*="chain_table_right__"],
    [class*="chain_table_strike__"] {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Helvetica Neue", system-ui, sans-serif !important;
      font-feature-settings: "tnum" 1 !important;
    }
    /* Column headers: muted, ${TASTYTRADE_STYLE ? 'sentence case' : 'uppercase, letter-spaced'} */
    [class*="chain_table_left__"]  thead th,
    [class*="chain_table_right__"] thead th,
    [class*="chain_table_strike__"] thead th {
      color: rgba(255,255,255,0.45) !important;
      text-transform: ${TASTYTRADE_STYLE ? 'none' : 'uppercase'} !important;
      font-size: ${TASTYTRADE_STYLE ? '11' : '9.5'}px !important;
      letter-spacing: ${TASTYTRADE_STYLE ? '0.1' : '0.9'}px !important;
      font-weight: ${TASTYTRADE_STYLE ? '400' : '500'} !important;
      padding: 6px 8px !important;
    }
    /* Section banners (Calls / Puts / Strike row) */
    [class*="chain_table_left__"]  thead tr:first-child th,
    [class*="chain_table_right__"] thead tr:first-child th,
    [class*="chain_table_strike__"] thead tr:first-child th {
      font-weight: ${TASTYTRADE_STYLE ? '500' : '600'} !important;
      text-transform: ${TASTYTRADE_STYLE ? 'none' : 'uppercase'} !important;
      letter-spacing: ${TASTYTRADE_STYLE ? '0.2' : '2.5'}px !important;
      font-size: ${TASTYTRADE_STYLE ? '11' : '10'}px !important;
      color: ${TASTYTRADE_STYLE ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.7)'} !important;
      padding: 6px 10px !important;
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

    ${SOFT_SECTION_TINT ? (TASTYTRADE_STYLE ? `
    /* Tastytrade-style banner: solid dark blue across all three sections, no gradient */
    [class*="chain_table_left__"]  thead tr:first-child th,
    [class*="chain_table_right__"] thead tr:first-child th,
    [class*="chain_table_strike__"] thead tr:first-child th {
      background-image: none !important;
      background-color: ${SECTION_BANNER_BG} !important;
    }
    /* Strike column body: no yellow tint (tastytrade leaves it black) */
    [class*="chain_table_strikeCell__"] {
      background: transparent !important;
      border-left: 1px solid rgba(255,255,255,0.04) !important;
      border-right: 1px solid rgba(255,255,255,0.04) !important;
    }
    ` : `
    /* v1.7 soft tint: green/red gradient fading toward center */
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
    `) : ``}

    ${TASTYTRADE_STYLE ? `
    /* === Strike-column edge bar (tastytrade-style) ===
       Continuous vertical strip on the left+right edges of each strike cell. Red above the
       ATM strike, green below — meeting at the ATM row. Driven by data-side="above|below"
       attributes set by JS (see applyAtmHighlight). The strike-cell already has position:
       relative from the base CSS, so absolutely-positioned pseudo elements anchor to it. */
    [class*="chain_table_strikeCell__"]::before,
    [class*="chain_table_strikeCell__"]::after {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      bottom: 0 !important;
      width: ${STRIKE_EDGE_BAR_WIDTH_PX}px !important;
      background: transparent !important;
      pointer-events: none !important;
      z-index: 2 !important;
    }
    [class*="chain_table_strikeCell__"]::before { left: 0 !important; }
    [class*="chain_table_strikeCell__"]::after  { right: 0 !important; }
    [class*="chain_table_strikeCell__"][data-side="above"]::before,
    [class*="chain_table_strikeCell__"][data-side="above"]::after {
      background: ${STRIKE_EDGE_ABOVE_COLOR} !important;
    }
    [class*="chain_table_strikeCell__"][data-side="below"]::before,
    [class*="chain_table_strikeCell__"][data-side="below"]::after {
      background: ${STRIKE_EDGE_BELOW_COLOR} !important;
    }
    /* ATM row: subtle orange band that extends across ALL three tables.
       We tag the strike cell with data-atm, and tag the corresponding TR in calls + puts
       bodies (by row index) so the band is continuous across CALLS | STRIKE | PUTS. */
    [class*="chain_table_strikeCell__"][data-atm] {
      background-color: ${ATM_HIGHLIGHT_COLOR} !important;
    }
    [class*="chain_table_left__"]  tbody tr[data-atm] td,
    [class*="chain_table_right__"] tbody tr[data-atm] td {
      background-color: ${ATM_HIGHLIGHT_COLOR} !important;
    }
    /* Make Sigma's own per-row ruler tick less prominent — the edge bar replaces it. */
    [class*="chain_table_strike_ruler__"] { display: none !important; }
    /* Sigma's expected-move ribbon (chain_table_expected_move__) draws a vertical
       block of pure rgb(255,0,0) / rgb(0,255,0) inside the strike column, marking the
       expected-move range (the +/- 1 std-dev band visible at top-right as "Expected Move
       (± X)"). At full opacity it overwhelms the chain visually. Fade to 0.25 so it stays
       informational without dominating. Not in the v1.7 handoff doc — added by Sigma later. */
    [class*="chain_table_expected_move__"] { opacity: 0.25 !important; }

    /* === Privacy mode (v1.11.0) ===
       When body[data-privacy="1"], mask the user's name + account ID + portfolio value in
       the navbar profile area. -webkit-text-security is Chrome-specific (Sigma is web-only,
       Chrome-dominant) and replaces each character with a disc — keeps the box width so the
       UI doesn't reflow, but the actual characters aren't readable.
       The "Value" LABEL (the <strong>) inside header_value__ stays visible — we only mask
       the inner <span> that holds the dollar amount. */
    body[data-privacy="1"] [class*="header_accountInfo__"] > strong,
    body[data-privacy="1"] [class*="header_accountInfo__"] > span,
    body[data-privacy="1"] [class*="header_value__"] > span {
      -webkit-text-security: disc !important;
      text-security: disc !important;
    }
    /* Eye-icon toggle button — slotted just before the profile dropdown */
    .sigma-privacy-toggle {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 32px !important;
      height: 32px !important;
      margin-right: 8px !important;
      border: 1px solid rgba(255,255,255,0.15) !important;
      border-radius: 6px !important;
      background: transparent !important;
      color: rgba(255,255,255,0.7) !important;
      cursor: pointer !important;
      padding: 0 !important;
      transition: background 80ms ease-out, color 80ms ease-out !important;
    }
    .sigma-privacy-toggle:hover {
      background: rgba(255,255,255,0.08) !important;
      color: rgba(255,255,255,0.95) !important;
    }
    /* Privacy ON state: amber accent so the user knows it's active */
    body[data-privacy="1"] .sigma-privacy-toggle {
      background: rgba(245, 158, 11, 0.15) !important;
      color: rgba(245, 158, 11, 1) !important;
      border-color: rgba(245, 158, 11, 0.4) !important;
    }
    /* Strike cell bottom border: Sigma uses bright gray rgb(164,161,161) which makes the
       strike column look heavily ruled. Match the 5%-white separator used on calls/puts
       cells so all three sections have the same subtle row division. */
    [class*="chain_table_strikeCell__"] {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
    }
    /* Icon column (chain_table_tagCol__) — leftmost on calls, rightmost on puts. Sigma uses
       this column for position badges (the "-2" red pill etc.). The :has() ITM rule below
       tints all td in any ITM row cream, including this column, which produces a visible
       cream strip at the chain edges that looks bordered. We also drop the 1px row-bottom
       border on tagCol so no horizontal separator shows there.
       SPECIFICITY: the :has() rule is [class][class] tbody tr:has([class]) td — that is
       (0,3,3). A plain [class*="chain_table_tagCol__"] selector is (0,1,0) and loses.
       We chain [chain_table_section__] (also on the calls/puts wrapper) plus a td element
       selector to reach (0,3,3) and place this rule late enough to win on tie. */
    [class*="chain_table_left__"][class*="chain_table_section__"]  tbody tr td[class*="chain_table_tagCol__"],
    [class*="chain_table_right__"][class*="chain_table_section__"] tbody tr td[class*="chain_table_tagCol__"] {
      background-color: transparent !important;
      background-image: none !important;
      border: 0 !important;
    }
    /* Bid (Sell) / Ask (Buy) header suffix — the addBidAskLabels() JS pass appends a span
       inside Bid/Ask THs. Style it as a muted parenthetical, smaller than the main label. */
    [data-bidask-suffix] {
      opacity: 0.55 !important;
      font-size: 0.85em !important;
      margin-left: 2px !important;
      font-weight: 400 !important;
      letter-spacing: 0 !important;
    }
    ` : ``}

    /* === Full-row ITM tint ===
       Sigma applies the chain_table_itm__ class only to some cells (Change, Delta, IV, Mid,
       Bid, Ask), but not to Volume, OI, the icon column, or the EXT/INT columns injected by
       sigma-extrinsic.user.js. The :has() rule extends the tint across every cell in any row
       that has at least one ITM cell, giving a clean continuous band within each side.
       The strike column is deliberately left transparent — matches tastytrade, and tinting it
       to follow either side would create a visible vertical seam at the strike-column edge
       (calls ITM + puts OTM rows would show cream-strike next to black puts cells).
       background-color (not the background shorthand) stacks with volume-bar background-image
       and with the box-shadow-inset row-hover below. */
    [class*="chain_table_left__"]  tbody tr:has([class*="chain_table_itm__"]) td,
    [class*="chain_table_right__"] tbody tr:has([class*="chain_table_itm__"]) td {
      background-color: rgba(255, 249, 231, 0.22) !important;
    }

    ${ROW_HOVER_HIGHLIGHT ? `
    /* Row hover — helps the eye trace across CALLS ↔ STRIKE ↔ PUTS.
       Implemented two ways:
         1) Pure-CSS :hover (per-side only). Uses inset box-shadow rather than background-color
            so it stacks ABOVE the ITM tint — without this the :has() rule would suppress hover
            on every ITM row (higher specificity).
         2) JS-driven [data-hover] (cross-section). The calls/strike/puts are three separate
            tables; CSS can't link a hover in one to highlights in the others. The mouseover
            handler in applyCrossSectionHover() tags the same-index row in all three tables
            with data-hover so the entire horizontal "strike row" lights up together — same
            behavior tastytrade has on their chain. The CSS below applies to both. */
    [class*="chain_table_left__"]  tbody tr:hover td,
    [class*="chain_table_right__"] tbody tr:hover td,
    [class*="chain_table_left__"]  tbody tr[data-hover] td,
    [class*="chain_table_right__"] tbody tr[data-hover] td {
      box-shadow: inset 0 0 0 9999px rgba(120, 160, 220, 0.18) !important;
    }
    [class*="chain_table_strikeCell__"]:hover,
    [class*="chain_table_strikeCell__"][data-hover] {
      box-shadow: inset 0 0 0 9999px rgba(255, 249, 231, 0.16) !important;
    }
    /* Stronger hover on the actively-hovered Bid + Ask cells (the click targets for
       order entry). Calls layout: tagCol | Change | Delta | EXT | INT | IV | Volume | OI |
       Mid | Bid | Ask  =>  Bid at nth-child(10), Ask at nth-child(11). Puts is mirrored
       with the tagCol at the END  =>  Bid at nth-child(1), Ask at nth-child(2).
       Uses :hover (CSS-native) rather than [data-hover] (JS-driven cross-section) so the
       extra highlight ONLY appears on the cell the cursor is literally on — not on the
       mirrored cell on the other side of the chain.
       Source order places this AFTER the row-hover rule; with equal specificity, later
       wins, so the brighter tint replaces the row-hover tint on the active cell. */
    [class*="chain_table_left__"]  tbody td:nth-child(10):hover,
    [class*="chain_table_left__"]  tbody td:nth-child(11):hover,
    [class*="chain_table_right__"] tbody td:nth-child(1):hover,
    [class*="chain_table_right__"] tbody td:nth-child(2):hover {
      box-shadow: inset 0 0 0 9999px rgba(160, 200, 255, 0.45) !important;
    }
    ` : ``}

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

    /* Pin ONLY the trade page's stock-info header. The dashboard also uses .card-header
       (with dashboard_Dashboard__header__ZZ7hr) for its totals row, but pinning that one
       would cover the Market Performance + Watch List sections that render in normal flow
       right below it. Scoping with .trade.card > .card-header keeps the chain page pinned
       and leaves every other page (dashboard, market, terminal, journal, ...) alone. */
    .trade.card > .card-header {
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

    /* === Bid/Ask/etc. click-target expansion (v1.10.2) ===
       Sigma puts the click handler on the inner <span>, not the <td>. With center-aligned
       text the span only covers about 48% of the cell width — clicking on the cell's left
       or right padding (8px each side) hits the TD, which has no click handler, and Sigma's
       order-staging never fires. Felt as "unresponsive bid/ask clicks".
       Fix: stretch every direct-child span of body cells to fill the TD (100% × 98% coverage).
       Negative horizontal margin extends the span over the TD's padding; matching padding
       inside the span preserves the original text position. cursor: pointer makes the click
       affordance visible. */
    [class*="chain_table_left__"]  tbody td > span,
    [class*="chain_table_right__"] tbody td > span {
      display: block !important;
      box-sizing: border-box !important;
      height: 100% !important;
      line-height: inherit !important;
      margin: 0 -8px !important;
      padding: 0 8px !important;
      width: calc(100% + 16px) !important;
      cursor: pointer !important;
    }

    /* === Render performance hints (v1.10.0; v1.10.1 dropped a broken rule) ===
       content-visibility: auto tells the browser "skip layout + paint for this element while
       it's far from the viewport". With contain-intrinsic-size reserving the expected row
       height, the scrollbar still measures correctly and rows pop in as they approach view.
       Net: faster initial chain mount, smoother scroll on long chains (SPX "All strikes")
       and long position lists.
       NOTE — v1.10.0 had "contain: layout style" on ".trade.card". That created a new
       containing block for the FIXED-positioned ".card-header" inside it (per CSS Containment
       spec), so the stock-info bar started pinning relative to the card instead of the
       viewport — visually overlapping the tabs row below it. Verified live (top jumped from
       66px to 147px when the rule was applied). Removed in v1.10.1. The content-visibility
       rules below are safe: chain rows don't contain the fixed header. */
    [class*="chain_table_left__"]  tbody tr,
    [class*="chain_table_right__"] tbody tr,
    [class*="chain_table_strike__"] tbody tr {
      content-visibility: auto !important;
      contain-intrinsic-size: 0 ${ROW_HEIGHT}px !important;
    }
    /* Dashboard Position + Orders tables: same trick, with the ~50px row height we use. */
    [class*="table-list_table__"] tbody tr {
      content-visibility: auto !important;
      contain-intrinsic-size: 0 50px !important;
    }

    /* === Compact dashboard tables (v1.9.1) ===
       The dashboard's Position and Orders tables (class table-list_table__) default to ~79px
       row height with 8px vertical padding on every td. With 33 open positions that's a lot
       of vertical real estate. This compresses to ~50px uniform rows by:
       1) Shrinking td padding 8px -> 2px and font-size 15.4px -> 12px / line-height 1.5 -> 1.2
       2) Flattening multi-line <p> content (e.g. the Quantity cell renders "Stock : 1" and
          "Contract: 4" as two stacked <p>s — we set display:inline so they collapse onto one
          line, separated by a non-breaking space via p + p::before content).
       Symbol cell (logo + ticker) is untouched — its content is structured as flex/grid by
       Sigma and a global flex/inline-block rule on .table-data_td__ children would invert it.
       The <p>-only rule is narrow enough to leave it alone.
       Expandable rows: each Position row starts with a chevron (.table-data_expand_arrow__
       in the .table-data_close__ state). Clicking expands the position into its legs —
       each leg is rendered as a separate sibling tr appended after the parent. Our rule
       only touches .table-data_td__ padding/line-height + <p> display, so expand still works
       and the leg rows render compact under the same rule. */
    [class*="table-list_table__"] tbody [class*="table-data_td__"] {
      padding: 2px 10px !important;
      font-size: 12px !important;
      line-height: 1.2 !important;
    }
    [class*="table-list_table__"] tbody [class*="table-data_td__"] p {
      margin: 0 !important;
      padding: 0 !important;
      line-height: 1.2 !important;
      display: inline !important;
    }
    /* Visual gap between two consecutive inline <p> elements in the same cell. */
    [class*="table-list_table__"] tbody [class*="table-data_td__"] p + p::before {
      content: '\\00a0\\00a0' !important;
    }
    [class*="table-list_table__"] thead th,
    [class*="table-header_table_header__"] {
      padding: 4px 10px !important;
      font-size: 10.5px !important;
      letter-spacing: 0.3px !important;
      line-height: 1.2 !important;
    }

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

  // ---------- ATM highlight + strike-edge bar (tastytrade-style, v1.8) ----------
  // Tags every strike cell with data-side="above|below" relative to the underlying price, and
  // the ATM cell (closest strike to spot) with data-atm. The corresponding TR in calls + puts
  // bodies (matched by row index) is also tagged data-atm so the orange ATM band extends
  // continuously across CALLS | STRIKE | PUTS. CSS in the style block does the actual coloring
  // via [data-side] / [data-atm] selectors and ::before/::after pseudo elements.
  function applyAtmHighlight() {
    if (!TASTYTRADE_STYLE) return;
    const strikeBody = document.querySelector('[class*="chain_table_strike__"] table tbody');
    const callsBody  = document.querySelector('[class*="chain_table_left__"]  table tbody');
    const putsBody   = document.querySelector('[class*="chain_table_right__"] table tbody');
    if (!strikeBody) return;

    // Underlying price — same selector as sigma-extrinsic.user.js. Sigma renders the price in
    // a couple of places; this picks the chain-side small price element, not the big main one.
    const priceEl = document.querySelector('[class*="trade_price__"]:not([class*="trade_priceMain__"])');
    const underlying = priceEl ? parseFloat((priceEl.textContent || '').replace(/[^0-9.\-]/g, '')) : NaN;
    if (!isFinite(underlying)) return;

    // Parse each strike. Same defensive logic as the extrinsic script: innerText split on
    // whitespace, take the last clean numeric token. Avoids the "-2 + 27.5 = -227.5" trap
    // where a position badge concatenates with the strike in textContent.
    const rows = Array.from(strikeBody.rows);
    const strikes = rows.map(function (r) {
      const cell = r.cells[0];
      if (!cell) return NaN;
      const tokens = (cell.innerText || '').split(/\s+/).filter(Boolean);
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (/^\d+(\.\d+)?$/.test(tokens[i])) return parseFloat(tokens[i]);
      }
      return NaN;
    });

    // ATM = strike with the smallest |strike - underlying|. Ties resolve to the first match
    // (lower strike) which matches typical broker convention.
    let atmIdx = -1;
    let atmDist = Infinity;
    for (let i = 0; i < strikes.length; i++) {
      if (!isFinite(strikes[i])) continue;
      const d = Math.abs(strikes[i] - underlying);
      if (d < atmDist) { atmDist = d; atmIdx = i; }
    }
    if (atmIdx === -1) return;

    const atmStrike = strikes[atmIdx];
    rows.forEach(function (r, i) {
      const cell = r.cells[0];
      if (!cell) return;
      const s = strikes[i];
      if (!isFinite(s)) {
        cell.removeAttribute('data-side');
        cell.removeAttribute('data-atm');
        return;
      }
      // "above" = visually above the ATM row in the table = lower strike numbers (rendered
      // at the top). "below" = visually below the ATM row = higher strike numbers.
      cell.setAttribute('data-side', s < atmStrike ? 'above' : 'below');
      if (i === atmIdx) cell.setAttribute('data-atm', '1');
      else cell.removeAttribute('data-atm');
    });

    function tagBodyRow(body, idx) {
      if (!body) return;
      Array.from(body.rows).forEach(function (r, i) {
        if (i === idx) r.setAttribute('data-atm', '1');
        else r.removeAttribute('data-atm');
      });
    }
    tagBodyRow(callsBody, atmIdx);
    tagBodyRow(putsBody,  atmIdx);
  }

  // ---------- Privacy toggle (v1.11.0) ----------
  // Adds a small eye-icon button to the navbar (just before the profile dropdown). Clicking
  // toggles a body[data-privacy="1"] flag persisted in localStorage. The CSS above uses
  // -webkit-text-security: disc to mask the name, account ID, and portfolio value when on.
  // Sigma re-renders the navbar on various events; this function runs from the same observer
  // tick as the other passes and is idempotent — re-injects the button if Sigma wiped it,
  // and re-applies the body attribute from localStorage in case Sigma toggled it.
  const PRIVACY_LS_KEY = 'sigma-privacy-mode';
  function eyeOpenSVG() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  function eyeClosedSVG() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
  }
  function setPrivacyIcon(btn) {
    const on = document.body.getAttribute('data-privacy') === '1';
    btn.innerHTML = on ? eyeClosedSVG() : eyeOpenSVG();
    btn.setAttribute('title', on ? 'Privacy mode ON — click to show values' : 'Privacy mode OFF — click to mask name / account ID / value');
  }
  function applyPrivacyFromStorage() {
    const enabled = localStorage.getItem(PRIVACY_LS_KEY) === '1';
    if (enabled) document.body.setAttribute('data-privacy', '1');
    else document.body.removeAttribute('data-privacy');
  }
  function injectPrivacyToggle() {
    const profileBtn = document.querySelector('[class*="header_loggedIn__"]');
    if (!profileBtn || !profileBtn.parentElement) return;
    // Idempotent: bail if our button is already in place
    if (profileBtn.parentElement.querySelector('.sigma-privacy-toggle')) {
      // Still re-sync icon in case Sigma toggled body attribute
      const existing = profileBtn.parentElement.querySelector('.sigma-privacy-toggle');
      setPrivacyIcon(existing);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'sigma-privacy-toggle';
    btn.setAttribute('aria-label', 'Toggle privacy mode');
    btn.type = 'button';
    setPrivacyIcon(btn);
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const on = document.body.getAttribute('data-privacy') === '1';
      if (on) {
        document.body.removeAttribute('data-privacy');
        localStorage.setItem(PRIVACY_LS_KEY, '0');
      } else {
        document.body.setAttribute('data-privacy', '1');
        localStorage.setItem(PRIVACY_LS_KEY, '1');
      }
      setPrivacyIcon(btn);
    });
    profileBtn.parentElement.insertBefore(btn, profileBtn);
  }

  // ---------- Bid (Sell) / Ask (Buy) header labels (tastytrade-style, v1.8.2) ----------
  // Sigma owns the header text and writes just "Bid" / "Ask". Tastytrade shows "Bid (Sell)"
  // and "Ask (Buy)" to disambiguate the trader's perspective. We append a span inside the
  // existing TH so Sigma's text stays intact (no risk of breaking sort/click handlers).
  // Idempotent — each TH gets a single child with data-bidask-suffix and we skip if present.
  function addBidAskLabels() {
    if (!TASTYTRADE_STYLE) return;
    const heads = [].concat(
      Array.from(document.querySelectorAll('[class*="chain_table_left__"]  table thead tr:last-child th')),
      Array.from(document.querySelectorAll('[class*="chain_table_right__"] table thead tr:last-child th'))
    );
    heads.forEach(function (th) {
      if (th.querySelector('[data-bidask-suffix]')) return;
      // The TH may contain extra elements (sort arrows). Look at the last word of textContent
      // — that's "Bid" or "Ask" for those columns. Avoids matching e.g. a hidden tooltip label.
      const txt = (th.textContent || '').trim();
      const lastWord = (txt.split(/\s+/).pop() || '').replace(/[^A-Za-z]/g, '');
      if (lastWord !== 'Bid' && lastWord !== 'Ask') return;
      const span = document.createElement('span');
      span.setAttribute('data-bidask-suffix', '1');
      span.textContent = ' ' + (lastWord === 'Bid' ? '(Sell)' : '(Buy)');
      th.appendChild(span);
    });
  }

  // ---------- Cross-section row hover (tastytrade-style, v1.8.1) ----------
  // Sigma's chain is three SEPARATE tables (calls / strike / puts). A pure-CSS :hover only
  // highlights cells within the same table. To get tastytrade-style cross-section row tracking
  // (hovering anywhere on a strike-row lights up all three sections together), we attach a
  // single delegated mouseover listener that tags the same-index row in all three bodies with
  // data-hover. The CSS above ([data-hover] / :hover combined) renders the inset shadow.
  // Idempotent: guarded by window.__sigmaCrossHoverAttached so re-injection doesn't double up.
  function applyCrossSectionHover() {
    if (!ROW_HOVER_HIGHLIGHT) return;
    if (window.__sigmaCrossHoverAttached) return;
    function bodies() {
      return {
        calls:  document.querySelector('[class*="chain_table_left__"]  table tbody'),
        strike: document.querySelector('[class*="chain_table_strike__"] table tbody'),
        puts:   document.querySelector('[class*="chain_table_right__"] table tbody')
      };
    }
    function clearAll() {
      document.querySelectorAll('[data-hover]').forEach(function (el) { el.removeAttribute('data-hover'); });
    }
    function findRowIdx(target) {
      const tr = target && target.closest && target.closest('tr');
      if (!tr) return -1;
      const body = tr.parentElement;
      const b = bodies();
      if (body !== b.calls && body !== b.strike && body !== b.puts) return -1;
      return Array.from(body.rows).indexOf(tr);
    }
    document.addEventListener('mouseover', function (e) {
      const idx = findRowIdx(e.target);
      if (idx < 0) { clearAll(); return; }
      clearAll();
      const b = bodies();
      if (b.calls  && b.calls.rows[idx])  b.calls.rows[idx].setAttribute('data-hover', '1');
      if (b.puts   && b.puts.rows[idx])   b.puts.rows[idx].setAttribute('data-hover', '1');
      if (b.strike && b.strike.rows[idx]) {
        const td = b.strike.rows[idx].cells[0];
        if (td) td.setAttribute('data-hover', '1');
      }
    });
    document.addEventListener('mouseout', function (e) {
      // If the cursor leaves the chain entirely (relatedTarget isn't inside a chain table), clear.
      const rt = e.relatedTarget;
      const stillInChain = rt && rt.closest && rt.closest('[class*="chain_table_"]');
      if (!stillInChain) clearAll();
    });
    window.__sigmaCrossHoverAttached = true;
  }

  // Initial run + retries since the chain may not be mounted yet at document-end.
  setTimeout(function () { applyVolumeBars(); applyAtmHighlight(); applyCrossSectionHover(); addBidAskLabels(); applyPrivacyFromStorage(); injectPrivacyToggle(); },500);
  setTimeout(function () { applyVolumeBars(); applyAtmHighlight(); applyCrossSectionHover(); addBidAskLabels(); applyPrivacyFromStorage(); injectPrivacyToggle(); },1500);
  setTimeout(function () { applyVolumeBars(); applyAtmHighlight(); applyCrossSectionHover(); addBidAskLabels(); applyPrivacyFromStorage(); injectPrivacyToggle(); },3000);

  // ---------- Re-inject style if Sigma blows it away ----------
  // Also re-runs volume bars + ATM highlight + cross-section hover attach on every DOM mutation
  // (debounced). The hover attach is idempotent so re-calling is cheap.
  let _bgTimer = null;
  function _scheduleBackgroundPasses() {
    clearTimeout(_bgTimer);
    _bgTimer = setTimeout(function () {
      applyVolumeBars();
      applyAtmHighlight();
      applyCrossSectionHover();
      addBidAskLabels();
      applyPrivacyFromStorage();
      injectPrivacyToggle();
    }, 250);
  }
  const observer = new MutationObserver(function () {
    if (!document.querySelector('style[data-sigma-compact]')) applyStyles();
    _scheduleBackgroundPasses();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
