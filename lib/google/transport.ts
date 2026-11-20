import "server-only";

export type CellValue = string | number | boolean;
export type InputOption = "RAW" | "USER_ENTERED";

export type SheetMeta = { title: string; locale: string; timeZone: string; tabs: string[] };

/** The only four Sheets API calls the dashboard makes. */
export interface SheetsTransport {
  meta(sheetId: string): Promise<SheetMeta>;
  /** values.batchGet — UNFORMATTED_VALUE + FORMATTED_STRING dates. Trailing empty cells trimmed (like the API). */
  batchGet(sheetId: string, ranges: string[]): Promise<CellValue[][][]>;
  /** values.batchUpdate — one entry per changed cell/range. */
  batchUpdate(sheetId: string, data: { range: string; values: CellValue[][] }[], input: InputOption): Promise<void>;
  /** values.append — INSERT_ROWS after the last row of the table. */
  append(sheetId: string, range: string, values: CellValue[][], input: InputOption): Promise<void>;
}

export class SheetsError extends Error {
  constructor(message: string, public status?: number, public detail?: string) {
    super(message);
  }
}

export const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;
