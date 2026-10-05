"""
racks_handler.py — Manages the racks_management Google Drive file.

Each sheet tab in the workbook represents a location.
Bays are saved to the tab matching their selected location.
A hidden '_placeholder_' sheet keeps the workbook valid while no locations exist.
"""
import io
from collections import defaultdict

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

from google_drive_handler import GoogleDriveHandler

FILENAME      = 'racks_management'
HEADERS       = ['Bay Code', 'Size Preferable', 'Actual Size', 'Quantity', 'Quantity Unit', 'Item Type', 'Dimensions', 'Status', 'Next Location', 'Notes', 'Customer']
STOCK_SHEET   = '_stock_'
STOCK_HEADERS = ['Size', 'Item Type', 'Dimensions', 'Min On Hand', 'Max On Hand']

CFG_TYPES_SHEET      = '_cfg_types_'
CFG_DIMS_SHEET       = '_cfg_dims_'
CFG_UNITS_SHEET      = '_cfg_units_'
CFG_STATUSES_SHEET   = '_cfg_statuses_'
CFG_NEXT_LOCS_SHEET  = '_cfg_next_locs_'
CFG_NOTES_SHEET      = '_cfg_notes_'
CFG_CUSTOMERS_SHEET  = '_cfg_customers_'
CFG_TYPES_HEADERS = ['Name']
CFG_DIMS_HEADERS  = ['Type', 'Thickness', 'Width']
CFG_UNITS_HEADERS = ['Name', 'Length', 'Width', 'Height']

# Default seed data — mirrors item_options.js hardcoded values
# Dims: (type, thickness, width)  — value displayed = "{width} {thickness}" if width else thickness
DEFAULT_TYPES = ['Bearers', 'Boards', 'Blocks']
DEFAULT_DIMS  = [
    # Bearers
    ('Bearers', 'All Dimensions', ''), ('Bearers', 'Low Profile', ''), ('Bearers', 'Mixed', ''),
    ('Bearers', 'Noched', ''),         ('Bearers', 'Square', ''),      ('Bearers', 'Standard', ''),
    # Boards — numeric
    ('Boards', 'All Dimensions', ''),
    ('Boards', '12-15', '65-85'),  ('Boards', '16-19', '65-85'),  ('Boards', '20-23', '65-85'),  ('Boards', '25', '65-85'),
    ('Boards', '12-15', '85-105'), ('Boards', '16-19', '85-105'), ('Boards', '20-23', '85-105'), ('Boards', '25', '85-105'),
    ('Boards', '12-15', '105-125'),('Boards', '16-19', '105-125'),('Boards', '20-23', '105-125'),('Boards', '25', '105-125'),
    ('Boards', '12-15', '125-145'),('Boards', '16-19', '125-145'),('Boards', '20-23', '125-145'),('Boards', '25', '125-145'),
    # Boards — named
    ('Boards', 'Narrow Mixed', ''), ('Boards', 'Standard Mixed', ''), ('Boards', 'Heavy Mixed', ''), ('Boards', 'Mixed', ''),
    # Blocks
    ('Blocks', 'All Dimensions', ''), ('Blocks', '100x75', ''), ('Blocks', '100x100', ''),
]
DEFAULT_UNITS = [
    ('box', '', '', ''), ('pc', '', '', ''), ('pallet', '', '', ''), ('Stillage', '', '', ''),
]

HEADER_FILL  = PatternFill(start_color='CCE5FF', end_color='CCE5FF', fill_type='solid')
THIN_SIDE    = Side(style='thin')
THIN_BORDER  = Border(left=THIN_SIDE, right=THIN_SIDE, top=THIN_SIDE, bottom=THIN_SIDE)
CENTER_ALIGN = Alignment(horizontal='center', vertical='center')


