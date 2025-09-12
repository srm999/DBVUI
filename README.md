TestQueryPairs Manager (Static UI)

Overview
- Simple, static web UI (HTML/CSS/JS) to manage TestQueryPairs and Connections.
- No backend required. Data persists in browser localStorage.
- CSV import/export supported for both Test Cases and Connections.
- Designed in blue & white; easy to extend and later connect to your DataQEsuite framework.

Files
- `index.html`: App entry with navigation for the three screens.
- `styles.css`: Blue/white theme and responsive layout.
- `app.js`: All app logic, routing, storage, CSV import/export.

Run
1. Open `index.html` in a browser (double‑click or via a simple server).
2. Use the header buttons to switch between:
   - New Test Case
   - All Test Cases
   - Connections
3. Data is stored in `localStorage` under keys `dq_testcases` and `dq_connections`.

CSV Import/Export
- Footer buttons let you Import CSV and Export CSV for the current view.
- For Excel files, save as CSV first (File → Save As → CSV) and then import.
- Recognized headers:

  Test Cases CSV (header row required; aligned to your Excel)
  - TCID
  - Table
  - Test_Type
  - TCName
  - Test_YN
  - SRC_Data_File
  - SRC_Connection
  - TGT_Data_File
  - TGT_Connection
  - Filters
  - Delimiter
  - pk_columns
  - Date_Fields
  - Percentage_Fields
  - Threshold_Percentage
  - src_sheet_name
  - tgt_sheet_name
  - header_columns
  - skip_rows

  Connections CSV (header row required; aligned to your Excel)
  - Project
  - Server
  - Database
  - Warehouse
  - Role

Extending / Integrating with DataQEsuite
- The UI is intentionally backend‑agnostic. To integrate:
  - Replace localStorage reads/writes with fetch calls to your API.
  - Keep the data shape consistent with the CSV headers for smooth import/export.
  - For secrets (passwords, tokens), use your framework’s secure storage; this UI does not store passwords.

Notes
- No external libraries are used. XLSX support (direct .xlsx import/export) can be added later via SheetJS or your preferred library if needed.
- The New Test Case form draws its connection names from the Connections screen.
  - SRC_Connection/TGT_Connection values map to the Connections sheet’s Project field.
  - If either SRC_Connection or TGT_Connection equals "Excel", the following fields become required: src_sheet_name, tgt_sheet_name, header_columns, skip_rows.
