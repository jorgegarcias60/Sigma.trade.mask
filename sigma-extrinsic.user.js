// ==UserScript==
// @name         Sigma Trade — Extrinsic & Intrinsic Columns
// @namespace    https://github.com/jorgegarcias60/Sigma.trade.mask
// @version      1.3.3
// @description  Adds EXT (extrinsic) and INT (intrinsic) columns to the Sigma Trade option chain, mirrored around the strike. Calls: ... | Delta | EXT | INT | IV | ...   Puts: ... | IV | INT | EXT | Delta | ... Updates live as prices, symbols, or expirations change.
// @author       jorgegarcias60
// @homepageURL  https://github.com/jorgegarcias60/Sigma.trade.mask
// @supportURL   https://github.com/jorgegarcias60/Sigma.trade.mask/issues
// @updateURL    https://raw.githubusercontent.com/jorgegarcias60/Sigma.trade.mask/main/sigma-extrinsic.user.js
// @downloadURL  https://raw.githubusercontent.com/jorgegarcias60/Sigma.trade.mask/main/sigma-extrinsic.user.js
// @match        https://web.sigma.trade/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Config ----------
  const EXT_POS_COLOR = '#4a90e2';   // positive extrinsic
  const EXT_NEG_COLOR = '#e74c3c';   // negative extrinsic (mispricing / stale quote)
  const INT_COLOR     = '#f39c12';   // intrinsic (when > 0)
  const NEUTRAL_COLOR = '#888';
  const DEBOUNCE_MS   = 200;

  // ---------- Helpers ----------
  function parseNumber(text) {
    if (text == null) return NaN;
    const n = parseFloat(String(text).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? NaN : n;
  }

  // Strike cell can be:
  //   - a clean numeric ("7", "10.5", "739")
  //   - a marker row with previous-close + sigma badges
  //   - a row with a dividend/event badge concatenated to the strike (e.g. "2" badge + "7.5" strike
  //     where cell.textContent gives "27.5" with NO separator — a deceptively-clean false positive)
  // We always use innerText (which respects visual layout / block boundaries between the badge and
  // the strike), split on whitespace, and take the LAST clean numeric token.
  function parseStrike(cell) {
    if (!cell) return NaN;
    const lines = (cell.innerText || '').split(/\s+/).filter(Boolean);
    if (lines.length === 1 && /^\d+(\.\d+)?$/.test(lines[0])) return parseFloat(lines[0]);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/^\d+(\.\d+)?$/.test(lines[i])) return parseFloat(lines[i]);
    }
    return NaN;
  }

  function findColIdxByText(headerTable, label) {
    const row = headerTable && headerTable.tHead && headerTable.tHead.rows[1];
    if (!row) return -1;
    for (let i = 0; i < row.cells.length; i++) {
      if (row.cells[i].textContent.trim() === label) return i;
    }
    return -1;
  }

  // PERF (v1.3.3): cache the Mid column index per header element. The Mid column's position is
  // stable between Sigma rebuilds, but updateValues() ran findColIdxByText('Mid') — a full
  // header scan — on every debounce tick. Keyed on the header element via WeakMap, so a rebuilt
  // header (a new element) misses the cache and re-scans automatically. The cheap single-cell
  // validation re-scans if anything shifted the column under a preserved header element.
  const _midIdxCache = new WeakMap();
  function cachedMidIdx(headerTbl) {
    const row = headerTbl && headerTbl.tHead && headerTbl.tHead.rows[1];
    if (!row) return -1;
    const cached = _midIdxCache.get(headerTbl);
    if (cached != null && row.cells[cached] && row.cells[cached].textContent.trim() === 'Mid') {
      return cached;
    }
    const idx = findColIdxByText(headerTbl, 'Mid');
    _midIdxCache.set(headerTbl, idx);
    return idx;
  }

  function getHeaderAndBody(sections) {
    const tables = [];
    sections.forEach(function (s) { s.querySelectorAll('table').forEach(function (t) { tables.push(t); }); });
    return {
      header: tables.find(function (t) { return t.tHead && t.tBodies.length === 0; }),
      body:   tables.find(function (t) { return t.tBodies.length > 0 && !t.tHead; })
    };
  }

  function getUnderlyingPrice() {
    const el = document.querySelector('[class*="trade_price__"]:not([class*="trade_priceMain__"])');
    return el ? parseNumber(el.textContent) : NaN;
  }

  function getCurrentHeaderPos(headerTbl, marker) {
    const th = headerTbl.querySelector('th[data-injected="header"][data-marker="' + marker + '"]');
    if (!th) return -1;
    return Array.from(headerTbl.tHead.rows[1].cells).indexOf(th);
  }

  // ---------- Idempotent insertion primitives ----------
  // Each piece checks itself independently so that if Sigma rebuilds part of the chain
  // (e.g. body rebuilt on expiration change while header is preserved) we still fill in
  // the missing pieces without touching what's already correct.

  function ensureHeaderTH(headerTbl, label, marker, position, headerColor) {
    if (headerTbl.querySelector('th[data-injected="header"][data-marker="' + marker + '"]')) return;
    const labelRow = headerTbl.tHead.rows[1];
    if (!labelRow) return;
    const th = document.createElement('th');
    th.textContent = label;
    th.style.color = headerColor;
    th.style.fontWeight = '600';
    th.setAttribute('data-injected', 'header');
    th.setAttribute('data-marker', marker);
    labelRow.insertBefore(th, labelRow.cells[position] || null);

    // Bump section-title colspan only when we actually insert a new TH.
    const titleCell = headerTbl.tHead.rows[0] && headerTbl.tHead.rows[0].cells[0];
    if (titleCell && titleCell.colSpan) {
      const bumped = parseInt(titleCell.getAttribute('data-ext-bumped') || '0', 10);
      titleCell.colSpan += 1;
      titleCell.setAttribute('data-ext-bumped', String(bumped + 1));
    }
  }

  function ensureColgroupCol(table, marker, position) {
    if (!table) return;
    const cg = table.querySelector('colgroup');
    if (!cg) return;
    if (cg.querySelector('col[data-injected="col"][data-marker="' + marker + '"]')) return;
    const adj = cg.children[Math.max(0, position - 1)] || cg.children[0];
    const col = adj ? adj.cloneNode(false) : document.createElement('col');
    col.setAttribute('data-injected', 'col');
    col.setAttribute('data-marker', marker);
    cg.insertBefore(col, cg.children[position] || null);
  }

  function ensureBodyCells(bodyTbl, marker, position) {
    if (!bodyTbl || !bodyTbl.tBodies[0]) return;
    Array.from(bodyTbl.tBodies[0].rows).forEach(function (row) {
      if (row.querySelector('td[data-injected="cell"][data-marker="' + marker + '"]')) return;
      const td = document.createElement('td');
      td.textContent = '-';
      td.style.color = NEUTRAL_COLOR;
      td.style.fontWeight = '500';
      td.setAttribute('data-injected', 'cell');
      td.setAttribute('data-marker', marker);
      row.insertBefore(td, row.cells[position] || null);
    });
  }

  function injectColumn(headerTbl, bodyTbl, label, marker, initialPosition, headerColor) {
    ensureHeaderTH(headerTbl, label, marker, initialPosition, headerColor);
    // After potentially inserting the TH, anchor the rest to its actual current position.
    const pos = getCurrentHeaderPos(headerTbl, marker);
    if (pos === -1) return;
    ensureColgroupCol(headerTbl, marker, pos);
    ensureColgroupCol(bodyTbl,   marker, pos);
    ensureBodyCells(bodyTbl,     marker, pos);
  }

  // ---------- Value update ----------
  function updateValues(side, headerTbl, bodyTbl, strikes, underlying) {
    if (!bodyTbl || !bodyTbl.tBodies[0]) return;
    const midIdx = cachedMidIdx(headerTbl);
    if (midIdx === -1) return;

    Array.from(bodyTbl.tBodies[0].rows).forEach(function (row, i) {
      const strike = strikes[i];
      const mid    = parseNumber(row.cells[midIdx] && row.cells[midIdx].textContent);
      const intrinsic = side === 'call'
        ? Math.max(0, underlying - strike)
        : Math.max(0, strike - underlying);
      const extrinsic = mid - intrinsic;

      const extCell = row.querySelector('td[data-injected="cell"][data-marker="ext"]');
      const intCell = row.querySelector('td[data-injected="cell"][data-marker="int"]');

      if (extCell) {
        let display, color;
        if (isNaN(extrinsic) || isNaN(strike) || isNaN(underlying)) {
          display = '-';                  color = NEUTRAL_COLOR;
        } else if (extrinsic < 0) {
          display = extrinsic.toFixed(2); color = EXT_NEG_COLOR;
        } else {
          display = extrinsic.toFixed(2); color = EXT_POS_COLOR;
        }
        if (extCell.textContent !== display) extCell.textContent = display;
        if (extCell.style.color  !== color)   extCell.style.color   = color;
      }

      if (intCell) {
        let display, color;
        if (isNaN(intrinsic) || isNaN(strike) || isNaN(underlying)) {
          display = '-';                  color = NEUTRAL_COLOR;
        } else {
          display = intrinsic.toFixed(2); color = intrinsic > 0 ? INT_COLOR : NEUTRAL_COLOR;
        }
        if (intCell.textContent !== display) intCell.textContent = display;
        if (intCell.style.color  !== color)   intCell.style.color   = color;
      }
    });
  }

  function injectSide(side, headerTbl, bodyTbl, strikes, underlying) {
    if (!headerTbl || !bodyTbl) return;
    const deltaIdx = findColIdxByText(headerTbl, 'Delta');
    if (deltaIdx === -1) return;

    const headerColor = side === 'call' ? '#2ecc71' : '#e74c3c';

    // Phase 1: Ensure header THs in the right relative positions.
    //   calls: ... Delta | EXT | INT | IV ...    (EXT is "inner" toward strike, INT outer)
    //   puts:  ... IV | INT | EXT | Delta ...    (mirror)
    // Insert EXT first anchored to Delta, then INT anchored to current EXT position.
    const extInitialPos = side === 'call' ? deltaIdx + 1 : deltaIdx;
    ensureHeaderTH(headerTbl, 'EXT', 'ext', extInitialPos, headerColor);
    const currentExtPos = getCurrentHeaderPos(headerTbl, 'ext');
    if (currentExtPos === -1) return;
    const intInitialPos = side === 'call' ? currentExtPos + 1 : currentExtPos;
    ensureHeaderTH(headerTbl, 'INT', 'int', intInitialPos, headerColor);

    // Phase 2: Read the final positions of both injected columns from the header.
    const extPos = getCurrentHeaderPos(headerTbl, 'ext');
    const intPos = getCurrentHeaderPos(headerTbl, 'int');
    if (extPos === -1 || intPos === -1) return;

    // Ensure colgroup cols in both header and body tables (idempotent).
    ensureColgroupCol(headerTbl, 'ext', extPos);
    ensureColgroupCol(bodyTbl,   'ext', extPos);
    ensureColgroupCol(headerTbl, 'int', intPos);
    ensureColgroupCol(bodyTbl,   'int', intPos);

    // Self-heal: if any existing body marker cell is at a different position than its header TH
    // (can happen if the body was rebuilt while the header was preserved, and the previous
    // insertion order shifted things), tear out all our body cells so Phase 3 rebuilds cleanly.
    const expected = { ext: extPos, int: intPos };
    let misaligned = false;
    const firstRow = bodyTbl.tBodies[0] && bodyTbl.tBodies[0].rows[0];
    if (firstRow) {
      Object.keys(expected).forEach(function (m) {
        const td = firstRow.querySelector('td[data-injected="cell"][data-marker="' + m + '"]');
        if (td && Array.from(firstRow.cells).indexOf(td) !== expected[m]) misaligned = true;
      });
    }
    if (misaligned) {
      Array.from(bodyTbl.tBodies[0].rows).forEach(function (row) {
        row.querySelectorAll('td[data-injected="cell"]').forEach(function (td) { td.remove(); });
      });
    }

    // Phase 3: Ensure body cells, in ASCENDING ORDER of current header position. Inserting at
    // the lower position first means subsequent (higher-position) insertions still land on the
    // correct cell anchor — the body and header stay in sync regardless of insertion sequence.
    const insertions = [
      { marker: 'ext', pos: extPos },
      { marker: 'int', pos: intPos }
    ].sort(function (a, b) { return a.pos - b.pos; });
    insertions.forEach(function (ins) { ensureBodyCells(bodyTbl, ins.marker, ins.pos); });

    updateValues(side, headerTbl, bodyTbl, strikes, underlying);
  }

  // ---------- Main ----------
  let running = false;
  function update() {
    if (running) return;
    running = true;
    try {
      const left   = document.querySelectorAll('[class*="chain_table_left__"]');
      const right  = document.querySelectorAll('[class*="chain_table_right__"]');
      const strike = document.querySelectorAll('[class*="chain_table_strike__"]');
      if (!left.length || !right.length || !strike.length) return;

      const calls = getHeaderAndBody(left);
      const puts  = getHeaderAndBody(right);
      const strikeBody = getHeaderAndBody(strike).body;
      if (!calls.header || !calls.body || !puts.header || !puts.body || !strikeBody) return;

      const underlying = getUnderlyingPrice();
      if (isNaN(underlying)) return;

      const strikes = Array.from(strikeBody.rows).map(function (r) { return parseStrike(r.cells[0]); });

      injectSide('call', calls.header, calls.body, strikes, underlying);
      injectSide('put',  puts.header,  puts.body,  strikes, underlying);
    } catch (e) {
      console.warn('[Sigma Ext]', e);
    } finally {
      running = false;
    }
  }

  // If both header AND body markers are gone (full chain re-render on symbol change),
  // restore the title-row colspan so the next injection cycle starts clean.
  function fullResetIfNeeded() {
    const left = document.querySelectorAll('[class*="chain_table_left__"]');
    if (!left.length) return false;
    const callsHeader = getHeaderAndBody(left).header;
    if (callsHeader && !callsHeader.querySelector('th[data-injected="header"]')) {
      // Header was wiped — clean up orphan cols and restore colspan trackers.
      document.querySelectorAll('[data-injected]').forEach(function (el) { el.remove(); });
      document.querySelectorAll('[data-ext-bumped]').forEach(function (c) {
        const n = parseInt(c.getAttribute('data-ext-bumped') || '0', 10);
        if (n && c.colSpan) c.colSpan = Math.max(1, c.colSpan - n);
        c.removeAttribute('data-ext-bumped');
      });
      return true;
    }
    return false;
  }

  // ---------- Observer ----------
  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      fullResetIfNeeded();
      update();
    }, DEBOUNCE_MS);
  }

  const observer = new MutationObserver(schedule);
  // PERF (v1.3.3): dropped `characterData: true`. This was the single biggest source of the
  // "super slow option chain". On a live-ticking chain every streaming price digit (bid/ask/
  // mid/IV/volume on every row) is a text-node mutation; watching characterData on the whole
  // body subtree meant the browser's mutation-record machinery ran continuously — hundreds to
  // thousands of events/sec on a 200-row chain — even though schedule() is debounced. The
  // EXT/INT columns only need to RE-INJECT on structural changes (new/removed rows = childList),
  // which this still catches; their VALUES are kept current by the gentle poll below instead of
  // by reacting to every quote tick. Self-heal (fullResetIfNeeded) keys off a missing header
  // marker — a childList event — so it is unaffected.
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial runs — staggered to catch the chain mounting after the user clicks the Chains tab.
  setTimeout(update,  500);
  setTimeout(update, 1500);
  setTimeout(update, 3000);

  // PERF (v1.3.3): value-refresh poll. With characterData gone, pure price ticks (which mutate
  // text nodes, not DOM structure) no longer drive an update. EXT/INT = mid − intrinsic both
  // move with quotes, so we refresh them on a fixed gentle cadence rather than on every tick.
  // Routing through schedule() (not update() directly) keeps the fullResetIfNeeded() safety net
  // and the debounce; the `running` re-entrancy guard prevents overlap with observer-driven
  // passes. One O(rows) pass per ~1.5s is a tiny fraction of the old per-tick storm.
  setInterval(schedule, 1500);
})();
