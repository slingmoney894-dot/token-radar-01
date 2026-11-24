// Token Radar's console dashboard. Reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs and the protocol's farm plan, and a live-token tab. No network: every byte it shows
// is in data.js. State lives in the URL hash so a view can be linked: #q= #cat= #chain= #sort=
// #dir= #tab= #p=<slug>.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { q: '', cat: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model, recomputed in the page from the snapshot figures: the page checks its own
  // arithmetic against the number board.json carries, so the code and the data visibly agree.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight + (growth > 0 ? model.momentum_kicker * Math.pow(growth / 100, 2) : 0);
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + model.maturity_span * (Math.log1p(Math.max(age, 0)) / Math.log1p(model.maturity_horizon_days));
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_extra_chains);
    var breadth = 1 + model.breadth_per_chain * extra;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * breadth));
  }

  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('cat')) state.cat = params.get('cat');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('dir')) state.dir = params.get('dir') === '1' ? 1 : -1;
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.cat !== 'all') params.set('cat', state.cat);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.dir !== -1) params.set('dir', String(state.dir));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.cat !== 'all' && (r.category || 'Other') !== state.cat) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function mastHtml() {
    return '<header class="mast">' +
      '<div class="brand"><span class="mark" aria-hidden="true"><i></i></span>' +
      '<div><div class="brand-name">Token Radar</div>' +
      '<h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by implied value</h1></div></div>' +
      '<div class="mast-meta">Snapshot <b>' + esc(DATA.as_of) + '</b><br>DefiLlama protocol index<br>Model <b>' + esc(DATA.model_version) + '</b></div>' +
      '</header>';
  }
  function statsHtml() {
    var top = DATA.rows[0];
    return '<section class="stats" aria-label="Board facts">' +
      '<div class="stat"><div class="k">Watchlist covered</div><div class="v">' + DATA.watchlist_size + ' <em>/ ' + DATA.watchlist_size + '</em></div><div class="d">every protocol on the floor</div></div>' +
      '<div class="stat"><div class="k">Pre-token rows scored</div><div class="v">' + DATA.board_size + '</div><div class="d">' + DATA.early_size + ' early rows below the floor</div></div>' +
      '<div class="stat"><div class="k">Top implied value</div><div class="v">' + fmtUsd(top ? top.implied_value_usd : 0) + '</div><div class="d">' + esc(top ? top.name : '') + '</div></div>' +
      '<div class="stat"><div class="k">Live-token set aside</div><div class="v">' + DATA.live_size + '</div><div class="d">already trading, shown apart</div></div>' +
      '</section>';
  }
  function ledeHtml() {
    return '<section class="lede">' +
      '<p>The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M</b> of TVL whose record carries no token. ' +
      'The early radar adds <b>' + DATA.early_size + '</b> pre-token protocols below that floor, strongest TVL first. ' +
      'Implied value is a model of what a token would be worth if the protocol\'s record stayed as it is — not a prediction that one is issued, and not a price.</p>' +
      '</section>';
  }
  function controlsHtml() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var opt = function (v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    return '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="cat">Category</label><select id="cat" aria-label="Filter by category">' + opt('all', 'All categories', state.cat) + cats.map(function (c) { return opt(c, c, state.cat); }).join('') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain">' + opt('all', 'All chains', state.chain) + chains.map(function (c) { return opt(c, c, state.chain); }).join('') + '</select></div>' +
      '<div class="field"><label>Token status</label><div class="tabs" role="group" aria-label="Token status">' +
      '<button type="button" data-tab="pre-token" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token</button>' +
      '<button type="button" data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live token</button>' +
      '</div></div>' +
      '<span class="count">' + (state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols') + '</span>' +
      '</div>';
  }
  function sortBtn(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' v' : ' ^') : '';
    return '<th scope="col"><button type="button" data-sort="' + key + '">' + esc(label) + esc(arrow) + '</button></th>';
  }
  function boardHtml() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2>' +
        '<p>Clear the search or pick another category or chain to see the board again.</p>' +
        '<p style="margin-top:16px"><button class="btn primary" type="button" data-action="clear">Clear filters</button></p></div></div>';
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var rows = list.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var pct = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '" tabindex="0">' +
        '<td class="num rank">' + r.rank + '</td>' +
        '<td><span class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</span></span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + gc + '">' + growth + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td><span class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></td>' +
        '<td><span class="tag">records no token</span></td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>' +
      '<thead><tr>' + sortBtn('implied', 'Rank') + sortBtn('name', 'Protocol') + sortBtn('tvl', 'TVL') + sortBtn('growth', '7d') + sortBtn('age', 'Age') + sortBtn('implied', 'Implied value') + '<th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }
  function liveHtml() {
    var rows = DATA.live.map(function (r) {
      return '<tr>' +
        '<td><span class="tag live">already trades</span></td>' +
        '<td><span class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</span></span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</caption>' +
      '<thead><tr><th scope="col">Token</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }
  function modelHtml() {
    var m = DATA.model;
    return '<section class="panel model"><h2>How implied value is computed</h2>' +
      '<p>One function scores every protocol, from the snapshot\'s own figures: its TVL, its seven-day growth, how long it has run with no token on record, and how many chains it runs on. No protocol name is special-cased, and no row is hand-picked.</p>' +
      '<div class="formula">implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ' + ' + m.momentum_kicker + ' x max(0, clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100)^2) x (' + m.maturity_floor + ' + ' + m.maturity_span + ' x ln(1 + age_days) / ln(1 + ' + m.maturity_horizon_days + ')) x (1 + ' + m.breadth_per_chain + ' x min(chains - 1, ' + m.breadth_max_extra_chains + ')) )</div>' +
      '<div class="consts"><span>base multiple <b>' + m.base_multiple + '</b></span><span>growth weight <b>' + m.growth_weight + '</b></span><span>momentum kicker <b>' + m.momentum_kicker + '</b></span><span>growth clamp <b>' + m.growth_floor + ' to ' + m.growth_cap + '</b></span><span>maturity <b>' + m.maturity_floor + ' + ' + m.maturity_span + ' log</b></span><span>horizon <b>' + m.maturity_horizon_days + ' days</b></span><span>unknown age <b>' + m.unknown_age_days + ' days</b></span><span>per extra chain <b>+' + (m.breadth_per_chain * 100) + '%</b></span></div>' +
      '<p>Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Growth is clamped so one hot week cannot crown a protocol, and the log curve lets age pay without letting the oldest protocol win on age alone. A convex kicker on positive growth rewards the few protocols actually gaining TVL: the median protocol in this snapshot is down 5.4% on the week, so the kicker barely moves most rows.</p>' +
      '</section>';
  }
  function detailHtml(row) {
    var recomputed = impliedOf(row, DATA.model);
    var agree = recomputed === row.implied_value_usd;
    var steps = (row.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    return '<aside class="detail" id="detail" aria-labelledby="detail-title">' +
      '<div class="detail-head"><div><span class="k">Rank ' + row.rank + ' of ' + DATA.board_size + '</span>' +
      '<h2 id="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc((row.chains || []).join(', ') || 'an unnamed chain') + '</p></div>' +
      '<button class="close" type="button" data-action="close" aria-label="Close details">Close</button></div>' +
      '<section class="detail-section"><h3>Implied value</h3><div class="equation">' +
      '<div><span>TVL</span><b>' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div><span>Seven-day growth</span><b>' + fmtPct(row.change_7d) + '</b></div>' +
      '<div><span>Age with no token on record</span><b>' + fmtAge(row.age_days) + '</b></div>' +
      '<div><span>Chains</span><b>' + (row.chains || []).length + '</b></div>' +
      '<div><span>Growth multiplier</span><b>' + row.growth_multiplier + '</b></div>' +
      '<div><span>Maturity multiplier</span><b>' + row.maturity_multiplier + '</b></div>' +
      '<div><span>Breadth multiplier</span><b>' + row.breadth_multiplier + '</b></div>' +
      '<div><span>Implied value</span><b>' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '</div>' +
      '<p class="check' + (agree ? '' : ' bad') + '">The page recomputes this row as <b>' + fmtUsd(recomputed) + '</b> — ' + (agree ? 'the same number board.json carries.' : 'which differs from the board: the data would be stale.') + '</p>' +
      '<p class="note">This is an estimate, not a price. The protocol records no token; a token may still exist that its record does not carry.</p></section>' +
      '<section class="detail-section"><h3>Farm plan</h3><ol class="steps">' + steps + '</ol>' +
      '<p class="note">Each step states what it costs and how long it takes. Never pay anyone to claim on your behalf, and never sign an approval you did not open yourself.</p></section>' +
      '</aside>';
  }

  function selectedRow() {
    if (!state.selected) return null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === state.selected) return DATA.rows[i];
    return null;
  }

  function render() {
    var html = '<div class="shell">' + mastHtml() + statsHtml() + ledeHtml() + controlsHtml() +
      (state.tab === 'pre-token' ? boardHtml() : liveHtml()) +
      (state.tab === 'pre-token' ? modelHtml() : '') +
      '<p class="foot">Token Radar · model ' + esc(DATA.model_version) + ' · snapshot ' + esc(DATA.as_of) + ' · ' +
      '<b>' + DATA.board_size + ' pre-token rows</b> from ' + DATA.watchlist_size + ' watchlist protocols plus ' + DATA.early_size + ' early rows below the floor · ' +
      'implied values are the entry\'s own claim, never make.fun\'s.</p></div>';
    var row = selectedRow();
    if (row) html += detailHtml(row);
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
  }

  app.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'q') { state.q = e.target.value; writeHash(); render(); var q = document.getElementById('q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  });
  app.addEventListener('change', function (e) {
    if (!e.target) return;
    if (e.target.id === 'cat') { state.cat = e.target.value; writeHash(); render(); }
    if (e.target.id === 'chain') { state.chain = e.target.value; writeHash(); render(); }
  });
  app.addEventListener('click', function (e) {
    var t = e.target;
    if (!t) return;
    var tab = t.closest ? t.closest('[data-tab]') : null;
    if (tab) { state.tab = tab.getAttribute('data-tab'); writeHash(); render(); return; }
    var sort = t.closest ? t.closest('[data-sort]') : null;
    if (sort) {
      var key = sort.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
      writeHash(); render(); return;
    }
    var action = t.closest ? t.closest('[data-action]') : null;
    if (action) {
      if (action.getAttribute('data-action') === 'clear') { state.q = ''; state.cat = 'all'; state.chain = 'all'; writeHash(); render(); }
      if (action.getAttribute('data-action') === 'close') { state.selected = null; writeHash(); render(); }
      return;
    }
    var tr = t.closest ? t.closest('tr[data-slug]') : null;
    if (tr) { state.selected = tr.getAttribute('data-slug'); writeHash(); render(); }
  });
  app.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches && e.target.matches('tr[data-slug]')) {
      e.preventDefault();
      state.selected = e.target.getAttribute('data-slug'); writeHash(); render();
    }
    if (e.key === 'Escape' && state.selected) { state.selected = null; writeHash(); render(); }
  });

  readHash();
  render();
})();
