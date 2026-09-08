const el = {
  refreshBtn: document.getElementById('refresh-btn'),
  lastUpdated: document.getElementById('last-updated'),
  banner: document.getElementById('banner'),
  body: document.getElementById('holdings-body'),
  totalUsd: document.getElementById('total-usd'),
  totalSgd: document.getElementById('total-sgd'),
  form: document.getElementById('add-form'),
  searchInput: document.getElementById('search-input'),
  searchResults: document.getElementById('search-results'),
  selectedCoin: document.getElementById('selected-coin'),
  nameInput: document.getElementById('name-input'),
  amountInput: document.getElementById('amount-input'),
  addBtn: document.getElementById('add-btn'),
  formError: document.getElementById('form-error'),
  sortableHeaders: [...document.querySelectorAll('th.sortable')],
};

let selected = null; // {coinId, symbol, name}

// Last payload from /api/portfolio, kept so re-sorting is instant and costs no API call.
let latest = { rows: [], totals: { usd: 0, sgd: 0 } };

// null direction = the order the holdings were added in.
let sort = { key: null, direction: null };

/* ---------- formatting ---------- */

const fiat = (value, currency) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

// Sub-dollar coins need more precision than 2 dp to be meaningful.
const price = (value, currency) => {
  if (value === null) return '—';
  const digits = Math.abs(value) >= 1 ? 2 : 6;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
};

const assetSize = (value) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value);

/* ---------- table helpers ---------- */

function cell(row, text, className) {
  const td = row.insertCell();
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

function emptyRow(message) {
  const tr = document.createElement('tr');
  tr.className = 'empty-row';
  const td = tr.insertCell();
  td.colSpan = 9;
  td.textContent = message;
  return tr;
}

/* ---------- sorting ---------- */

// Rows with no price sort to the bottom in both directions — they carry no value to compare.
function sortedRows(rows) {
  if (!sort.key || !sort.direction) return rows;

  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    if (left === null && right === null) return a.index - b.index;
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * factor;
  });
}

function applySortIndicators() {
  for (const th of el.sortableHeaders) {
    const active = th.dataset.sortKey === sort.key && sort.direction;
    th.classList.toggle('sorted', Boolean(active));
    th.setAttribute('aria-sort', active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    th.querySelector('.sort-arrow').textContent = active ? (sort.direction === 'asc' ? '▲' : '▼') : '';
  }
}

// Click cycles: largest first -> smallest first -> back to the order they were added.
function toggleSort(key) {
  if (sort.key !== key) sort = { key, direction: 'desc' };
  else if (sort.direction === 'desc') sort = { key, direction: 'asc' };
  else sort = { key: null, direction: null };

  applySortIndicators();
  render(latest);
}

for (const th of el.sortableHeaders) {
  th.querySelector('.sort-btn').addEventListener('click', () => toggleSort(th.dataset.sortKey));
}

/* ---------- rendering ---------- */

function render(data) {
  latest = data;
  const rows = sortedRows(data.rows);
  const { totals } = data;

  el.body.replaceChildren();

  if (rows.length === 0) {
    el.body.append(emptyRow('No holdings yet — add one below.'));
  } else {
    for (const row of rows) {
      const tr = el.body.insertRow();

      cell(tr, String(row.index), 'col-num');
      cell(tr, row.name);

      const symbolCell = cell(tr, row.symbol, 'symbol');
      const coinId = document.createElement('span');
      coinId.className = 'coin-id';
      coinId.textContent = row.coinId;
      symbolCell.append(coinId);

      cell(tr, price(row.priceUsd, 'USD'), row.stale ? 'num stale' : 'num');

      const amountCell = tr.insertCell();
      amountCell.className = 'num';
      amountCell.append(createCellEditor(row, 'amount'));

      cell(tr, row.subtotalUsd === null ? '—' : fiat(row.subtotalUsd, 'USD'), 'num');
      cell(tr, row.subtotalSgd === null ? '—' : fiat(row.subtotalSgd, 'SGD'), 'num');

      const remarkCell = tr.insertCell();
      remarkCell.className = 'col-remark';
      remarkCell.append(createCellEditor(row, 'remark'));

      const actions = tr.insertCell();
      actions.className = 'col-actions';
      actions.append(createRemoveButton(row));
    }
  }

  el.totalUsd.textContent = fiat(totals.usd, 'USD');
  el.totalSgd.textContent = fiat(totals.sgd, 'SGD');
}

function showBanner(message) {
  if (!message) {
    el.banner.hidden = true;
    el.banner.textContent = '';
    return;
  }
  el.banner.textContent = message;
  el.banner.hidden = false;
}

/* ---------- data ---------- */

async function loadPortfolio() {
  el.refreshBtn.disabled = true;
  el.refreshBtn.classList.add('is-busy');
  try {
    const res = await fetch('/api/portfolio');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);

    render(data);
    showBanner(data.priceError);
    el.lastUpdated.textContent = data.priceError
      ? 'Prices unavailable'
      : `Last updated ${new Date(data.fetchedAt).toLocaleTimeString()}`;
  } catch (err) {
    showBanner(err.message);
    el.lastUpdated.textContent = 'Update failed';
  } finally {
    el.refreshBtn.disabled = false;
    el.refreshBtn.classList.remove('is-busy');
  }
}

