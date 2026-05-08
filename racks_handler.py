"""
racks_handler.py — Manages the racks_management Google Drive file.

Creates a new spreadsheet file called 'racks_management' in Google Drive
if one does not already exist.  Subsequent loads download and re-upload
that same file.
"""
import io

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

from google_drive_handler import GoogleDriveHandler

FILENAME = 'racks_management'
HEADERS  = ['Bay Code', 'Size Preferable', 'Actual Size', 'Quantity']

HEADER_FILL  = PatternFill(start_color='CCE5FF', end_color='CCE5FF', fill_type='solid')
THIN_SIDE    = Side(style='thin')
THIN_BORDER  = Border(left=THIN_SIDE, right=THIN_SIDE, top=THIN_SIDE, bottom=THIN_SIDE)
CENTER_ALIGN = Alignment(horizontal='center', vertical='center')


class RacksHandler:

    def __init__(self):
        self.gdrive   = GoogleDriveHandler()
        self.file_id  = self.gdrive.get_file_id_by_name(FILENAME)
        self.workbook = None

    # ------------------------------------------------------------------

    def load(self):
        if self.file_id:
            buf           = self.gdrive.download_file(self.file_id)
            self.workbook = openpyxl.load_workbook(buf)
        else:
            self.workbook = self._new_workbook()
            buf           = self._serialise()
            self.file_id  = self.gdrive.create_file(FILENAME, buf)
            print(f"  Created new Google Drive file '{FILENAME}' — id={self.file_id}")

    def close(self):
        if self.workbook:
            self.workbook.close()
            self.workbook = None

    # ------------------------------------------------------------------

    def get_racks(self) -> list[dict]:
        ws    = self.workbook.active
        racks = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            if all(v is None for v in row):
                continue
            racks.append({
                'bay_code':        str(row[0] or '').strip(),
                'size_preferable': str(row[1] or '').strip(),
                'actual_size':     str(row[2] or '').strip(),
                'quantity':        str(row[3] or '').strip(),
            })
        return racks

    def save_racks(self, racks: list[dict]):
        ws = self.workbook.active
        # Clear existing data rows
        if ws.max_row > 1:
            ws.delete_rows(2, ws.max_row - 1)
        # Write new rows
        for rack in racks:
            values = [
                rack.get('bay_code', ''),
                rack.get('size_preferable', ''),
                rack.get('actual_size', ''),
                rack.get('quantity', ''),
            ]
            row_idx = ws.max_row + 1
            for col_idx, val in enumerate(values, start=1):
                cell             = ws.cell(row=row_idx, column=col_idx, value=val or None)
                cell.border      = THIN_BORDER
                cell.alignment   = CENTER_ALIGN
        self.gdrive.upload_file(self.file_id, self._serialise())

    # ------------------------------------------------------------------

    def _new_workbook(self) -> openpyxl.Workbook:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Racks'
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
        return wb

    def _serialise(self) -> io.BytesIO:
        buf = io.BytesIO()
        self.workbook.save(buf)
        buf.seek(0)
        return buf