class RacksHandler:

    def __init__(self, schedule_file_id: str | None = None):
        self.gdrive    = GoogleDriveHandler()
        self._folder_id = self._resolve_folder(schedule_file_id)
        self.file_id   = self.gdrive.get_file_id_by_name(FILENAME, self._folder_id)
        self.workbook  = None

    def _resolve_folder(self, schedule_file_id: str | None) -> str | None:
        if not schedule_file_id:
            return None
        meta = self.gdrive.get_file_metadata(schedule_file_id)
        if meta and meta.get('parents'):
            return meta['parents'][0]
        return None

    # ------------------------------------------------------------------

    def load(self):
        if self.file_id:
            buf           = self.gdrive.download_file(self.file_id)
            self.workbook = openpyxl.load_workbook(buf)
        else:
            self.workbook = self._new_workbook()
            buf           = self._serialise()
            self.file_id  = self.gdrive.create_file(FILENAME, buf, folder_id=self._folder_id)
            print(f"  Created new Google Drive file '{FILENAME}' — id={self.file_id}")

    def close(self):
        if self.workbook:
            self.workbook.close()
            self.workbook = None

    # ------------------------------------------------------------------
    # Locations
    # ------------------------------------------------------------------

    def get_locations(self) -> list[str]:
        """Return all location sheet names (excludes internal placeholder sheet)."""
        return [s for s in self.workbook.sheetnames if not s.startswith('_')]

    def add_location(self, name: str) -> list[str]:
        """Create a new location tab with headers and save. Returns updated location list."""
        name = name.strip()
        if not name:
            raise ValueError("Location name cannot be empty")
        if name in self.workbook.sheetnames:
            raise ValueError(f"Location '{name}' already exists")
        self._create_location_sheet(name)
        # Remove the placeholder once at least one real location exists
        if '_placeholder_' in self.workbook.sheetnames:
            del self.workbook['_placeholder_']
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self.get_locations()

    # ------------------------------------------------------------------
    # Racks
    # ------------------------------------------------------------------

    def get_racks(self) -> list[dict]:
        """Return all racks across all location tabs, each with a 'location' field."""
        racks = []
        for loc in self.get_locations():
            ws = self.workbook[loc]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if all(v is None for v in row):
                    continue
                racks.append({
                    'location':        loc,
                    'bay_code':        str(row[0] or '').strip(),
                    'size_preferable': str(row[1] or '').strip(),
                    'actual_size':     str(row[2] or '').strip(),
                    'quantity':        str(row[3] or '').strip(),
                    'qty_unit':        str(row[4] or '').strip() if len(row) > 4 else '',
                    'item_type':       str(row[5] or '').strip() if len(row) > 5 else '',
                    'item_subtype':    str(row[6] or '').strip() if len(row) > 6 else '',
                    'status':          str(row[7] or '').strip() if len(row) > 7 else '',
                    'next_location':   str(row[8] or '').strip() if len(row) > 8 else '',
                    'notes':           str(row[9] or '').strip() if len(row) > 9 else '',
                    'customer':        str(row[10] or '').strip() if len(row) > 10 else '',
                })
        return racks

    def save_racks(self, racks: list[dict]):
        """Group racks by location and overwrite each location tab."""
        by_location = defaultdict(list)
        for rack in racks:
            loc = rack.get('location', '').strip()
            if loc:
                by_location[loc].append(rack)

        # Clear all location sheets
        for loc in self.get_locations():
            ws = self.workbook[loc]
            if ws.max_row > 1:
                ws.delete_rows(2, ws.max_row - 1)

        # Write rows to their sheets
        for loc, loc_racks in by_location.items():
            if loc not in self.workbook.sheetnames:
                continue
            ws = self.workbook[loc]
            for rack in loc_racks:
                row_idx = ws.max_row + 1
                values  = [
                    rack.get('bay_code', ''),
                    rack.get('size_preferable', ''),
                    rack.get('actual_size', ''),
                    rack.get('quantity', ''),
                    rack.get('qty_unit', ''),
                    rack.get('item_type', ''),
                    rack.get('item_subtype', ''),
                    rack.get('status', ''),
                    rack.get('next_location', ''),
                    rack.get('notes', ''),
                    rack.get('customer', ''),
                ]
                for col_idx, val in enumerate(values, start=1):
                    cell           = ws.cell(row=row_idx, column=col_idx, value=val or None)
                    cell.border    = THIN_BORDER
                    cell.alignment = CENTER_ALIGN

        self.gdrive.upload_file(self.file_id, self._serialise())

    # ------------------------------------------------------------------
    # Stock
    # ------------------------------------------------------------------

    def get_stock(self, racks: list[dict] | None = None) -> list[dict]:
        """Return all stock items with computed qty_on_hand from bays."""
        ws = self._ensure_stock_sheet()
        if racks is None:
            racks = self.get_racks()
        items = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            if all(v is None for v in row):
                continue
            size       = str(row[0] or '').strip()
            item_type  = str(row[1] or '').strip()
            dimensions = str(row[2] or '').strip()
            if dimensions == 'All Dimensions':
                qty_on_hand = sum(
                    float(r['quantity']) for r in racks
                    if r['actual_size'] == size
                    and r['item_type']  == item_type
                    and r['quantity']
                )
            else:
                qty_on_hand = sum(
                    float(r['quantity']) for r in racks
                    if r['actual_size']   == size
                    and r['item_type']    == item_type
                    and r['item_subtype'] == dimensions
                    and r['quantity']
                )
            items.append({
                'size':        size,
                'item_type':   item_type,
                'dimensions':  dimensions,
                'qty_on_hand': qty_on_hand,
                'min_on_hand': str(row[3] or '').strip(),
                'max_on_hand': str(row[4] or '').strip(),
            })
        return items

    def save_stock(self, items: list[dict]):
        """Overwrite the stock sheet with the provided items."""
        ws = self._ensure_stock_sheet()
        if ws.max_row > 1:
            ws.delete_rows(2, ws.max_row - 1)
        for item in items:
            row_idx = ws.max_row + 1
            values  = [
                item.get('size', ''),
                item.get('item_type', ''),
                item.get('dimensions', ''),
                item.get('min_on_hand', ''),
                item.get('max_on_hand', ''),
            ]
            for col_idx, val in enumerate(values, start=1):
                cell           = ws.cell(row=row_idx, column=col_idx, value=val or None)
                cell.border    = THIN_BORDER
                cell.alignment = CENTER_ALIGN
        self.gdrive.upload_file(self.file_id, self._serialise())

    def _ensure_stock_sheet(self):
        if STOCK_SHEET not in self.workbook.sheetnames:
            ws = self.workbook.create_sheet(STOCK_SHEET)
            for col, title in enumerate(STOCK_HEADERS, start=1):
                cell           = ws.cell(row=1, column=col, value=title)
                cell.fill      = HEADER_FILL
                cell.font      = Font(bold=True)
                cell.alignment = CENTER_ALIGN
                cell.border    = THIN_BORDER
            ws.column_dimensions['A'].width = 16
            ws.column_dimensions['B'].width = 14
            ws.column_dimensions['C'].width = 18
            ws.column_dimensions['D'].width = 14
            ws.column_dimensions['E'].width = 14
        return self.workbook[STOCK_SHEET]

    # ------------------------------------------------------------------
    # Config — Types
    # ------------------------------------------------------------------

    def get_config_types(self) -> list[str]:
        ws = self._ensure_cfg_types_sheet()
        return [str(r[0]).strip() for r in ws.iter_rows(min_row=2, values_only=True) if r[0]]

    def add_config_type(self, name: str) -> list[str]:
        name = name.strip()
        if not name:
            raise ValueError('Type name cannot be empty')
        ws = self._ensure_cfg_types_sheet()
        if any(str(r[0]).strip().lower() == name.lower() for r in ws.iter_rows(min_row=2, values_only=True) if r[0]):
            raise ValueError(f"Type '{name}' already exists")
        row = ws.max_row + 1
        c = ws.cell(row=row, column=1, value=name)
        c.border = THIN_BORDER; c.alignment = CENTER_ALIGN
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self.get_config_types()

    def delete_config_type(self, name: str) -> list[str]:
        ws = self._ensure_cfg_types_sheet()
        for row in ws.iter_rows(min_row=2):
            if row[0].value and str(row[0].value).strip().lower() == name.strip().lower():
                ws.delete_rows(row[0].row)
                break
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self.get_config_types()

    def update_config_type(self, old_name: str, new_name: str) -> list[str]:
        new_name = new_name.strip()
        if not new_name:
            raise ValueError('Type name cannot be empty')
        ws = self._ensure_cfg_types_sheet()
        for row in ws.iter_rows(min_row=2):
            if row[0].value and str(row[0].value).strip().lower() == old_name.strip().lower():
                row[0].value = new_name
                break
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self.get_config_types()

    def needs_config_seed(self) -> bool:
        required = [CFG_TYPES_SHEET, CFG_DIMS_SHEET, CFG_UNITS_SHEET,
                    CFG_STATUSES_SHEET, CFG_NEXT_LOCS_SHEET, CFG_NOTES_SHEET, CFG_CUSTOMERS_SHEET]
        return any(s not in self.workbook.sheetnames for s in required)

    def seed_config_if_needed(self) -> bool:
        if not self.needs_config_seed():
            return False
        self._ensure_cfg_types_sheet()
        self._ensure_cfg_dims_sheet()
        self._ensure_cfg_units_sheet()
        self._ensure_simple_sheet(CFG_STATUSES_SHEET, [])
        self._ensure_simple_sheet(CFG_NEXT_LOCS_SHEET, [])
        self._ensure_simple_sheet(CFG_NOTES_SHEET, [])
        self._ensure_simple_sheet(CFG_CUSTOMERS_SHEET, [])
        self.gdrive.upload_file(self.file_id, self._serialise())
        return True

    def _ensure_cfg_types_sheet(self):
        if CFG_TYPES_SHEET not in self.workbook.sheetnames:
            ws = self.workbook.create_sheet(CFG_TYPES_SHEET)
            c = ws.cell(row=1, column=1, value='Name')
            c.fill = HEADER_FILL; c.font = Font(bold=True); c.alignment = CENTER_ALIGN; c.border = THIN_BORDER
            ws.column_dimensions['A'].width = 20
            for i, name in enumerate(DEFAULT_TYPES, start=2):
                c = ws.cell(row=i, column=1, value=name)
                c.border = THIN_BORDER; c.alignment = CENTER_ALIGN
        return self.workbook[CFG_TYPES_SHEET]

    # ------------------------------------------------------------------
    # Config — Dimensions
    # ------------------------------------------------------------------

    def get_config_dimensions(self) -> list[dict]:
        ws = self._ensure_cfg_dims_sheet()
        dims = []
        for r in ws.iter_rows(min_row=2, values_only=True):
            if all(v is None for v in r):
                continue
            dims.append({'type': str(r[0] or '').strip(), 'thickness': str(r[1] or '').strip(), 'width': str(r[2] or '').strip()})
        return dims

    def add_config_dimension(self, type_name: str, thickness: str, width: str) -> list[dict]:
        type_name = type_name.strip(); thickness = thickness.strip(); width = width.strip()
        if not type_name or not thickness:
            raise ValueError('Type and thickness are required')
        ws = self._ensure_cfg_dims_sheet()
        row = ws.max_row + 1
        for col, val in enumerate([type_name, thickness, width], start=1):
            c = ws.cell(row=row, column=col, value=val)
            c.border = THIN_BORDER; c.alignment = CENTER_ALIGN
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self.get_config_dimensions()

    def delete_config_dimension(self, type_name: str, thickness: str, width: str) -> list[dict]:
        ws = self._ensure_cfg_dims_sheet()
        for row in ws.iter_rows(min_row=2):
            if (str(row[0].value or '').strip().lower() == type_name.strip().lower() and
                    str(row[1].value or '').strip() == thickness.strip() and
                    str(row[2].value or '').strip() == width.strip()):
                ws.delete_rows(row[0].row)
                break
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self.get_config_dimensions()

    def update_config_dimension(self, old_type: str, old_thickness: str, old_width: str,
                                 new_type: str, new_thickness: str, new_width: str) -> list[dict]:
        new_type = new_type.strip(); new_thickness = new_thickness.strip(); new_width = new_width.strip()
        if not new_type or not new_thickness:
            raise ValueError('Type and thickness are required')
        ws = self._ensure_cfg_dims_sheet()
        for row in ws.iter_rows(min_row=2):
            if (str(row[0].value or '').strip().lower() == old_type.strip().lower() and
                    str(row[1].value or '').strip() == old_thickness.strip() and
                    str(row[2].value or '').strip() == old_width.strip()):
                row[0].value = new_type
                row[1].value = new_thickness
                row[2].value = new_width or None
                break
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self.get_config_dimensions()

    def _ensure_cfg_dims_sheet(self):
        if CFG_DIMS_SHEET not in self.workbook.sheetnames:
            ws = self.workbook.create_sheet(CFG_DIMS_SHEET)
            for col, title in enumerate(CFG_DIMS_HEADERS, start=1):
                c = ws.cell(row=1, column=col, value=title)
                c.fill = HEADER_FILL; c.font = Font(bold=True); c.alignment = CENTER_ALIGN; c.border = THIN_BORDER
            ws.column_dimensions['A'].width = 16
            ws.column_dimensions['B'].width = 16
            ws.column_dimensions['C'].width = 14
            for i, (type_name, thickness, width) in enumerate(DEFAULT_DIMS, start=2):
                for col, val in enumerate([type_name, thickness, width or None], start=1):
                    c = ws.cell(row=i, column=col, value=val)
                    c.border = THIN_BORDER; c.alignment = CENTER_ALIGN
        return self.workbook[CFG_DIMS_SHEET]

    # ------------------------------------------------------------------
    # Config — Units
    # ------------------------------------------------------------------

    def get_config_units(self) -> list[dict]:
        ws = self._ensure_cfg_units_sheet()
        units = []
        for r in ws.iter_rows(min_row=2, values_only=True):
            if all(v is None for v in r):
                continue
            units.append({'name': str(r[0] or '').strip(), 'length': str(r[1] or '').strip(), 'width': str(r[2] or '').strip(), 'height': str(r[3] or '').strip()})
        return units

    def add_config_unit(self, name: str, length: str, width: str, height: str) -> list[dict]:
        name = name.strip()
        if not name:
            raise ValueError('Unit name cannot be empty')
        ws = self._ensure_cfg_units_sheet()
        if any(str(r[0] or '').strip().lower() == name.lower() for r in ws.iter_rows(min_row=2, values_only=True)):
            raise ValueError(f"Unit '{name}' already exists")
        row = ws.max_row + 1
        for col, val in enumerate([name, length.strip(), width.strip(), height.strip()], start=1):
            c = ws.cell(row=row, column=col, value=val or None)
            c.border = THIN_BORDER; c.alignment = CENTER_ALIGN
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self.get_config_units()

    def delete_config_unit(self, name: str) -> list[dict]:
        ws = self._ensure_cfg_units_sheet()
        for row in ws.iter_rows(min_row=2):
            if str(row[0].value or '').strip().lower() == name.strip().lower():
                ws.delete_rows(row[0].row)
                break
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self.get_config_units()

    def update_config_unit(self, old_name: str, new_name: str, length: str, width: str, height: str) -> list[dict]:
        new_name = new_name.strip()
        if not new_name:
            raise ValueError('Unit name cannot be empty')
        ws = self._ensure_cfg_units_sheet()
        for row in ws.iter_rows(min_row=2):
            if str(row[0].value or '').strip().lower() == old_name.strip().lower():
                row[0].value = new_name
                row[1].value = length.strip() or None
                row[2].value = width.strip() or None
                row[3].value = height.strip() or None
                break
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self.get_config_units()

    def _ensure_cfg_units_sheet(self):
        if CFG_UNITS_SHEET not in self.workbook.sheetnames:
            ws = self.workbook.create_sheet(CFG_UNITS_SHEET)
            for col, title in enumerate(CFG_UNITS_HEADERS, start=1):
                c = ws.cell(row=1, column=col, value=title)
                c.fill = HEADER_FILL; c.font = Font(bold=True); c.alignment = CENTER_ALIGN; c.border = THIN_BORDER
            ws.column_dimensions['A'].width = 18
            ws.column_dimensions['B'].width = 12
            ws.column_dimensions['C'].width = 12
            ws.column_dimensions['D'].width = 12
            for i, (name, length, width, height) in enumerate(DEFAULT_UNITS, start=2):
                for col, val in enumerate([name, length or None, width or None, height or None], start=1):
                    c = ws.cell(row=i, column=col, value=val)
                    c.border = THIN_BORDER; c.alignment = CENTER_ALIGN
        return self.workbook[CFG_UNITS_SHEET]

    # ------------------------------------------------------------------
    # Config — generic simple-name list helpers
    # ------------------------------------------------------------------

    def _ensure_simple_sheet(self, sheet_name: str, defaults: list[str]):
        if sheet_name not in self.workbook.sheetnames:
            ws = self.workbook.create_sheet(sheet_name)
            c = ws.cell(row=1, column=1, value='Name')
            c.fill = HEADER_FILL; c.font = Font(bold=True); c.alignment = CENTER_ALIGN; c.border = THIN_BORDER
            ws.column_dimensions['A'].width = 24
            for i, name in enumerate(defaults, start=2):
                c = ws.cell(row=i, column=1, value=name)
                c.border = THIN_BORDER; c.alignment = CENTER_ALIGN
        return self.workbook[sheet_name]

    def _get_simple_list(self, sheet_name: str) -> list[str]:
        ws = self._ensure_simple_sheet(sheet_name, [])
        return [str(r[0]).strip() for r in ws.iter_rows(min_row=2, values_only=True) if r[0]]

    def _add_simple_item(self, sheet_name: str, name: str) -> list[str]:
        name = name.strip()
        if not name:
            raise ValueError('Name cannot be empty')
        ws = self._ensure_simple_sheet(sheet_name, [])
        if any(str(r[0]).strip().lower() == name.lower() for r in ws.iter_rows(min_row=2, values_only=True) if r[0]):
            raise ValueError(f"'{name}' already exists")
        row = ws.max_row + 1
        c = ws.cell(row=row, column=1, value=name)
        c.border = THIN_BORDER; c.alignment = CENTER_ALIGN
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self._get_simple_list(sheet_name)

    def _delete_simple_item(self, sheet_name: str, name: str) -> list[str]:
        ws = self._ensure_simple_sheet(sheet_name, [])
        for row in ws.iter_rows(min_row=2):
            if row[0].value and str(row[0].value).strip().lower() == name.strip().lower():
                ws.delete_rows(row[0].row)
                break
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self._get_simple_list(sheet_name)

    def _update_simple_item(self, sheet_name: str, old_name: str, new_name: str) -> list[str]:
        new_name = new_name.strip()
        if not new_name:
            raise ValueError('Name cannot be empty')
        ws = self._ensure_simple_sheet(sheet_name, [])
        for row in ws.iter_rows(min_row=2):
            if row[0].value and str(row[0].value).strip().lower() == old_name.strip().lower():
                row[0].value = new_name
                break
        self.gdrive.upload_file(self.file_id, self._serialise())
        return self._get_simple_list(sheet_name)

    # ------------------------------------------------------------------
    # Config — Statuses
    # ------------------------------------------------------------------

    def get_config_statuses(self) -> list[str]:
        return self._get_simple_list(CFG_STATUSES_SHEET)

    def add_config_status(self, name: str) -> list[str]:
        return self._add_simple_item(CFG_STATUSES_SHEET, name)

    def delete_config_status(self, name: str) -> list[str]:
        return self._delete_simple_item(CFG_STATUSES_SHEET, name)

    def update_config_status(self, old_name: str, new_name: str) -> list[str]:
        return self._update_simple_item(CFG_STATUSES_SHEET, old_name, new_name)

    # ------------------------------------------------------------------
    # Config — Next Locations
    # ------------------------------------------------------------------

    def get_config_next_locations(self) -> list[str]:
        return self._get_simple_list(CFG_NEXT_LOCS_SHEET)

    def add_config_next_location(self, name: str) -> list[str]:
        return self._add_simple_item(CFG_NEXT_LOCS_SHEET, name)

    def delete_config_next_location(self, name: str) -> list[str]:
        return self._delete_simple_item(CFG_NEXT_LOCS_SHEET, name)

    def update_config_next_location(self, old_name: str, new_name: str) -> list[str]:
        return self._update_simple_item(CFG_NEXT_LOCS_SHEET, old_name, new_name)

    # ------------------------------------------------------------------
    # Config — Notes
    # ------------------------------------------------------------------

    def get_config_notes(self) -> list[str]:
        return self._get_simple_list(CFG_NOTES_SHEET)

    def add_config_note(self, name: str) -> list[str]:
        return self._add_simple_item(CFG_NOTES_SHEET, name)

    def delete_config_note(self, name: str) -> list[str]:
        return self._delete_simple_item(CFG_NOTES_SHEET, name)

    def update_config_note(self, old_name: str, new_name: str) -> list[str]:
        return self._update_simple_item(CFG_NOTES_SHEET, old_name, new_name)

    # ------------------------------------------------------------------
    # Config — Customers
    # ------------------------------------------------------------------

    def get_config_customers(self) -> list[str]:
        return self._get_simple_list(CFG_CUSTOMERS_SHEET)

    def add_config_customer(self, name: str) -> list[str]:
        return self._add_simple_item(CFG_CUSTOMERS_SHEET, name)

    def delete_config_customer(self, name: str) -> list[str]:
        return self._delete_simple_item(CFG_CUSTOMERS_SHEET, name)

    def update_config_customer(self, old_name: str, new_name: str) -> list[str]:
        return self._update_simple_item(CFG_CUSTOMERS_SHEET, old_name, new_name)

    # ------------------------------------------------------------------

    def _create_location_sheet(self, name: str):
        ws = self.workbook.create_sheet(name)
        for col, title in enumerate(HEADERS, start=1):
            cell           = ws.cell(row=1, column=col, value=title)
            cell.fill      = HEADER_FILL
            cell.font      = Font(bold=True)
            cell.alignment = CENTER_ALIGN
            cell.border    = THIN_BORDER
        ws.column_dimensions['A'].width = 14
        ws.column_dimensions['B'].width = 18
        ws.column_dimensions['C'].width = 14
        ws.column_dimensions['D'].width = 14
        ws.column_dimensions['E'].width = 16
        ws.column_dimensions['F'].width = 14
        ws.column_dimensions['G'].width = 18
        ws.column_dimensions['H'].width = 16
        ws.column_dimensions['I'].width = 16
        ws.column_dimensions['J'].width = 22
        ws.column_dimensions['K'].width = 18
        return ws

    def _new_workbook(self) -> openpyxl.Workbook:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = '_placeholder_'  # hidden from UI; removed when first location is added
        return wb

    def _serialise(self) -> io.BytesIO:
        buf = io.BytesIO()
        self.workbook.save(buf)
        buf.seek(0)
        return buf
