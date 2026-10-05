"""
racks_handler.py — Manages the racks_management file via the Google Sheets API.

On first load the handler detects whether the Drive file is a native Sheets file
or a legacy .xlsx and migrates it automatically (download → convert → delete old).
All reads and writes go directly through the Sheets API — no full-file
download/upload on every operation.
"""
from collections import defaultdict

from google_drive_handler import GoogleDriveHandler

FILENAME = 'racks_management'
HEADERS  = ['Bay Code', 'Size Preferable', 'Actual Size', 'Quantity', 'Quantity Unit',
            'Item Type', 'Dimensions', 'Status', 'Next Location', 'Notes', 'Customer']

STOCK_SHEET   = '_stock_'
STOCK_HEADERS = ['Size', 'Item Type', 'Dimensions', 'Min On Hand', 'Max On Hand']

CFG_TYPES_SHEET     = '_cfg_types_'
CFG_DIMS_SHEET      = '_cfg_dims_'
CFG_UNITS_SHEET     = '_cfg_units_'
CFG_STATUSES_SHEET  = '_cfg_statuses_'
CFG_NEXT_LOCS_SHEET = '_cfg_next_locs_'
CFG_NOTES_SHEET     = '_cfg_notes_'
CFG_CUSTOMERS_SHEET = '_cfg_customers_'

CFG_TYPES_HEADERS = ['Name']
CFG_DIMS_HEADERS  = ['Type', 'Thickness', 'Width']
CFG_UNITS_HEADERS = ['Name', 'Length', 'Width', 'Height']

DEFAULT_TYPES = ['Bearers', 'Boards', 'Blocks']
DEFAULT_DIMS  = [
    ('Bearers', 'All Dimensions', ''), ('Bearers', 'Low Profile', ''), ('Bearers', 'Mixed', ''),
    ('Bearers', 'Noched', ''),         ('Bearers', 'Square', ''),      ('Bearers', 'Standard', ''),
    ('Boards', 'All Dimensions', ''),
    ('Boards', '12-15', '65-85'),  ('Boards', '16-19', '65-85'),  ('Boards', '20-23', '65-85'),  ('Boards', '25', '65-85'),
    ('Boards', '12-15', '85-105'), ('Boards', '16-19', '85-105'), ('Boards', '20-23', '85-105'), ('Boards', '25', '85-105'),
    ('Boards', '12-15', '105-125'),('Boards', '16-19', '105-125'),('Boards', '20-23', '105-125'),('Boards', '25', '105-125'),
    ('Boards', '12-15', '125-145'),('Boards', '16-19', '125-145'),('Boards', '20-23', '125-145'),('Boards', '25', '125-145'),
    ('Boards', 'Narrow Mixed', ''), ('Boards', 'Standard Mixed', ''), ('Boards', 'Heavy Mixed', ''), ('Boards', 'Mixed', ''),
    ('Blocks', 'All Dimensions', ''), ('Blocks', '100x75', ''), ('Blocks', '100x100', ''),
]
DEFAULT_UNITS = [
    ('box', '', '', ''), ('pc', '', '', ''), ('pallet', '', '', ''), ('Stillage', '', '', ''),
]

SHEETS_MIME = 'application/vnd.google-apps.spreadsheet'


