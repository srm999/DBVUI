// Simple SPA for TestQueryPairs management
// No external deps. Uses localStorage and CSV import/export.

(function () {
  const VIEWS = { NEW: 'new', TESTCASES: 'testcases', CONNECTIONS: 'connections' };

  const LS_KEYS = {
    TESTCASES: 'dq_testcases',
    CONNECTIONS: 'dq_connections',
  };

  // Excel-aligned schemas
  const TESTCASE_HEADERS = ['TCID','Table','Test_Type','TCName','Test_YN','SRC_Data_File','SRC_Connection','TGT_Data_File','TGT_Connection','Filters','Delimiter','pk_columns','Date_Fields','Percentage_Fields','Threshold_Percentage','src_sheet_name','tgt_sheet_name','header_columns','skip_rows'];
  const CONNECTION_HEADERS = ['Project','Server','Database','Warehouse','Role'];

  // In-memory state
  const state = {
    view: VIEWS.NEW,
    testcases: [],
    connections: [],
    editingTestId: null,
  };

  // ---------- Storage ----------
  function loadState() {
    try {
      const t = JSON.parse(localStorage.getItem(LS_KEYS.TESTCASES) || '[]');
      const c = JSON.parse(localStorage.getItem(LS_KEYS.CONNECTIONS) || '[]');
      state.testcases = Array.isArray(t) ? t : [];
      state.connections = Array.isArray(c) ? c : [];
    } catch (e) {
      console.warn('Failed to parse localStorage', e);
      state.testcases = [];
      state.connections = [];
    }
  }

  function persist() {
    localStorage.setItem(LS_KEYS.TESTCASES, JSON.stringify(state.testcases));
    localStorage.setItem(LS_KEYS.CONNECTIONS, JSON.stringify(state.connections));
  }

  // ---------- Utils ----------
  function el(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function uid() {
    return 'tq_' + Math.random().toString(36).slice(2, 9);
  }

  function escapeCsvValue(value) {
    const s = String(value ?? '');
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  // Robust-enough CSV parser for typical Excel-exported CSV
  function parseCSV(text) {
    const rows = [];
    let i = 0, field = '', row = [], inQuotes = false;
    while (i < text.length) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        } else { field += char; i++; continue; }
      }
      if (char === '"') { inQuotes = true; i++; continue; }
      if (char === ',') { row.push(field); field = ''; i++; continue; }
      if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      if (char === '\r') { i++; continue; }
      field += char; i++;
    }
    // last field
    row.push(field);
    rows.push(row);
    return rows;
  }

  function download(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toCSV(headers, rows) {
    const head = headers.map(escapeCsvValue).join(',');
    const body = rows.map(r => headers.map(h => escapeCsvValue(r[h])).join(',')).join('\n');
    return head + '\n' + body + '\n';
  }

  function caseInsensitiveMap(arr) {
    const m = new Map();
    arr.forEach((v) => m.set(String(v).toLowerCase(), v));
    return m;
  }

  // ---------- Rendering ----------
  function render() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    switch (state.view) {
      case VIEWS.NEW: app.appendChild(viewNewTestCase()); break;
      case VIEWS.TESTCASES: app.appendChild(viewAllTestCases()); break;
      case VIEWS.CONNECTIONS: app.appendChild(viewConnections()); break;
    }
    highlightNav();
  }

  function highlightNav() {
    document.querySelectorAll('.nav-btn').forEach((b) => {
      const isActive = b.dataset.view === state.view;
      b.style.outline = isActive ? '2px solid var(--blue-100)' : 'none';
      b.style.boxShadow = isActive ? '0 0 0 2px var(--white) inset' : 'none';
    });
  }

  function viewNewTestCase() {
    const card = el(`<section class="card">
      <h2 style="margin:0 0 8px 0">${state.editingTestId ? 'Edit' : 'New'} Test Case</h2>
      <div class="grid">
        <div class="section-title"><span class="bar"></span>Basics</div>
        <div class="col-4"><label>TCID</label><input type="text" id="TCID" placeholder="Optional" /></div>
        <div class="col-4"><label>TCName</label><input type="text" id="TCName" placeholder="Required" /></div>
        <div class="col-4"><label>Table</label><input type="text" id="Table" placeholder="Object under test" /></div>
        <div class="col-4"><label>Test_Type</label><input type="text" id="Test_Type" placeholder="CCD_Validation / etc" /></div>
        <div class="col-4"><label>Test_YN</label><select id="Test_YN"><option value="Y">Y</option><option value="N">N</option></select></div>

        <div class="section-title"><span class="bar"></span>Connections</div>
        <div class="col-6"><label>SRC_Connection</label><select id="SRC_Connection"></select></div>
        <div class="col-6"><label>TGT_Connection</label><select id="TGT_Connection"></select></div>

        <div class="section-title"><span class="bar"></span>Files</div>
        <div class="col-6"><label>SRC_Data_File</label>
          <div class="row">
            <input class="grow" type="text" id="SRC_Data_File" placeholder="ex: Sample_SRC.sql/.xlsx/.csv" />
            <input type="file" id="SRC_Data_File_File" accept=".sql,.xlsx,.csv,.txt" hidden />
            <button type="button" id="browseSrc" class="secondary">Browse…</button>
          </div>
          <div class="muted" id="SRC_File_Info"></div>
        </div>
        <div class="col-6"><label>TGT_Data_File</label>
          <div class="row">
            <input class="grow" type="text" id="TGT_Data_File" placeholder="ex: Sample_TGT.sql/.xlsx/.csv" />
            <input type="file" id="TGT_Data_File_File" accept=".sql,.xlsx,.csv,.txt" hidden />
            <button type="button" id="browseTgt" class="secondary">Browse…</button>
          </div>
          <div class="muted" id="TGT_File_Info"></div>
        </div>
        <div class="col-4 csv-only"><label>Delimiter</label><input type="text" id="Delimiter" placeholder="," /></div>

        <div class="section-title"><span class="bar"></span>Keys & Thresholds</div>
        <div class="col-6"><label>pk_columns</label><input type="text" id="pk_columns" placeholder="['ID']" /></div>
        <div class="col-6"><label>Date_Fields</label><input type="text" id="Date_Fields" placeholder='["Date1","Date2"]' /></div>
        <div class="col-6"><label>Percentage_Fields</label><input type="text" id="Percentage_Fields" placeholder='["% Field 1"]' /></div>
        <div class="col-6"><label>Threshold_Percentage</label><input type="text" id="Threshold_Percentage" placeholder="0" /></div>

        <div class="section-title excel-only"><span class="bar"></span>Excel Options</div>
        <div class="col-6 excel-only"><label>src_sheet_name</label><input type="text" id="src_sheet_name" placeholder="Required when Excel" /></div>
        <div class="col-6 excel-only"><label>tgt_sheet_name</label><input type="text" id="tgt_sheet_name" placeholder="Required when Excel" /></div>
        <div class="col-6 excel-only"><label>header_columns</label><input type="text" id="header_columns" placeholder='Required when Excel e.g. ["Col1","Col2"]' /></div>
        <div class="col-6 excel-only"><label>skip_rows</label><input type="text" id="skip_rows" placeholder="Required when Excel e.g. Default or [0,1]" /></div>

        <div class="section-title"><span class="bar"></span>Filters</div>
        <div class="col-12"><label>Filters</label><textarea id="Filters" placeholder="WHERE-like filters or JSON"></textarea></div>
      </div>
      <div class="actions">
        <button id="saveTc" class="primary">${state.editingTestId ? 'Update' : 'Save Test Case'}</button>
        <button id="resetTc" class="secondary">Reset</button>
        <button id="gotoList" class="secondary">Go to All Test Cases</button>
      </div>
    </section>`);

    // populate dropdowns
    const srcSel = card.querySelector('#SRC_Connection');
    const tgtSel = card.querySelector('#TGT_Connection');
    const builtins = ['Excel','CSV'];
    const connIds = Array.from(new Set([...builtins, ...state.connections.map(c => c.Project).filter(Boolean)]));
    const opts = (names) => names.map(n => `<option value="${n}">${n}</option>`).join('');
    srcSel.innerHTML = `<option value="">Select...</option>` + opts(connIds);
    tgtSel.innerHTML = `<option value="">Select...</option>` + opts(connIds);

    // set values if editing
    if (state.editingTestId) {
      const tc = state.testcases.find(t => t._id === state.editingTestId);
      if (tc) {
        TESTCASE_HEADERS.forEach(h => {
          const input = card.querySelector('#' + h);
          if (!input) return;
          const val = tc[h] ?? '';
          if (input.tagName === 'SELECT') input.value = String(val);
          else input.value = String(val);
        });
      }
    }

    // Excel-specific requirement visual cue
    const reqIds = ['src_sheet_name','tgt_sheet_name','header_columns','skip_rows'];
    const reqInputs = reqIds.map(id => card.querySelector('#' + id));
    const excelBlocks = Array.from(card.querySelectorAll('.excel-only'));
    const csvBlocks = Array.from(card.querySelectorAll('.csv-only'));
    function isExcel(val) { return String(val || '').trim().toLowerCase() === 'excel'; }
    function isCSV(val) { return String(val || '').trim().toLowerCase() === 'csv'; }
    function excelMode() { return isExcel(srcSel.value) || isExcel(tgtSel.value); }
    function csvMode() { return isCSV(srcSel.value) || isCSV(tgtSel.value); }
    function updateDynamicFields() {
      const onExcel = excelMode();
      const onCsv = csvMode();
      excelBlocks.forEach(block => { block.style.display = onExcel ? '' : 'none'; });
      csvBlocks.forEach(block => { block.style.display = onCsv ? '' : 'none'; });
      reqInputs.forEach(inp => { if (!inp) return; inp.required = onExcel; inp.style.borderColor = onExcel ? 'var(--blue-400)' : ''; });
    }
    srcSel.addEventListener('change', updateDynamicFields);
    tgtSel.addEventListener('change', updateDynamicFields);
    updateDynamicFields();

    // file browse handlers: populate file name only (no upload)
    const srcFile = card.querySelector('#SRC_Data_File_File');
    const tgtFile = card.querySelector('#TGT_Data_File_File');
    const srcName = card.querySelector('#SRC_Data_File');
    const tgtName = card.querySelector('#TGT_Data_File');
    const srcInfo = card.querySelector('#SRC_File_Info');
    const tgtInfo = card.querySelector('#TGT_File_Info');
    card.querySelector('#browseSrc').addEventListener('click', () => srcFile.click());
    card.querySelector('#browseTgt').addEventListener('click', () => tgtFile.click());
    function humanSize(bytes){ if(!bytes&&bytes!==0) return ''; const u=['B','KB','MB','GB']; let i=0; let b=bytes; while(b>=1024&&i<u.length-1){b/=1024;i++;} return b.toFixed(1)+' '+u[i]; }
    srcFile.addEventListener('change', () => {
      const f = srcFile.files && srcFile.files[0];
      if (!f) return;
      srcName.value = f.name;
      srcInfo.textContent = `${f.type || 'file'} • ${humanSize(f.size)}`;
    });
    tgtFile.addEventListener('change', () => {
      const f = tgtFile.files && tgtFile.files[0];
      if (!f) return;
      tgtName.value = f.name;
      tgtInfo.textContent = `${f.type || 'file'} • ${humanSize(f.size)}`;
    });

    // handlers
    card.querySelector('#saveTc').addEventListener('click', () => {
      const newTc = { _id: state.editingTestId || uid() };
      TESTCASE_HEADERS.forEach(h => {
        const node = document.querySelector('#' + h);
        newTc[h] = node && node.type === 'checkbox' ? node.checked : valueOf('#' + h);
      });

      const problems = validateTestCase(newTc);
      if (problems.length) {
        alert('Please fix:\n- ' + problems.join('\n- '));
        return;
      }

      const idx = state.testcases.findIndex(t => t._id === newTc._id);
      if (idx >= 0) state.testcases[idx] = newTc; else state.testcases.push(newTc);
      state.editingTestId = null;
      persist();
      alert('Saved.');
      navigate(VIEWS.TESTCASES);
    });

    card.querySelector('#resetTc').addEventListener('click', () => {
      state.editingTestId = null; render();
    });
    card.querySelector('#gotoList').addEventListener('click', () => navigate(VIEWS.TESTCASES));

    return card;
  }

  function valueOf(sel) { return (document.querySelector(sel)?.value || '').trim(); }

  function validateTestCase(tc) {
    const errs = [];
    if (!tc.TCName) errs.push('TCName is required');
    if (!tc.SRC_Connection) errs.push('SRC_Connection is required');
    if (!tc.TGT_Connection) errs.push('TGT_Connection is required');
    const isExcel = (v) => String(v || '').trim().toLowerCase() === 'excel';
    if (isExcel(tc.SRC_Connection) || isExcel(tc.TGT_Connection)) {
      if (!tc.src_sheet_name) errs.push('src_sheet_name is required when SRC_Connection or TGT_Connection is Excel');
      if (!tc.tgt_sheet_name) errs.push('tgt_sheet_name is required when SRC_Connection or TGT_Connection is Excel');
      if (!tc.header_columns) errs.push('header_columns is required when SRC_Connection or TGT_Connection is Excel');
      if (!tc.skip_rows) errs.push('skip_rows is required when SRC_Connection or TGT_Connection is Excel');
    }
    return errs;
  }

  function viewAllTestCases() {
    const wrapper = el(`<section class="card">
      <div class="toolbar">
        <input id="tcSearch" type="text" placeholder="Search name, id, connection..." />
        <span class="muted">${state.testcases.length} total</span>
        <span class="spacer"></span>
        <button id="addNew" class="primary">+ New</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>TCID</th>
              <th>TCName</th>
              <th>Table</th>
              <th>Test_Type</th>
              <th>Test_YN</th>
              <th>SRC_Connection</th>
              <th>TGT_Connection</th>
              <th style="width:160px">Actions</th>
            </tr>
          </thead>
          <tbody id="tcRows"></tbody>
        </table>
      </div>
    </section>`);

    const rows = wrapper.querySelector('#tcRows');

    function renderRows(filter = '') {
      const q = filter.toLowerCase();
      const filtered = state.testcases.filter(t => {
        return [t.TCID, t.TCName, t.Table, t.Test_Type, t.Test_YN, t.SRC_Connection, t.TGT_Connection]
          .some(v => String(v || '').toLowerCase().includes(q));
      });
      rows.innerHTML = filtered.map(t => `
        <tr>
          <td>${t.TCID || ''}</td>
          <td>${t.TCName || ''}</td>
          <td>${t.Table || ''}</td>
          <td><span class="pill">${t.Test_Type || ''}</span></td>
          <td>${t.Test_YN || ''}</td>
          <td>${t.SRC_Connection || ''}</td>
          <td>${t.TGT_Connection || ''}</td>
          <td>
            <button data-act="edit" data-id="${t._id}" class="secondary">Edit</button>
            <button data-act="delete" data-id="${t._id}" class="secondary">Delete</button>
          </td>
        </tr>
      `).join('');
    }

    renderRows('');

    wrapper.querySelector('#tcSearch').addEventListener('input', (e) => {
      renderRows(e.target.value);
    });

    wrapper.querySelector('#addNew').addEventListener('click', () => navigate(VIEWS.NEW));

    rows.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.act === 'edit') {
        state.editingTestId = id;
        navigate(VIEWS.NEW);
      } else if (btn.dataset.act === 'delete') {
        if (confirm('Delete this test case?')) {
          state.testcases = state.testcases.filter(t => t._id !== id);
          persist();
          renderRows(document.getElementById('tcSearch').value || '');
        }
      }
    });

    return wrapper;
  }

  function viewConnections() {
    const wrapper = el(`<section class="card">
      <h2 style="margin-top:0">Connections</h2>
      <div class="grid">
        <div class="col-3"><label>Project</label><input id="c_Project" type="text" placeholder="ex: MJA_QE" /></div>
        <div class="col-3"><label>Server</label><input id="c_Server" type="text" placeholder="host/account" /></div>
        <div class="col-3"><label>Database</label><input id="c_Database" type="text" placeholder="db/schema" /></div>
        <div class="col-3"><label>Warehouse</label><input id="c_Warehouse" type="text" placeholder="warehouse (Snowflake)" /></div>
        <div class="col-3"><label>Role</label><input id="c_Role" type="text" placeholder="role" /></div>
        <div class="col-3"><label>&nbsp;</label><button id="addConn" class="primary" style="width:100%">Add / Update</button></div>
      </div>
      <p class="muted">Passwords are not stored here. Use secure secrets in your framework.</p>
      <table>
        <thead>
          <tr><th>Project</th><th>Server</th><th>Database</th><th>Warehouse</th><th>Role</th><th style="width:140px">Actions</th></tr>
        </thead>
        <tbody id="connRows"></tbody>
      </table>
    </section>`);

    const rows = wrapper.querySelector('#connRows');

    function paint() {
      rows.innerHTML = state.connections.map(c => `
        <tr>
          <td>${c.Project || ''}</td>
          <td>${c.Server || ''}</td>
          <td>${c.Database || ''}</td>
          <td>${c.Warehouse || ''}</td>
          <td>${c.Role || ''}</td>
          <td>
            <button data-act="edit" data-name="${c.Project}" class="secondary">Edit</button>
            <button data-act="delete" data-name="${c.Project}" class="secondary">Delete</button>
          </td>
        </tr>
      `).join('');
    }

    paint();

    wrapper.querySelector('#addConn').addEventListener('click', () => {
      const c = {
        Project: valueOf('#c_Project'),
        Server: valueOf('#c_Server'),
        Database: valueOf('#c_Database'),
        Warehouse: valueOf('#c_Warehouse'),
        Role: valueOf('#c_Role'),
      };
      if (!c.Project) { alert('Project is required'); return; }
      const idx = state.connections.findIndex(x => x.Project === c.Project);
      if (idx >= 0) state.connections[idx] = c; else state.connections.push(c);
      persist();
      paint();
      alert('Connection saved.');
    });

    rows.addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const name = btn.dataset.name;
      if (btn.dataset.act === 'delete') {
        if (confirm('Delete connection ' + name + '?')) {
          state.connections = state.connections.filter(c => c.Project !== name);
          persist();
          paint();
        }
      } else if (btn.dataset.act === 'edit') {
        const c = state.connections.find(x => x.Project === name);
        if (!c) return;
        wrapper.querySelector('#c_Project').value = c.Project || '';
        wrapper.querySelector('#c_Server').value = c.Server || '';
        wrapper.querySelector('#c_Database').value = c.Database || '';
        wrapper.querySelector('#c_Warehouse').value = c.Warehouse || '';
        wrapper.querySelector('#c_Role').value = c.Role || '';
      }
    });

    return wrapper;
  }

  // ---------- Navigation ----------
  function navigate(view) {
    state.view = view;
    window.location.hash = '#' + view;
    render();
  }

  function initNav() {
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.addEventListener('click', () => navigate(b.dataset.view));
    });
    window.addEventListener('hashchange', () => {
      const v = window.location.hash.replace('#', '') || VIEWS.NEW;
      state.view = Object.values(VIEWS).includes(v) ? v : VIEWS.NEW;
      render();
    });
  }

  // ---------- Import/Export ----------
  // headers already defined above to match Excel

  function detectCsvType(headers) {
    const hset = new Set(headers.map(h => h.toLowerCase().trim()));
    const hasTc = TESTCASE_HEADERS.every(h => hset.has(String(h).toLowerCase()));
    const hasConn = CONNECTION_HEADERS.every(h => hset.has(String(h).toLowerCase()));
    if (hasTc) return 'testcases';
    if (hasConn) return 'connections';
    return 'unknown';
  }

  function importCsv(text) {
    const rows = parseCSV(text);
    if (!rows.length) { alert('CSV appears empty'); return; }
    const headers = rows[0].map(h => h.trim());
    const type = detectCsvType(headers);
    if (type === 'unknown') {
      alert('Unrecognized CSV headers. Expected either test case or connection headers.');
      return;
    }
    const idx = Object.fromEntries(headers.map((h, i) => [h.toLowerCase(), i]));

    if (type === 'testcases') {
      const out = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]; if (row.length === 1 && row[0] === '') continue;
        const rec = Object.create(null);
        TESTCASE_HEADERS.forEach(h => rec[h] = row[idx[h]] ?? '');
        out.push(Object.assign({_id: uid()}, rec));
      }
      if (!out.length) { alert('No test cases found in CSV.'); return; }
      if (confirm(`Import ${out.length} test cases? This will append to existing.`)) {
        state.testcases.push(...out);
        persist();
        alert(`Imported ${out.length} test cases.`);
        if (state.view !== VIEWS.TESTCASES) navigate(VIEWS.TESTCASES); else render();
      }
    } else {
      const out = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]; if (row.length === 1 && row[0] === '') continue;
        const rec = Object.create(null);
        CONNECTION_HEADERS.forEach(h => rec[h] = row[idx[h]] ?? '');
        out.push(rec);
      }
      if (!out.length) { alert('No connections found in CSV.'); return; }
      if (confirm(`Import ${out.length} connections? Existing with same name will be replaced.`)) {
        const byName = new Map(state.connections.map(c => [c.Project, c]));
        out.forEach(c => byName.set(c.Project, c));
        state.connections = Array.from(byName.values());
        persist();
        alert(`Imported ${out.length} connections.`);
        if (state.view !== VIEWS.CONNECTIONS) navigate(VIEWS.CONNECTIONS); else render();
      }
    }
  }

  function exportCurrentViewCsv() {
    if (state.view === VIEWS.CONNECTIONS) {
      if (!state.connections.length) { alert('No connections to export'); return; }
      const csv = toCSV(CONNECTION_HEADERS, state.connections);
      download('connections.csv', csv, 'text/csv');
      return;
    }
    // default to exporting test cases
    if (!state.testcases.length) { alert('No test cases to export'); return; }
    const rows = state.testcases.map(t => {
      const o = {};
      TESTCASE_HEADERS.forEach(h => o[h] = t[h] ?? '');
      return o;
    });
    const csv = toCSV(TESTCASE_HEADERS, rows);
    download('testcases.csv', csv, 'text/csv');
  }

  function initImportExport() {
    const importBtn = document.getElementById('importBtn');
    const exportBtn = document.getElementById('exportBtn');
    const fileInput = document.getElementById('fileInput');

    importBtn.addEventListener('click', () => fileInput.click());
    exportBtn.addEventListener('click', exportCurrentViewCsv);
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      importCsv(text);
      fileInput.value = '';
    });
  }

  // ---------- Boot ----------
  function boot() {
    loadState();
    initNav();
    initImportExport();
    const start = window.location.hash.replace('#', '') || VIEWS.NEW;
    state.view = Object.values(VIEWS).includes(start) ? start : VIEWS.NEW;
    render();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