/* ---------- inline cell editing ---------- */

const REMARK_MAX_LENGTH = 200;

// One editable-cell mechanism, configured per column. A cell is a button until clicked,
// then swaps to an input in place; Enter or clicking away saves, Escape abandons.
const EDITORS = {
  amount: {
    className: 'amount-btn',
    inputClass: 'amount-input',
    label: 'asset size',
    display: (row) => assetSize(row.amount),
    initial: (row) => String(row.amount),
    configure: (input) => {
      input.type = 'number';
      input.step = 'any';
      input.min = '0';
    },
    toPatch: (raw) => {
      const next = Number(raw);
      if (!Number.isFinite(next) || next <= 0) {
        return { error: 'Asset size must be a number greater than 0.' };
      }
      return { patch: { amount: next } };
    },
    unchanged: (raw, row) => Number(raw) === row.amount,
  },
  remark: {
    className: 'remark-btn',
    inputClass: 'remark-input',
    label: 'remark',
    placeholder: 'Add a remark',
    display: (row) => row.remark,
    initial: (row) => row.remark ?? '',
    configure: (input) => {
      input.type = 'text';
      input.maxLength = REMARK_MAX_LENGTH;
      input.placeholder = 'Add a remark';
    },
    toPatch: (raw) => ({ patch: { remark: raw.trim() } }),
    unchanged: (raw, row) => raw.trim() === (row.remark ?? ''),
  },
};

function createCellEditor(row, kind) {
  const config = EDITORS[kind];
  const value = config.display(row);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = config.className;
  btn.classList.toggle('is-empty', !value);
  btn.textContent = value || config.placeholder || '';
  btn.title = `Edit ${config.label} for ${row.name}`;
  btn.setAttribute(
    'aria-label',
    value
      ? `Edit ${config.label} for ${row.name}, currently ${value}`
      : `Add a ${config.label} for ${row.name}`,
  );
  btn.addEventListener('click', () => startCellEdit(btn, row, kind));
  return btn;
}

