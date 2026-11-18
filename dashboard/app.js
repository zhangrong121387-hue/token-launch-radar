// Token Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the model's
// own arithmetic and the protocol's farm plan, the live-token set the model learned from, and
// the method. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var state = {
    tab: 'board',
    q: '',
    category: 'all',
    chain: 'all',
    band: 'all',
    wlOnly: false,
    sort: 'implied',
    dir: -1,
    selected: null,
  };

  // ---------- formatting ----------
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // ---------- tiny DOM helper ----------
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---------- shared bits ----------
  function statBand() {
    var top = DATA.rows[0];
    return el('div', { class: 'stats' },
      el('div', { class: 'stat hot' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'launches ranked' })),
      el('div', { class: 'stat warn' }, el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('span', { text: 'watchlist covered' })),
      el('div', { class: 'stat' }, el('b', { text: String(DATA.early_size) }), el('span', { text: 'early, below the floor' })),
      el('div', { class: 'stat' }, el('b', { text: String(DATA.global_peers) }), el('span', { text: 'token-bearing peers' })),
      el('div', { class: 'stat' }, el('b', { text: fmtMult(DATA.global_median) }), el('span', { text: 'market mcap / TVL' })),
      el('div', { class: 'stat hot' }, el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('span', { text: 'top implied launch' }))
    );
  }

  function catChip(row) {
    return el('span', { class: 'chip', text: row.category || 'Uncategorised' });
  }
  function scopeChip(row) {
    return row.on_watchlist
      ? el('span', { class: 'chip wl', text: 'watchlist' })
      : el('span', { class: 'chip early', text: 'early' });
  }

  // ---------- board ----------
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wlOnly && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (state.band === 'b1' && r.tvl_usd < 1e9) return false;
      if (state.band === 'm250' && (r.tvl_usd < 250e6 || r.tvl_usd >= 1e9)) return false;
      if (state.band === 'm50' && (r.tvl_usd < 50e6 || r.tvl_usd >= 250e6)) return false;
      if (state.band === 'early' && r.tvl_usd >= 50e6) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function sortRows(rows) {
    var key = state.sort, dir = state.dir;
    var val = {
      rank: function (r) { return r.rank; },
      name: function (r) { return r.name.toLowerCase(); },
      tvl: function (r) { return r.tvl_usd; },
      change: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
      multiple: function (r) { return r.category_multiple; },
      implied: function (r) { return r.implied_value_usd; },
      age: function (r) { return r.age_days === null ? -1 : r.age_days; },
    }[key];
    return rows.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      if (x < y) return -dir; if (x > y) return dir;
      return a.rank - b.rank;
    });
  }

  function sortHead(label, key, cls) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' ▼' : ' ▲') : '';
    return el('th', {
      class: 'sortable ' + (cls || ''), text: label + arrow,
      onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      },
    });
  }

  function renderBoard() {
    var rows = sortRows(filteredRows());
    var topImplied = DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1;

    var cats = [];
    var seen = {};
    DATA.rows.forEach(function (r) { var c = r.category || 'Uncategorised'; if (!seen[c]) { seen[c] = 1; cats.push(c); } });
    cats.sort();
    var chainCount = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
    var chains = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a]; }).slice(0, 18);

    var catSel = el('select', { onchange: function (e) { state.category = e.target.value; render(); } },
      [el('option', { value: 'all', text: 'All categories' })].concat(cats.map(function (c) {
        return el('option', { value: c, text: c, selected: state.category === c ? 'selected' : null });
      })));
    var chainSel = el('select', { onchange: function (e) { state.chain = e.target.value; render(); } },
      [el('option', { value: 'all', text: 'All chains' })].concat(chains.map(function (c) {
        return el('option', { value: c, text: c, selected: state.chain === c ? 'selected' : null });
      })));
    var bandSel = el('select', { onchange: function (e) { state.band = e.target.value; render(); } },
      [['all', 'Any TVL'], ['b1', 'TVL $1B+'], ['m250', 'TVL $250M-1B'], ['m50', 'TVL $50-250M'], ['early', 'Early: under $50M']]
        .map(function (b) { return el('option', { value: b[0], text: b[1], selected: state.band === b[0] ? 'selected' : null }); }));

    var controls = el('div', { class: 'controls' },
      el('label', { text: 'Find' }),
      el('input', {
        type: 'search', placeholder: 'protocol, category…', value: state.q,
        oninput: function (e) { state.q = e.target.value; render(); var inp = app.querySelector('input[type=search]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } },
      }),
      el('label', { text: 'Category' }), catSel,
      el('label', { text: 'Chain' }), chainSel,
      el('label', { text: 'Size' }), bandSel,
      el('label', { class: 'check' },
        el('input', { type: 'checkbox', checked: state.wlOnly ? 'checked' : null, onchange: function (e) { state.wlOnly = e.target.checked; render(); } }),
        ' Watchlist only'),
      el('span', { class: 'count', text: 'showing ' + rows.length + ' of ' + DATA.board_size })
    );

    var head = el('tr', null,
      sortHead('#', 'rank'), sortHead('Protocol', 'name'), el('th', { text: 'Category' }), el('th', { text: 'Scope' }),
      el('th', { text: 'Chains' }), sortHead('TVL', 'tvl', 'num'), sortHead('7d', 'change', 'num'),
      sortHead('Multiple', 'multiple', 'num'), sortHead('Implied launch value', 'implied', 'num'), sortHead('Age', 'age', 'num'));

    var body = rows.map(function (r) {
      var pct = Math.max(2, Math.sqrt(r.implied_value_usd / topImplied) * 100);
      return el('tr', { onclick: function () { openDetail(r.slug); } },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'pname', text: r.name }), el('div', { class: 'pslug', text: r.slug })),
        el('td', null, catChip(r)),
        el('td', null, scopeChip(r)),
        el('td', { class: 'chains', text: r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', { class: 'num' }, el('div', { class: 'bar' }, el('span', { class: 'fill', style: 'width:' + pct.toFixed(1) + '%' }), el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }))),
        el('td', { class: 'num', text: fmtAge(r.age_days) }));
    });

    var table = el('table', null, el('thead', null, head), el('tbody', null, body.length ? body : [el('tr', null, el('td', { class: 'empty', colspan: '10', text: 'No protocol matches this filter. Loosen it — the radar keeps sweeping.' }))]));
    clear(app);
    app.appendChild(statBand());
    app.appendChild(controls);
    app.appendChild(table);
    app.appendChild(el('p', { class: 'note', text: 'Click a row for the protocol\u2019s valuation walk and farm plan. Multiple = the launch multiple its category\u2019s token-bearing peers trade at (see Method). Snapshot: DefiLlama, ' + DATA.as_of + '.' }));
  }

  // ---------- detail ----------
  function openDetail(slug) {
    state.selected = slug;
    if (location.hash !== '#p/' + slug) history.replaceState(null, '', '#p/' + slug);
    render();
    window.scrollTo(0, 0);
  }

  function renderDetail(row) {
    var m = DATA.model;
    var peerLine;
    if (row.category_peers > 0) {
      peerLine = row.category_peers + ' token-bearing ' + (row.category || '') + ' peer' + (row.category_peers === 1 ? ' trades' : 's trade') +
        ' at a median ' + fmtMult(row.category_median) + ' of TVL; shrunk toward the market-wide ' + fmtMult(DATA.global_median) +
        ' (' + DATA.global_peers + ' peers) by peer count, K=' + m.shrinkage_k + '.';
    } else {
      peerLine = 'No token-bearing peer in this category: priced at the market-wide median of ' + fmtMult(DATA.global_median) + ' (' + DATA.global_peers + ' peers).';
    }
    var walk = el('table', { class: 'walk' },
      el('tr', null, el('td', { text: 'TVL in the protocol' }), el('td', { class: 'op', text: '' }), el('td', { class: 'amt', text: fmtUsd(row.tvl_usd) }), el('td', { class: 'why', text: 'DefiLlama snapshot, ' + DATA.as_of + (row.listed_at ? '; tracked since ' + row.listed_at : '') })),
      el('tr', null, el('td', { text: 'Category launch multiple' }), el('td', { class: 'op', text: '×' }), el('td', { class: 'amt', text: fmtMult(row.category_multiple) }), el('td', { class: 'why', text: peerLine })),
      el('tr', null, el('td', { text: 'Growth, 7-day TVL ' + fmtPct(row.change_7d) }), el('td', { class: 'op', text: '×' }), el('td', { class: 'amt', text: fmtMult(row.growth_multiplier) }), el('td', { class: 'why', text: 'Half the clamped 7-day change; a rising protocol launches into demand.' })),
      el('tr', null, el('td', { text: 'Maturity, ' + fmtAge(row.age_days) + ' with no token' }), el('td', { class: 'op', text: '×' }), el('td', { class: 'amt', text: fmtMult(row.maturity_multiplier) }), el('td', { class: 'why', text: '0.60 at listing, rising to 1.00 over ' + m.maturity_days + ' days: a record a launch price can rest on.' })),
      el('tr', { class: 'total' }, el('td', { text: 'Implied launch value' }), el('td', { class: 'op', text: '=' }), el('td', { class: 'amt', text: fmtUsd(row.implied_value_usd) }), el('td', { class: 'why', text: 'Rank #' + row.rank + ' of ' + DATA.board_size + ' on the board.' }))
    );
    if (row.peer_p25 !== null && row.peer_p75 !== null && row.category_multiple > 0 && row.peer_p75 > row.peer_p25) {
      var lo = Math.round(row.implied_value_usd * row.peer_p25 / row.category_multiple);
      var hi = Math.round(row.implied_value_usd * row.peer_p75 / row.category_multiple);
      walk.appendChild(el('tr', null, el('td', { text: 'Peer spread, 25th–75th' }), el('td', { class: 'op', text: '' }),
        el('td', { class: 'amt', text: fmtUsd(lo) + ' – ' + fmtUsd(hi) }),
        el('td', { class: 'why', text: 'The same walk at the category peers\u2019 25th and 75th percentile multiples (' + fmtMult(row.peer_p25) + ' – ' + fmtMult(row.peer_p75) + ' before shrinkage).' })));
    }

    var facts = el('div', { class: 'facts' },
      el('div', null, el('b', { text: row.category || 'Uncategorised' }), el('span', { text: 'Category' })),
      el('div', null, el('b', { text: row.on_watchlist ? 'Watchlist' : 'Early radar' }), el('span', { text: row.on_watchlist ? 'At or above the $50M floor' : 'Below the $50M floor' })),
      el('div', null, el('b', { text: String(row.chains.length) }), el('span', { text: 'Chains: ' + row.chains.slice(0, 4).join(', ') + (row.chains.length > 4 ? '…' : '') })),
      el('div', null, el('b', { text: row.listed_at || 'unknown' }), el('span', { text: 'Tracked by DefiLlama since' })),
      el('div', null, el('b', { text: fmtUsd(row.tvl_usd) }), el('span', { text: 'TVL' })),
      el('div', null, el('b', { text: fmtPct(row.change_7d) }), el('span', { text: 'TVL change, 7 days' }))
    );

    var plan = el('ol', { class: 'plan' }, row.farm_steps.map(function (s) { return el('li', { text: s }); }));

    clear(app);
    app.appendChild(el('button', { class: 'back', text: '← Back to the board', onclick: function () { state.selected = null; history.replaceState(null, '', '#board'); render(); } }));
    app.appendChild(el('div', { class: 'detail-head' },
      el('h2', { text: row.name }),
      catChip(row), scopeChip(row),
      el('div', { class: 'implied' }, el('b', { text: fmtUsd(row.implied_value_usd) }), el('span', { text: 'implied launch value' }))));
    app.appendChild(el('div', { class: 'panels' },
      el('section', { class: 'panel' }, el('h3', { text: 'Why this value — the walk' }), walk,
        el('p', { class: 'note', text: 'Every figure is the snapshot\u2019s own. The model is stated in full under Method; the same function prices every row, and no name is special-cased.' })),
      el('section', { class: 'panel' }, el('h3', { text: 'The record' }), facts,
        el('p', { class: 'note', text: 'Status: pre-token. DefiLlama records no token, no CoinGecko id and no market cap for ' + row.name + ', and it is not a wrapped, staked or bridged product of a token that trades.' }))));
    app.appendChild(el('section', { class: 'panel', style: 'margin-top:12px' }, el('h3', { text: 'Farm plan — what to do before the launch' }), plan,
      el('p', { class: 'note', text: 'Farming is a bet on a launch this page does not predict. The plan is written from the protocol\u2019s category, chains, TVL and age; position sizes are the plan\u2019s, not advice.' })));
  }

  // ---------- live ----------
  function renderLive() {
    var head = el('tr', null,
      el('th', { text: '#' }), el('th', { text: 'Protocol' }), el('th', { text: 'Category' }),
      el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }),
      el('th', { class: 'num', text: 'Mcap / TVL' }), el('th', { class: 'num', text: '7d' }));
    var body = DATA.live.map(function (r, i) {
      return el('tr', null,
        el('td', { class: 'rank', text: String(i + 1) }),
        el('td', null, el('div', { class: 'pname', text: r.name }), el('div', { class: 'pslug', text: r.slug })),
        el('td', null, el('span', { class: 'chip', text: r.category || 'Uncategorised' })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.ratio) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }));
    });
    clear(app);
    app.appendChild(el('p', { class: 'note', style: 'margin:0 0 12px;font-size:13px', text: 'These protocols already have a token: they are never ranked on the board. They are shown at the market\u2019s own values, and they are the evidence the board\u2019s multiples are learned from — the peer book behind every implied value.' }));
    app.appendChild(el('table', null, el('thead', null, head), el('tbody', null, body)));
  }

  // ---------- method ----------
  function renderMethod() {
    var m = DATA.model;
    var top = DATA.rows[0];
    var catRows = DATA.categories.map(function (c) {
      return el('tr', null,
        el('td', { text: c.name }), el('td', { class: 'num', text: String(c.peers) }),
        el('td', { class: 'num', text: fmtMult(c.median) }), el('td', { class: 'num', text: fmtMult(c.multiple) }));
    });
    var wrap = el('div', { class: 'method' });
    function h(t) { return el('h2', { text: t }); }
    function p() {
      var node = el('p');
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        if (typeof a === 'string') node.appendChild(document.createTextNode(a));
        else node.appendChild(a);
      }
      return node;
    }
    function code(t) { return el('code', { text: t }); }
    function b(t) { return el('b', { text: t }); }

    wrap.appendChild(h('The question'));
    wrap.appendChild(p('A protocol\u2019s launch is the token it may issue one day. This radar asks: ', b('if the protocol issued its token today, at the size its own record supports, what would the launch be worth'), ' — and what should a reader do to farm it before it does? It does not predict whether or when a token comes.'));
    wrap.appendChild(h('Who gets ranked'));
    wrap.appendChild(p('Every protocol in the DefiLlama snapshot (' + '758 tracked at $5M TVL or more, ' + DATA.as_of + ') that ', b('records no token'), ' — no market cap, no CoinGecko id, no symbol — and is ', b('not a wrapped, staked or bridged product of one that trades'), ': not a bridge, canonical bridge, liquid staking, liquid restaking or restaked-BTC category, not a versioned pool of another protocol, no exchange\u2019s product. That rule leaves ', b(DATA.board_size + ' candidates'), ': the house watchlist of ' + DATA.watchlist_size + ' at or above the $50M floor, and ' + DATA.early_size + ' early protocols below it. Protocols whose token already trades are set aside in the Live view, at the market\u2019s values.'));
    wrap.appendChild(h('The value model'));
    wrap.appendChild(p('A launch is priced the way the market already priced the launches that happened. From the snapshot\u2019s ', b(DATA.global_peers + ' token-bearing protocols'), ' (exchanges set aside — an exchange token is not priced on a product\u2019s TVL), take each one\u2019s market cap / TVL, winsorised to [', code(m.ratio_winsor_lo + 'x, ' + m.ratio_winsor_hi + 'x'), '] so one wild print cannot bend a median. A category\u2019s multiple is its peers\u2019 median, shrunk toward the market-wide median (' + fmtMult(DATA.global_median) + ') by peer count:'));
    wrap.appendChild(p(code('multiple = (n × category median + ' + m.shrinkage_k + ' × global median) / (n + ' + m.shrinkage_k + '), clamped to [' + m.multiple_floor + 'x, ' + m.multiple_cap + 'x]')));
    wrap.appendChild(p('Then the protocol\u2019s own record moves the price: ', code('implied = TVL × multiple × growth × maturity'), ', where growth is half its clamped 7-day TVL change (', code('1 + clamp(change, ' + m.growth_floor + ', +' + m.growth_cap + ') / 100 × ' + m.growth_weight), ') and maturity rises from ', code(m.maturity_floor + ' to 1.00'), ' over ' + m.maturity_days + ' days tracked with no token. The same function prices every row; no name is special-cased, and each detail view shows its own walk.'));
    if (top) {
      wrap.appendChild(p('Worked example, the board\u2019s top row: ', b(top.name), ' — TVL ' + fmtUsd(top.tvl_usd) + ' × ' + (top.category || '') + ' multiple ' + fmtMult(top.category_multiple) + ' × growth ' + fmtMult(top.growth_multiplier) + ' × maturity ' + fmtMult(top.maturity_multiplier) + ' = ', b(fmtUsd(top.implied_value_usd)), '.'));
    }
    wrap.appendChild(h('Category multiples in this snapshot'));
    wrap.appendChild(el('table', null,
      el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Peers' }), el('th', { class: 'num', text: 'Median mcap/TVL' }), el('th', { class: 'num', text: 'Multiple used' }))),
      el('tbody', null, catRows)));
    wrap.appendChild(h('Farm plans'));
    wrap.appendChild(p('Each row\u2019s plan is written from its own record — the category\u2019s core action, a position sized to its TVL, its first two chains, a weekly qualifying habit and a hold window set by its age — with a cost and a time on every step. No plan is a promise: a protocol may never issue, and the plan says what would make a farmer exit.'));
    wrap.appendChild(h('What the model does not do'));
    wrap.appendChild(p('It uses only the snapshot\u2019s ten fields per protocol: no fees, revenue, users or off-chain news, because the sealed snapshot carries none. Where a category has few peers the shrinkage says so, and the detail view shows the peer spread instead of hiding it.'));
    clear(app);
    app.appendChild(wrap);
  }

  // ---------- routing & tabs ----------
  function syncTabs() {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-tab') === state.tab && !state.selected);
    });
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      state.tab = t.getAttribute('data-tab');
      state.selected = null;
      history.replaceState(null, '', '#' + state.tab);
      render();
      window.scrollTo(0, 0);
    });
  });

  function render() {
    app.setAttribute('aria-busy', 'false');
    syncTabs();
    if (state.selected) {
      var row = null;
      DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
      if (row) { renderDetail(row); return; }
      state.selected = null;
    }
    if (state.tab === 'live') renderLive();
    else if (state.tab === 'method') renderMethod();
    else renderBoard();
  }

  // Hash entry points: #p/<slug> a detail view, #f/<category> a filtered board, #live, #method.
  function applyHash() {
    var hash = location.hash || '';
    var pm = hash.match(/^#p\/(.+)$/);
    if (pm) { state.selected = decodeURIComponent(pm[1]); state.tab = 'board'; return; }
    var fm = hash.match(/^#f\/(.+)$/);
    if (fm) { state.category = decodeURIComponent(fm[1]); state.tab = 'board'; state.selected = null; return; }
    if (hash === '#live') state.tab = 'live';
    if (hash === '#method') state.tab = 'method';
  }
  window.addEventListener('hashchange', function () { applyHash(); render(); });
  applyHash();
  render();
})();
