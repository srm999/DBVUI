// Simple SPA for Test Query Pairs Manager
// Data stored in localStorage for now. Replace storage layer to integrate with DataQEsuite later.

(function () {
  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const KEYS = {
    TEST_CASES: 'dq.testcases',
    CONNECTIONS: 'dq.connections',
  };

  const nowISO = () => new Date().toISOString();
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();

  const storage = {
    read(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    write(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  // Seed with sample data (first load only)
  function ensureSeeds() {
    const haveConns = storage.read(KEYS.CONNECTIONS, null);
    if (!haveConns) {
      const seedConns = [
        { id: uuid(), name: 'Warehouse', type: 'Snowflake', host: 'acme.snowflakecomputing.com', port: '', db: 'ANALYTICS', user: 'analyst', notes: 'read-only', updatedAt: nowISO() },
        { id: uuid(), name: 'OLTP-Prod', type: 'Postgres', host: 'db.prod', port: '5432', db: 'sales', user: 'dq', notes: '', updatedAt: nowISO() },
      ];
      storage.write(KEYS.CONNECTIONS, seedConns);
    }
    const haveTCs = storage.read(KEYS.TEST_CASES, null);
    if (!haveTCs) {
      const conns = storage.read(KEYS.CONNECTIONS, []);
      const seed = conns.length >= 2 ? [{
        id: uuid(),
        name: 'Daily Orders Count',
        description: 'Row count parity between OLTP and Warehouse snapshot',
        compare: 'row_count',
        sourceConnectionId: conns[1].id,
        targetConnectionId: conns[0].id,
        sourceQuery: 'select count(*) from orders where order_date = current_date',
        targetQuery: 'select count(*) from dw_orders where load_date = current_date',
        threshold: '0',
        tags: ['daily','orders'],
        updatedAt: nowISO(),
      }] : [];
      storage.write(KEYS.TEST_CASES, seed);
    }
  }

  // Router
  const routes = ['#testcases', '#new', '#connections'];
  function navigate(hash) {
    const target = routes.includes(hash) ? hash : '#testcases';
    qsa('.view').forEach(v => v.classList.remove('active'));
    qsa('.tab').forEach(t => t.classList.remove('active'));
    const viewId = target.replace('#', 'view-');
    const tabId = 'tab-' + target.replace('#', '');
    const view = qs('#' + viewId);
    const tab = qs('#' + tabId);
    if (view) view.classList.add('active');
    if (tab) tab.classList.add('active');
    // Load data specific to view
    if (target === '#testcases') renderTestCases();
    if (target === '#new') prepareTestCaseForm();
    if (target === '#connections') renderConnections();
  }

  // Connections logic
  function getConnections() { return storage.read(KEYS.CONNECTIONS, []); }
  function saveConnection(conn) {
    const all = getConnections();
    const idx = all.findIndex(c => c.id === conn.id);
    conn.updatedAt = nowISO();
    if (idx >= 0) all[idx] = conn; else all.unshift(conn);
    storage.write(KEYS.CONNECTIONS, all);
  }
  function deleteConnection(id) {
    const all = getConnections().filter(c => c.id !== id);
    storage.write(KEYS.CONNECTIONS, all);
  }

  // Test cases logic
  function getTestCases() { return storage.read(KEYS.TEST_CASES, []); }
  function saveTestCase(tc) {
    const all = getTestCases();
    const idx = all.findIndex(t => t.id === tc.id);
    tc.updatedAt = nowISO();
    if (idx >= 0) all[idx] = tc; else all.unshift(tc);
    storage.write(KEYS.TEST_CASES, all);
  }
  function deleteTestCase(id) {
    const all = getTestCases().filter(t => t.id !== id);
    storage.write(KEYS.TEST_CASES, all);
  }

  // UI helpers
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }
  function setOptions(sel, items, getVal = i => i.id, getLabel = i => i.name) {
    sel.innerHTML = '';
    items.forEach(i => {
      const o = document.createElement('option');
      o.value = getVal(i);
      o.textContent = getLabel(i);
      sel.appendChild(o);
    });
  }

  // Render: Test cases list
  function renderTestCases() {
    const tbody = qs('#tc-table tbody');
    const rows = getTestCases();
    const term = (qs('#tc-search').value || '').toLowerCase().trim();
    const connsById = Object.fromEntries(getConnections().map(c => [c.id, c]));
    const filtered = rows.filter(r => {
      const h = [r.name, r.description, r.compare, ...(r.tags || [])].join(' ').toLowerCase();
      const sName = connsById[r.sourceConnectionId]?.name || '';
      const tName = connsById[r.targetConnectionId]?.name || '';
      const hay = h + ' ' + sName.toLowerCase() + ' ' + tName.toLowerCase();
      return !term || hay.includes(term);
    });
    tbody.innerHTML = '';
    if (!filtered.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7; td.className = 'empty'; td.textContent = 'No test cases. Create one to get started.';
      tr.appendChild(td); tbody.appendChild(tr);
      return;
    }
    filtered.forEach(tc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${tc.name}</td>
        <td>${connsById[tc.sourceConnectionId]?.name || ''}</td>
        <td>${connsById[tc.targetConnectionId]?.name || ''}</td>
        <td><span class="pill">${tc.compare}</span></td>
        <td>${(tc.tags || []).join(', ')}</td>
        <td>${fmtDate(tc.updatedAt)}</td>
        <td class="row-actions">
          <button class="btn" data-act="edit" data-id="${tc.id}">Edit</button>
          <button class="btn" data-act="delete" data-id="${tc.id}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // Prepare form options and clear
  function prepareTestCaseForm(editId = null) {
    const conns = getConnections();
    setOptions(qs('#tc-source'), conns);
    setOptions(qs('#tc-target'), conns);
    const f = {
      id: qs('#tc-id'),
      name: qs('#tc-name'),
      desc: qs('#tc-desc'),
      compare: qs('#tc-compare'),
      source: qs('#tc-source'),
      target: qs('#tc-target'),
      srcq: qs('#tc-src-query'),
      trgq: qs('#tc-trg-query'),
      th: qs('#tc-threshold'),
      tags: qs('#tc-tags'),
    };
    if (!editId) {
      f.id.value = '';
      f.name.value = '';
      f.desc.value = '';
      f.compare.value = 'row_count';
      f.source.value = conns[0]?.id || '';
      f.target.value = conns[1]?.id || conns[0]?.id || '';
      f.srcq.value = '';
      f.trgq.value = '';
      f.th.value = '';
      f.tags.value = '';
      return;
    }
    const tc = getTestCases().find(t => t.id === editId);
    if (!tc) return;
    f.id.value = tc.id;
    f.name.value = tc.name || '';
    f.desc.value = tc.description || '';
    f.compare.value = tc.compare || 'row_count';
    f.source.value = tc.sourceConnectionId || '';
    f.target.value = tc.targetConnectionId || '';
    f.srcq.value = tc.sourceQuery || '';
    f.trgq.value = tc.targetQuery || '';
    f.th.value = tc.threshold || '';
    f.tags.value = (tc.tags || []).join(',');
  }

  // Render: Connections list
  function renderConnections() {
    const tbody = qs('#conn-table tbody');
    const rows = getConnections();
    const term = (qs('#conn-search').value || '').toLowerCase().trim();
    const filtered = rows.filter(r => {
      const hay = `${r.name} ${r.type}`.toLowerCase();
      return !term || hay.includes(term);
    });
    tbody.innerHTML = '';
    if (!filtered.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6; td.className = 'empty'; td.textContent = 'No connections yet. Create one on the left.';
      tr.appendChild(td); tbody.appendChild(tr);
      return;
    }
    filtered.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.name}</td>
        <td>${c.type}</td>
        <td>${c.host || ''}</td>
        <td>${c.db || ''}</td>
        <td>${fmtDate(c.updatedAt)}</td>
        <td class="row-actions">
          <button class="btn" data-act="edit" data-id="${c.id}">Edit</button>
          <button class="btn" data-act="delete" data-id="${c.id}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // Wire up events
  function bindEvents() {
    // Hash routing
    window.addEventListener('hashchange', () => navigate(location.hash));

    // Test cases list actions
    qs('#tc-search').addEventListener('input', renderTestCases);
    qs('#tc-table').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === 'edit') {
        // Navigate to form and load the record
        location.hash = '#new';
        setTimeout(() => prepareTestCaseForm(id));
      } else if (act === 'delete') {
        if (confirm('Delete this test case?')) {
          deleteTestCase(id);
          renderTestCases();
        }
      }
    });

    // Test case form submit/reset
    qs('#tc-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = qs('#tc-id').value || uuid();
      const tc = {
        id,
        name: qs('#tc-name').value.trim(),
        description: qs('#tc-desc').value.trim(),
        compare: qs('#tc-compare').value,
        sourceConnectionId: qs('#tc-source').value,
        targetConnectionId: qs('#tc-target').value,
        sourceQuery: qs('#tc-src-query').value.trim(),
        targetQuery: qs('#tc-trg-query').value.trim(),
        threshold: qs('#tc-threshold').value.trim(),
        tags: (qs('#tc-tags').value || '').split(',').map(t => t.trim()).filter(Boolean),
      };
      if (!tc.name || !tc.sourceConnectionId || !tc.targetConnectionId || !tc.sourceQuery || !tc.targetQuery) {
        alert('Please fill in required fields: Name, Source/Target Connection, Source/Target Query');
        return;
      }
      saveTestCase(tc);
      location.hash = '#testcases';
    });
    qs('#tc-reset').addEventListener('click', () => prepareTestCaseForm());

    // Test cases import/export
    qs('#tc-export').addEventListener('click', () => exportJSON('testcases', getTestCases()));
    qs('#tc-import').addEventListener('change', async (e) => importJSON(e, KEYS.TEST_CASES, renderTestCases));

    // Connections search/actions
    qs('#conn-search').addEventListener('input', renderConnections);
    qs('#conn-table').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === 'edit') {
        const c = getConnections().find(x => x.id === id);
        if (!c) return;
        qs('#conn-id').value = c.id;
        qs('#conn-name').value = c.name;
        qs('#conn-type').value = c.type;
        qs('#conn-host').value = c.host || '';
        qs('#conn-port').value = c.port || '';
        qs('#conn-db').value = c.db || '';
        qs('#conn-user').value = c.user || '';
        qs('#conn-notes').value = c.notes || '';
      } else if (act === 'delete') {
        if (confirm('Delete this connection? This may affect test cases using it.')) {
          deleteConnection(id);
          renderConnections();
        }
      }
    });

    // Connection form
    qs('#conn-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const conn = {
        id: qs('#conn-id').value || uuid(),
        name: qs('#conn-name').value.trim(),
        type: qs('#conn-type').value,
        host: qs('#conn-host').value.trim(),
        port: qs('#conn-port').value.trim(),
        db: qs('#conn-db').value.trim(),
        user: qs('#conn-user').value.trim(),
        notes: qs('#conn-notes').value.trim(),
      };
      if (!conn.name) { alert('Connection name is required'); return; }
      saveConnection(conn);
      // Reset and refresh lists and form options
      qs('#conn-form').reset();
      qs('#conn-id').value = '';
      renderConnections();
      // Update form selects in case user is on the New Test Case screen later
      if (location.hash === '#new') prepareTestCaseForm();
    });
    qs('#conn-reset').addEventListener('click', () => { qs('#conn-form').reset(); qs('#conn-id').value=''; });

    // Connections import/export
    qs('#conn-export').addEventListener('click', () => exportJSON('connections', getConnections()));
    qs('#conn-import').addEventListener('change', async (e) => importJSON(e, KEYS.CONNECTIONS, renderConnections));
  }

  // Import/Export helpers
  function exportJSON(prefix, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${prefix}-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function importJSON(evt, key, post) {
    const file = evt.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Invalid JSON: expected an array');
      storage.write(key, data);
      post && post();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      evt.target.value = '';
    }
  }

  // Init
  ensureSeeds();
  bindEvents();
  if (!location.hash) location.hash = '#testcases';
  navigate(location.hash);
})();