function startCellEdit(btn, row, kind) {
  const config = EDITORS[kind];

  const input = document.createElement('input');
  input.className = config.inputClass;
  config.configure(input);
  input.value = config.initial(row);
  input.setAttribute('aria-label', `${config.label} for ${row.name}`);

  // Guards against blur firing a second time after Enter or Escape already settled the edit.
  let settled = false;

  const cancel = () => {
    if (settled) return;
    settled = true;
    input.replaceWith(btn);
  };

  const commit = async () => {
    if (settled) return;
    settled = true;

    if (config.unchanged(input.value, row)) {
      input.replaceWith(btn);
      return;
    }

    const { patch, error } = config.toPatch(input.value);
    if (error) {
      showBanner(error);
      input.replaceWith(btn);
      return;
    }

    input.disabled = true;
    try {
      const res = await fetch(`/api/holdings/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Could not update that holding.');
      }
      await loadPortfolio(); // re-renders the row, so the input is discarded
    } catch (err) {
      showBanner(err.message);
      input.replaceWith(btn);
    }
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  });
  input.addEventListener('blur', commit);

  btn.replaceWith(input);
  input.focus();
  input.select();
}

/* ---------- removing ---------- */

// Two-step inline confirm rather than window.confirm(): native dialogs are blocked or
// auto-dismissed in embedded browsers, and this keeps the guard inside the page.
const CONFIRM_TIMEOUT_MS = 4000;

function createRemoveButton(row) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'remove-btn';
  btn.textContent = '×';
  btn.title = `Remove ${row.name}`;
  btn.setAttribute('aria-label', `Remove ${row.name}`);

  let timer;
  const disarm = () => {
    clearTimeout(timer);
    btn.classList.remove('armed');
    btn.textContent = '×';
    btn.title = `Remove ${row.name}`;
    btn.setAttribute('aria-label', `Remove ${row.name}`);
  };

  btn.addEventListener('click', async () => {
    if (!btn.classList.contains('armed')) {
      btn.classList.add('armed');
      btn.textContent = 'Remove?';
      btn.title = `Click again to remove ${row.name}`;
      btn.setAttribute('aria-label', `Confirm removal of ${row.name}`);
      timer = setTimeout(disarm, CONFIRM_TIMEOUT_MS);
      return;
    }
    disarm();
    await removeHolding(row);
  });

  return btn;
}

async function removeHolding(row) {
  const res = await fetch(`/api/holdings/${row.id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    showBanner(data.error ?? 'Could not remove that holding.');
    return;
  }
  await loadPortfolio();
}

/* ---------- coin search ---------- */

function setSelected(coin) {
  selected = coin;
  el.searchResults.hidden = true;
  el.searchResults.replaceChildren();
  el.searchInput.value = `${coin.symbol} — ${coin.name}`;
  el.selectedCoin.textContent = `Selected: ${coin.name} (${coin.symbol}) · id: ${coin.coinId}`;
  el.selectedCoin.hidden = false;
  el.addBtn.disabled = false;
  if (!el.nameInput.value.trim()) el.nameInput.value = coin.name;
}

function clearSelected() {
  selected = null;
  el.selectedCoin.hidden = true;
  el.addBtn.disabled = true;
}

function renderResults(results) {
  el.searchResults.replaceChildren();
  if (results.length === 0) {
    el.searchResults.hidden = true;
    return;
  }

  for (const coin of results) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';

    if (coin.thumb) {
      const img = document.createElement('img');
      img.src = coin.thumb;
      img.alt = '';
      img.loading = 'lazy';
      btn.append(img);
    }

    const label = document.createElement('span');
    label.textContent = `${coin.symbol} — ${coin.name}`;
    btn.append(label);

    if (coin.rank) {
      const rank = document.createElement('span');
      rank.className = 'result-rank';
      rank.textContent = `#${coin.rank}`;
      btn.append(rank);
    }

    btn.addEventListener('click', () => setSelected(coin));
    li.append(btn);
    el.searchResults.append(li);
  }
  el.searchResults.hidden = false;
}

let searchTimer;
el.searchInput.addEventListener('input', () => {
  clearSelected();
  clearTimeout(searchTimer);

  const q = el.searchInput.value.trim();
  if (q.length < 2) {
    el.searchResults.hidden = true;
    return;
  }

  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed.');
      renderResults(data.results);
    } catch (err) {
      el.formError.textContent = err.message;
      el.formError.hidden = false;
    }
  }, 300);
});

/* ---------- add ---------- */

el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  el.formError.hidden = true;

  if (!selected) {
    el.formError.textContent = 'Pick a coin from the search results first.';
    el.formError.hidden = false;
    return;
  }

  const payload = {
    name: el.nameInput.value.trim() || selected.name,
    symbol: selected.symbol,
    coinId: selected.coinId,
    amount: Number(el.amountInput.value),
  };

  el.addBtn.disabled = true;
  try {
    const res = await fetch('/api/holdings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Could not add that holding.');

    el.form.reset();
    clearSelected();
    el.searchInput.value = '';
    await loadPortfolio();
  } catch (err) {
    el.formError.textContent = err.message;
    el.formError.hidden = false;
    el.addBtn.disabled = false;
  }
});

el.refreshBtn.addEventListener('click', loadPortfolio);

loadPortfolio();
