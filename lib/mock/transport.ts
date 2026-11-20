import "server-only";
import { MockEngine } from "./engine";
import { seedMock } from "./seed";
import { formatDateCell, getCell, lastCol, lastRow, parseA1, putCell, userEntered, type Cell } from "./workbook";
import { SheetsError, type CellValue, type SheetsTransport } from "@/lib/google/transport";

const g = globalThis as unknown as { __ocpMock?: Map<string, MockEngine> };
const engines = () => (g.__ocpMock ??= new Map());

/** The mock sheet for an id: loaded from .data/mock, else seeded. */
export function mockEngine(sheetId: string, engineKey?: string): MockEngine {
  let e = engines().get(sheetId);
  if (!e) {
    const saved = MockEngine.load(sheetId);
    e = saved ? new MockEngine(sheetId, saved) : seedMock(sheetId, engineKey);
    engines().set(sheetId, e);
  }
  return e;
}

const render = (v: Cell): CellValue => (v instanceof Date ? formatDateCell(v) : v);

export const mockTransport: SheetsTransport = {
  async meta(sheetId) {
    const e = mockEngine(sheetId);
    return { title: "Outreach Engine — " + sheetId.replace(/^mock-/, ""), locale: "en_US", timeZone: "Asia/Riyadh", tabs: Object.keys(e.state.wb) };
  },
  async batchGet(sheetId, ranges) {
    const e = mockEngine(sheetId);
    e.tick(); // the fake engine's triggers run lazily, as the dashboard polls
    return ranges.map((r) => {
      const a = parseA1(r);
      const grid = e.state.wb[a.tab];
      if (!grid) throw new SheetsError("تاب أو عمود مش موجود في الشيت", 400, `Unable to parse range: ${r}`);
      const r2 = a.r2 ?? lastRow(grid), c2 = a.c2 ?? lastCol(grid);
      const out: CellValue[][] = [];
      for (let i = a.r1; i <= r2; i++) {
        const row: CellValue[] = [];
        for (let j = a.c1; j <= c2; j++) row.push(render(getCell(grid, i, j)));
        while (row.length && row[row.length - 1] === "") row.pop();
        out.push(row);
      }
      while (out.length && out[out.length - 1].length === 0) out.pop();
      return out;
    });
  },
  async batchUpdate(sheetId, data, input) {
    const e = mockEngine(sheetId);
    for (const d of data) {
      const a = parseA1(d.range);
      const grid = e.state.wb[a.tab];
      if (!grid) throw new SheetsError("تاب مش موجود", 400, d.range);
      d.values.forEach((row, i) => row.forEach((v, j) => putCell(grid, a.r1 + i, a.c1 + j, input === "RAW" ? v : userEntered(v))));
    }
    e.save();
  },
  async append(sheetId, range, values, input) {
    const e = mockEngine(sheetId);
    const a = parseA1(range);
    const grid = e.state.wb[a.tab];
    if (!grid) throw new SheetsError("تاب مش موجود", 400, range);
    let r = lastRow(grid) + 1;
    for (const row of values) { row.forEach((v, j) => putCell(grid, r, a.c1 + j, input === "RAW" ? v : userEntered(v))); r++; }
    e.save();
  },
};