class RacksHandler:

    def __init__(self, schedule_file_id: str | None = None):
        self.gdrive      = GoogleDriveHandler()
        self._folder_id  = self._resolve_folder(schedule_file_id)
        self.file_id     = None
        self._sheets: dict[str, int] = {}  # sheet title → sheetId

    def _resolve_folder(self, schedule_file_id: str | None) -> str | None:
        if not schedule_file_id:
            return None
        meta = self.gdrive.get_file_metadata(schedule_file_id)
        if meta and meta.get('parents'):
            return meta['parents'][0]
        return None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def load(self):
        """Resolve the Sheets file (migrate from xlsx if needed), cache sheet list."""
        file_id = self.gdrive.get_file_id_by_name(FILENAME, self._folder_id)
        if file_id:
            mime = self.gdrive.get_file_mime_type(file_id)
            if mime == SHEETS_MIME:
                self.file_id = file_id
            else:
                print(f"  Migrating '{FILENAME}' xlsx → native Sheets…")
                self.file_id = self._migrate_xlsx_to_sheets(file_id)
                print(f"  Migration done — id={self.file_id}")
        else:
            self.file_id = self._create_new_sheets_file()
            print(f"  Created '{FILENAME}' — id={self.file_id}")
        self._refresh_sheet_cache()

    def close(self):
        pass  # no-op — no workbook to close

    def _migrate_xlsx_to_sheets(self, old_file_id: str) -> str:
        buf    = self.gdrive.download_file(old_file_id)
        new_id = self.gdrive.create_sheets_file(FILENAME, buf, folder_id=self._folder_id)
        self.gdrive.delete_file(old_file_id)
        return new_id

    def _create_new_sheets_file(self) -> str:
        result = self._ss().create(body={
            'properties': {'title': FILENAME},
            'sheets':     [{'properties': {'title': '_placeholder_'}}],
        }).execute()
        fid = result['spreadsheetId']
        if self._folder_id:
            self.gdrive.service.files().update(
                fileId=fid,
                addParents=self._folder_id,
                removeParents='root',
                fields='id,parents',
                supportsAllDrives=True,
            ).execute()
        return fid

    # ------------------------------------------------------------------
    # Sheet cache
    # ------------------------------------------------------------------

    def _refresh_sheet_cache(self):
        result = self._ss().get(
            spreadsheetId=self.file_id,
            fields='sheets.properties(sheetId,title)',
        ).execute()
        self._sheets = {
            s['properties']['title']: s['properties']['sheetId']
            for s in result.get('sheets', [])
        }

    # ------------------------------------------------------------------
    # Low-level Sheets helpers
    # ------------------------------------------------------------------

    def _ss(self):
        return self.gdrive.sheets_service.spreadsheets()

    def _get_values(self, sheet_name: str, range_str: str) -> list:
        result = self._ss().values().get(
            spreadsheetId=self.file_id,
            range=f"'{sheet_name}'!{range_str}",
        ).execute()
        return result.get('values', [])

    def _set_values(self, sheet_name: str, range_str: str, values: list):
        if not values:
            return
        self._ss().values().update(
            spreadsheetId=self.file_id,
            range=f"'{sheet_name}'!{range_str}",
            valueInputOption='RAW',
            body={'values': values},
        ).execute()

    def _clear_range(self, sheet_name: str, range_str: str):
        self._ss().values().clear(
            spreadsheetId=self.file_id,
            range=f"'{sheet_name}'!{range_str}",
        ).execute()

    def _append_rows(self, sheet_name: str, values: list):
        self._ss().values().append(
            spreadsheetId=self.file_id,
            range=f"'{sheet_name}'!A:A",
            valueInputOption='RAW',
            insertDataOption='INSERT_ROWS',
            body={'values': values},
        ).execute()

    def _find_row(self, sheet_name: str, col_letter: str, value: str, start_row: int = 2) -> int | None:
        """Return the 1-based Sheets row number of the first matching cell, or None."""
        rows = self._get_values(sheet_name, f'{col_letter}:{col_letter}')
        for i, row in enumerate(rows):
            sheet_row = i + 1
            if sheet_row < start_row:
                continue
            if row and str(row[0]).strip().lower() == str(value).strip().lower():
                return sheet_row
        return None

    def _delete_sheet_row(self, sheet_name: str, sheet_row: int):
        self._ss().batchUpdate(
            spreadsheetId=self.file_id,
            body={'requests': [{
                'deleteDimension': {
                    'range': {
                        'sheetId':    self._sheets[sheet_name],
                        'dimension':  'ROWS',
                        'startIndex': sheet_row - 1,
                        'endIndex':   sheet_row,
                    }
                }
            }]},
        ).execute()

    def _add_sheet(self, title: str):
        self._ss().batchUpdate(
            spreadsheetId=self.file_id,
            body={'requests': [{'addSheet': {'properties': {'title': title}}}]},
        ).execute()
        self._refresh_sheet_cache()

    def _delete_sheet(self, title: str):
        if title not in self._sheets:
            return
        self._ss().batchUpdate(
            spreadsheetId=self.file_id,
            body={'requests': [{'deleteSheet': {'sheetId': self._sheets[title]}}]},
        ).execute()
        self._refresh_sheet_cache()

    def _ensure_sheet(self, name: str, headers: list, defaults: list | None = None):
        if name not in self._sheets:
            self._add_sheet(name)
            self._set_values(name, 'A1', [headers])
            if defaults:
                rows = [list(d) if not isinstance(d, str) else [d] for d in defaults]
                self._set_values(name, 'A2', rows)

    # ------------------------------------------------------------------
    # Locations
    # ------------------------------------------------------------------

    def get_locations(self) -> list[str]:
        return [t for t in self._sheets if not t.startswith('_')]

    def add_location(self, name: str) -> list[str]:
        name = name.strip()
        if not name:
            raise ValueError('Location name cannot be empty')
        if name in self._sheets:
            raise ValueError(f"Location '{name}' already exists")
        self._add_sheet(name)
        self._set_values(name, 'A1', [HEADERS])
        if '_placeholder_' in self._sheets:
            self._delete_sheet('_placeholder_')
        return self.get_locations()

    # ------------------------------------------------------------------
    # Racks
    # ------------------------------------------------------------------

    def get_racks(self) -> list[dict]:
        racks = []
        for loc in self.get_locations():
            for row in self._get_values(loc, 'A2:K'):
                if not any(row):
                    continue
                def g(i, r=row): return str(r[i]).strip() if len(r) > i else ''
                racks.append({
                    'location':        loc,
                    'bay_code':        g(0),
                    'size_preferable': g(1),
                    'actual_size':     g(2),
                    'quantity':        g(3),
                    'qty_unit':        g(4),
                    'item_type':       g(5),
                    'item_subtype':    g(6),
                    'status':          g(7),
                    'next_location':   g(8),
                    'notes':           g(9),
                    'customer':        g(10),
                })
        return racks

    def save_racks(self, racks: list[dict]):
        by_location: dict[str, list] = defaultdict(list)
        for rack in racks:
            loc = rack.get('location', '').strip()
            if loc:
                by_location[loc].append(rack)

        for loc in self.get_locations():
            self._clear_range(loc, 'A2:K')
            rows = [[
                r.get('bay_code', ''),        r.get('size_preferable', ''),
                r.get('actual_size', ''),      r.get('quantity', ''),
                r.get('qty_unit', ''),         r.get('item_type', ''),
                r.get('item_subtype', ''),     r.get('status', ''),
                r.get('next_location', ''),    r.get('notes', ''),
                r.get('customer', ''),
            ] for r in by_location.get(loc, [])]
            if rows:
                self._set_values(loc, 'A2', rows)

    # ------------------------------------------------------------------
    # Stock
    # ------------------------------------------------------------------

    def get_stock(self, racks: list[dict] | None = None) -> list[dict]:
        self._ensure_sheet(STOCK_SHEET, STOCK_HEADERS)
        if racks is None:
            racks = self.get_racks()
        items = []
        for row in self._get_values(STOCK_SHEET, 'A2:E'):
            if not any(row):
                continue
            def g(i, r=row): return str(r[i]).strip() if len(r) > i else ''
            size, item_type, dimensions = g(0), g(1), g(2)
            if dimensions == 'All Dimensions':
                qty = sum(float(r['quantity']) for r in racks
                          if r['actual_size'] == size and r['item_type'] == item_type and r['quantity'])
            else:
                qty = sum(float(r['quantity']) for r in racks
                          if r['actual_size'] == size and r['item_type'] == item_type
                          and r['item_subtype'] == dimensions and r['quantity'])
            items.append({
                'size': size, 'item_type': item_type, 'dimensions': dimensions,
                'qty_on_hand': qty, 'min_on_hand': g(3), 'max_on_hand': g(4),
            })
        return items

    def save_stock(self, items: list[dict]):
        self._ensure_sheet(STOCK_SHEET, STOCK_HEADERS)
        self._clear_range(STOCK_SHEET, 'A2:E')
        if items:
            rows = [[i.get('size',''), i.get('item_type',''), i.get('dimensions',''),
                     i.get('min_on_hand',''), i.get('max_on_hand','')] for i in items]
            self._set_values(STOCK_SHEET, 'A2', rows)

    # ------------------------------------------------------------------
    # Config — seeding
    # ------------------------------------------------------------------

    def needs_config_seed(self) -> bool:
        required = [CFG_TYPES_SHEET, CFG_DIMS_SHEET, CFG_UNITS_SHEET,
                    CFG_STATUSES_SHEET, CFG_NEXT_LOCS_SHEET, CFG_NOTES_SHEET, CFG_CUSTOMERS_SHEET]
        return any(s not in self._sheets for s in required)

    def seed_config_if_needed(self) -> bool:
        if not self.needs_config_seed():
            return False
        all_cfg = [
            (CFG_TYPES_SHEET,     CFG_TYPES_HEADERS, DEFAULT_TYPES),
            (CFG_DIMS_SHEET,      CFG_DIMS_HEADERS,  DEFAULT_DIMS),
            (CFG_UNITS_SHEET,     CFG_UNITS_HEADERS, DEFAULT_UNITS),
            (CFG_STATUSES_SHEET,  ['Name'], None),
            (CFG_NEXT_LOCS_SHEET, ['Name'], None),
            (CFG_NOTES_SHEET,     ['Name'], None),
            (CFG_CUSTOMERS_SHEET, ['Name'], None),
        ]
        missing = [name for name, _, _ in all_cfg if name not in self._sheets]
        if missing:
            self._ss().batchUpdate(
                spreadsheetId=self.file_id,
                body={'requests': [
                    {'addSheet': {'properties': {'title': t}}} for t in missing
                ]},
            ).execute()
            self._refresh_sheet_cache()
        for name, headers, defaults in all_cfg:
            if name in missing:
                self._set_values(name, 'A1', [headers])
                if defaults:
                    rows = [list(d) if not isinstance(d, str) else [d] for d in defaults]
                    self._set_values(name, 'A2', rows)
        return True

    def get_all_config(self) -> dict:
        """Read all 7 config sheets in one batchGet API call."""
        cfg_ranges = [
            (CFG_TYPES_SHEET,     'A2:A'),
            (CFG_DIMS_SHEET,      'A2:C'),
            (CFG_UNITS_SHEET,     'A2:D'),
            (CFG_STATUSES_SHEET,  'A2:A'),
            (CFG_NEXT_LOCS_SHEET, 'A2:A'),
            (CFG_NOTES_SHEET,     'A2:A'),
            (CFG_CUSTOMERS_SHEET, 'A2:A'),
        ]
        ranges = [f"'{s}'!{r}" for s, r in cfg_ranges]
        result = self._ss().values().batchGet(
            spreadsheetId=self.file_id,
            ranges=ranges,
        ).execute()
        vrs = result.get('valueRanges', [])

        def rows(i):
            return vrs[i].get('values', []) if i < len(vrs) else []

        def g(r, i): return str(r[i]).strip() if len(r) > i else ''

        types = [r[0].strip() for r in rows(0) if r and r[0]]

        dims = []
        for row in rows(1):
            if any(row):
                dims.append({'type': g(row, 0), 'thickness': g(row, 1), 'width': g(row, 2)})

        units = []
        for row in rows(2):
            if any(row):
                units.append({'name': g(row, 0), 'length': g(row, 1), 'width': g(row, 2), 'height': g(row, 3)})

        statuses       = [r[0].strip() for r in rows(3) if r and r[0]]
        next_locations = [r[0].strip() for r in rows(4) if r and r[0]]
        notes          = [r[0].strip() for r in rows(5) if r and r[0]]
        customers      = [r[0].strip() for r in rows(6) if r and r[0]]

        return {
            'types': types, 'dimensions': dims, 'units': units,
            'statuses': statuses, 'next_locations': next_locations,
            'notes': notes, 'customers': customers,
        }

    # ------------------------------------------------------------------
    # Config — Types
    # ------------------------------------------------------------------

    def get_config_types(self) -> list[str]:
        self._ensure_sheet(CFG_TYPES_SHEET, CFG_TYPES_HEADERS)
        return [r[0].strip() for r in self._get_values(CFG_TYPES_SHEET, 'A2:A') if r and r[0]]

    def add_config_type(self, name: str) -> list[str]:
        name = name.strip()
        if not name:
            raise ValueError('Type name cannot be empty')
        self._ensure_sheet(CFG_TYPES_SHEET, CFG_TYPES_HEADERS)
        if any(t.lower() == name.lower() for t in self.get_config_types()):
            raise ValueError(f"Type '{name}' already exists")
        self._append_rows(CFG_TYPES_SHEET, [[name]])
        return self.get_config_types()

    def delete_config_type(self, name: str) -> list[str]:
        self._ensure_sheet(CFG_TYPES_SHEET, CFG_TYPES_HEADERS)
        row = self._find_row(CFG_TYPES_SHEET, 'A', name)
        if row:
            self._delete_sheet_row(CFG_TYPES_SHEET, row)
        return self.get_config_types()

    def update_config_type(self, old_name: str, new_name: str) -> list[str]:
        new_name = new_name.strip()
        if not new_name:
            raise ValueError('Type name cannot be empty')
        self._ensure_sheet(CFG_TYPES_SHEET, CFG_TYPES_HEADERS)
        row = self._find_row(CFG_TYPES_SHEET, 'A', old_name)
        if row:
            self._set_values(CFG_TYPES_SHEET, f'A{row}', [[new_name]])
        return self.get_config_types()

    # ------------------------------------------------------------------
    # Config — Dimensions
    # ------------------------------------------------------------------

    def get_config_dimensions(self) -> list[dict]:
        self._ensure_sheet(CFG_DIMS_SHEET, CFG_DIMS_HEADERS)
        dims = []
        for row in self._get_values(CFG_DIMS_SHEET, 'A2:C'):
            if not any(row):
                continue
            def g(i, r=row): return str(r[i]).strip() if len(r) > i else ''
            dims.append({'type': g(0), 'thickness': g(1), 'width': g(2)})
        return dims

    def add_config_dimension(self, type_name: str, thickness: str, width: str) -> list[dict]:
        type_name = type_name.strip()
        thickness = thickness.strip()
        if not type_name or not thickness:
            raise ValueError('Type and thickness are required')
        self._ensure_sheet(CFG_DIMS_SHEET, CFG_DIMS_HEADERS)
        self._append_rows(CFG_DIMS_SHEET, [[type_name, thickness, width.strip()]])
        return self.get_config_dimensions()

    def delete_config_dimension(self, type_name: str, thickness: str, width: str) -> list[dict]:
        self._ensure_sheet(CFG_DIMS_SHEET, CFG_DIMS_HEADERS)
        for i, row in enumerate(self._get_values(CFG_DIMS_SHEET, 'A:C')):
            sheet_row = i + 1
            if sheet_row < 2:
                continue
            def g(j, r=row): return str(r[j]).strip() if len(r) > j else ''
            if (g(0).lower() == type_name.strip().lower()
                    and g(1) == thickness.strip() and g(2) == width.strip()):
                self._delete_sheet_row(CFG_DIMS_SHEET, sheet_row)
                break
        return self.get_config_dimensions()

    def update_config_dimension(self, old_type: str, old_thickness: str, old_width: str,
                                new_type: str, new_thickness: str, new_width: str) -> list[dict]:
        new_type = new_type.strip()
        new_thickness = new_thickness.strip()
        if not new_type or not new_thickness:
            raise ValueError('Type and thickness are required')
        self._ensure_sheet(CFG_DIMS_SHEET, CFG_DIMS_HEADERS)
        for i, row in enumerate(self._get_values(CFG_DIMS_SHEET, 'A:C')):
            sheet_row = i + 1
            if sheet_row < 2:
                continue
            def g(j, r=row): return str(r[j]).strip() if len(r) > j else ''
            if (g(0).lower() == old_type.strip().lower()
                    and g(1) == old_thickness.strip() and g(2) == old_width.strip()):
                self._set_values(CFG_DIMS_SHEET, f'A{sheet_row}',
                                 [[new_type, new_thickness, new_width.strip()]])
                break
        return self.get_config_dimensions()

    # ------------------------------------------------------------------
    # Config — Units
    # ------------------------------------------------------------------

    def get_config_units(self) -> list[dict]:
        self._ensure_sheet(CFG_UNITS_SHEET, CFG_UNITS_HEADERS)
        units = []
        for row in self._get_values(CFG_UNITS_SHEET, 'A2:D'):
            if not any(row):
                continue
            def g(i, r=row): return str(r[i]).strip() if len(r) > i else ''
            units.append({'name': g(0), 'length': g(1), 'width': g(2), 'height': g(3)})
        return units

    def add_config_unit(self, name: str, length: str, width: str, height: str) -> list[dict]:
        name = name.strip()
        if not name:
            raise ValueError('Unit name cannot be empty')
        self._ensure_sheet(CFG_UNITS_SHEET, CFG_UNITS_HEADERS)
        if any(u['name'].lower() == name.lower() for u in self.get_config_units()):
            raise ValueError(f"Unit '{name}' already exists")
        self._append_rows(CFG_UNITS_SHEET, [[name, length.strip(), width.strip(), height.strip()]])
        return self.get_config_units()

    def delete_config_unit(self, name: str) -> list[dict]:
        self._ensure_sheet(CFG_UNITS_SHEET, CFG_UNITS_HEADERS)
        row = self._find_row(CFG_UNITS_SHEET, 'A', name)
        if row:
            self._delete_sheet_row(CFG_UNITS_SHEET, row)
        return self.get_config_units()

    def update_config_unit(self, old_name: str, new_name: str,
                           length: str, width: str, height: str) -> list[dict]:
        new_name = new_name.strip()
        if not new_name:
            raise ValueError('Unit name cannot be empty')
        self._ensure_sheet(CFG_UNITS_SHEET, CFG_UNITS_HEADERS)
        row = self._find_row(CFG_UNITS_SHEET, 'A', old_name)
        if row:
            self._set_values(CFG_UNITS_SHEET, f'A{row}',
                             [[new_name, length.strip(), width.strip(), height.strip()]])
        return self.get_config_units()

    # ------------------------------------------------------------------
    # Config — generic simple-name list helpers
    # ------------------------------------------------------------------

    def _get_simple_list(self, sheet_name: str) -> list[str]:
        self._ensure_sheet(sheet_name, ['Name'])
        return [r[0].strip() for r in self._get_values(sheet_name, 'A2:A') if r and r[0]]

    def _add_simple_item(self, sheet_name: str, name: str) -> list[str]:
        name = name.strip()
        if not name:
            raise ValueError('Name cannot be empty')
        self._ensure_sheet(sheet_name, ['Name'])
        if any(x.lower() == name.lower() for x in self._get_simple_list(sheet_name)):
            raise ValueError(f"'{name}' already exists")
        self._append_rows(sheet_name, [[name]])
        return self._get_simple_list(sheet_name)

    def _delete_simple_item(self, sheet_name: str, name: str) -> list[str]:
        self._ensure_sheet(sheet_name, ['Name'])
        row = self._find_row(sheet_name, 'A', name)
        if row:
            self._delete_sheet_row(sheet_name, row)
        return self._get_simple_list(sheet_name)

    def _update_simple_item(self, sheet_name: str, old_name: str, new_name: str) -> list[str]:
        new_name = new_name.strip()
        if not new_name:
            raise ValueError('Name cannot be empty')
        self._ensure_sheet(sheet_name, ['Name'])
        row = self._find_row(sheet_name, 'A', old_name)
        if row:
            self._set_values(sheet_name, f'A{row}', [[new_name]])
        return self._get_simple_list(sheet_name)

    # Config — Statuses
    def get_config_statuses(self)                          -> list[str]: return self._get_simple_list(CFG_STATUSES_SHEET)
    def add_config_status(self, name)                      -> list[str]: return self._add_simple_item(CFG_STATUSES_SHEET, name)
    def delete_config_status(self, name)                   -> list[str]: return self._delete_simple_item(CFG_STATUSES_SHEET, name)
    def update_config_status(self, old, new)               -> list[str]: return self._update_simple_item(CFG_STATUSES_SHEET, old, new)

    # Config — Next Locations
    def get_config_next_locations(self)                    -> list[str]: return self._get_simple_list(CFG_NEXT_LOCS_SHEET)
    def add_config_next_location(self, name)               -> list[str]: return self._add_simple_item(CFG_NEXT_LOCS_SHEET, name)
    def delete_config_next_location(self, name)            -> list[str]: return self._delete_simple_item(CFG_NEXT_LOCS_SHEET, name)
    def update_config_next_location(self, old, new)        -> list[str]: return self._update_simple_item(CFG_NEXT_LOCS_SHEET, old, new)

    # Config — Notes
    def get_config_notes(self)                             -> list[str]: return self._get_simple_list(CFG_NOTES_SHEET)
    def add_config_note(self, name)                        -> list[str]: return self._add_simple_item(CFG_NOTES_SHEET, name)
    def delete_config_note(self, name)                     -> list[str]: return self._delete_simple_item(CFG_NOTES_SHEET, name)
    def update_config_note(self, old, new)                 -> list[str]: return self._update_simple_item(CFG_NOTES_SHEET, old, new)

    # Config — Customers
    def get_config_customers(self)                         -> list[str]: return self._get_simple_list(CFG_CUSTOMERS_SHEET)
    def add_config_customer(self, name)                    -> list[str]: return self._add_simple_item(CFG_CUSTOMERS_SHEET, name)
    def delete_config_customer(self, name)                 -> list[str]: return self._delete_simple_item(CFG_CUSTOMERS_SHEET, name)
    def update_config_customer(self, old, new)             -> list[str]: return self._update_simple_item(CFG_CUSTOMERS_SHEET, old, new)