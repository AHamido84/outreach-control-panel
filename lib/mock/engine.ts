import "server-only";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { type Cell, type Grid, type Workbook, getCell, putCell, lastRow, lastCol, userEntered, toJSONSafe, fromJSONSafe, parseA1 } from "./workbook";

/**
 * The mock engine IS the real apps-script/Code.gs, run in a Node vm with Apps Script shims
 * bound to the same in-memory workbook the dashboard reads and writes through MockTransport.
 * Gmail, monday, triggers and websites are faked.
 */

type Msg = { from: string; subject: string; body: string; mid: string };
type Board = { name: string; columns: { id: string; title: string; type: string }[]; groups: { id: string; title: string }[] };

export type MockState = {
  wb: Workbook;
  props: Record<string, string>;
  threads: Record<string, Msg[]>;
  aliases: string[];
  account: string;
  boards: Record<string, Board>;
  mondayAttempts: Record<string, number>;
  last: { tick: number; sendQueue: number; processLeads: number };
  seq: number;
};

export const MOCK_DIR = process.env.VERCEL ? "/tmp/ocp-mock" : path.join(process.cwd(), ".data", "mock");
const CODE_PATH = path.join(process.cwd(), "apps-script", "Code.gs");

const signed = (buf: Buffer) => Array.from(buf).map((x) => (x > 127 ? x - 256 : x));
const unsigned = (arr: number[]) => Buffer.from(arr.map((x) => x & 255));
const hash = (s: string) => crypto.createHash("md5").update(s).digest().readUInt32BE(0);

function formatDate(d: Date, tz: string, pat: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      weekday: "short", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const u = String({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday as "Mon"]);
  const map: Record<string, string> = {
    yyyy: parts.year, MM: parts.month, dd: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second,
    u, H: String(Number(parts.hour)),
  };
  return pat.replace(/yyyy|MM|dd|HH|mm|ss|u|H/g, (k) => map[k]);
}

export class MockEngine {
  private ctx!: vm.Context & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  constructor(public sheetId: string, public state: MockState) {
    this.build();
  }

  // ------------------------------------------------------------------ shims
  private build() {
    const st = this.state;
    const self = this;

    class Range {
      constructor(private g: () => Grid, private r: number, private c: number, private nr = 1, private nc = 1) {}
      getValues() {
        const out: Cell[][] = [];
        for (let i = 0; i < this.nr; i++) { const row: Cell[] = []; for (let j = 0; j < this.nc; j++) row.push(getCell(this.g(), this.r + i, this.c + j)); out.push(row); }
        return out;
      }
      getValue() { return getCell(this.g(), this.r, this.c); }
      setValues(v: unknown[][]) { v.forEach((row, i) => row.forEach((x, j) => putCell(this.g(), this.r + i, this.c + j, userEntered(x)))); return this; }
      setValue(x: unknown) { putCell(this.g(), this.r, this.c, userEntered(x)); return this; }
      clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) putCell(this.g(), this.r + i, this.c + j, ""); return this; }
      setFontWeight() { return this; } setFontColor() { return this; } setBackground() { return this; } setNumberFormat() { return this; }
    }
    class Sheet {
      constructor(private name: string) {}
      private g = () => st.wb[this.name];
      getName() { return this.name; }
      getRange(r: number | string, c?: number, nr?: number, nc?: number) {
        if (typeof r === "string") { const a = parseA1(`'${this.name}'!${r}`); return new Range(this.g, a.r1, a.c1, 1, 1); }
        return new Range(this.g, r, c!, nr, nc);
      }
      getLastRow() { return lastRow(this.g()); }
      getLastColumn() { return lastCol(this.g()); }
      appendRow(vals: unknown[]) { const r = lastRow(this.g()) + 1; vals.forEach((v, j) => putCell(this.g(), r, j + 1, userEntered(v))); }
      setRightToLeft() {} setFrozenRows() {}
    }
    const ss = {
      getSpreadsheetTimeZone: () => "UTC",
      getSheetByName: (n: string) => (st.wb[n] ? new Sheet(n) : null),
      insertSheet: (n: string) => { st.wb[n] = []; return new Sheet(n); },
      toast: () => {},
    };

    const props = () => st.props;
    const triggers = (): string[] => JSON.parse(st.props.MOCK_TRIGGERS || "[]");
    const setTriggers = (t: string[]) => { st.props.MOCK_TRIGGERS = JSON.stringify(t); };
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

    const ctx: Record<string, unknown> = {
      console: { log() {}, error() {}, warn() {} },
      JSON, Math, Date, Number, String, Object, Array, RegExp, Error, isNaN, parseInt, parseFloat,
      SpreadsheetApp: { getActive: () => ss, flush: () => {}, getUi: () => { throw new Error("no ui in mock"); } },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k: string) => props()[k] ?? null,
          setProperty: (k: string, v: string) => { props()[k] = String(v); },
          getProperties: () => ({ ...props() }),
          setProperties: (o: Record<string, string>) => Object.assign(props(), o),
        }),
      },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
      Session: {
        getScriptTimeZone: () => "Asia/Riyadh",
        getActiveUser: () => ({ getEmail: () => st.account }),
        getEffectiveUser: () => ({ getEmail: () => st.account }),
      },
      Utilities: {
        formatDate, getUuid: () => crypto.randomUUID(), sleep: () => {},
        base64Encode: (s: string | number[]) => (Array.isArray(s) ? unsigned(s).toString("base64") : b64(s)),
        base64EncodeWebSafe: (s: string) => b64(s).replace(/\+/g, "-").replace(/\//g, "_"),
        base64Decode: (s: string) => signed(Buffer.from(s, "base64")),
        computeHmacSha256Signature: (v: string, k: string) => signed(crypto.createHmac("sha256", k).update(v, "utf8").digest()),
        newBlob: (bytes: number[]) => ({ getDataAsString: () => unsigned(bytes).toString("utf8") }),
        Charset: { UTF_8: "utf8" },
      },
      UrlFetchApp: { fetch: (url: string, opt: { headers?: Record<string, string>; payload?: string }) => self.fetch(url, opt) },
      Gmail: {
        Users: {
          getProfile: () => ({ emailAddress: st.account }),
          Messages: { send: (payload: { raw: string; threadId?: string }) => self.gmailSend(payload) },
        },
      },
      GmailApp: {
        getAliases: () => st.aliases.slice(),
        getThreadById: (id: string) => ({
          getMessages: () => (st.threads[id] || []).map((m) => ({
            getFrom: () => m.from, getSubject: () => m.subject, getPlainBody: () => m.body, getHeader: () => m.mid,
          })),
        }),
      },
      MailApp: { sendEmail: () => {}, getRemainingDailyQuota: () => 100 - Number(st.props["SENT_" + formatDate(new Date(), "Asia/Riyadh", "yyyy-MM-dd")] || 0) },
      CalendarApp: { getDefaultCalendar: () => ({ getEvents: () => [] }) },
      ScriptApp: {
        getProjectTriggers: () => triggers().map((n) => ({ getHandlerFunction: () => n, _n: n })),
        deleteTrigger: (t: { _n: string }) => { const l = triggers(); const i = l.indexOf(t._n); if (i > -1) l.splice(i, 1); setTriggers(l); },
        newTrigger: (name: string) => {
          const chain = { create: () => { setTriggers([...triggers(), name]); } };
          return { timeBased: () => ({ everyMinutes: () => chain, everyHours: () => chain }) };
        },
      },
    };
    this.ctx = vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(CODE_PATH, "utf8"), this.ctx, { filename: "Code.gs" });
  }

  private gmailSend(payload: { raw: string; threadId?: string }) {
    const st = this.state;
    const raw = Buffer.from(payload.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    let threadId = payload.threadId;
    if (!threadId) { do threadId = "19" + crypto.randomBytes(7).toString("hex"); while (/^\d+$/.test(threadId)); }
    const subjEnc = /\r\nSubject: =\?UTF-8\?B\?(.*)\?=\r\n/.exec(raw)?.[1] || "";
    const subject = Buffer.from(subjEnc, "base64").toString("utf8");
    const id = "m" + ++st.seq;
    (st.threads[threadId] = st.threads[threadId] || []).push({ from: st.account, subject, body: "", mid: `<${id}@mock.mail>` });
    return { id, threadId };
  }

  // fake monday API + websites
  private fetch(url: string, opt: { headers?: Record<string, string>; payload?: string }) {
    const ok = (data: unknown) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ data }) });
    const err = (msg: string) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ error_message: msg }) });
    if (url.indexOf("api.monday.com") === -1) {
      // websites: some have a contact email
      const d = url.replace(/^https?:\/\//, "").split(/[\/?#]/)[0].replace(/^www\./, "");
      const html = hash(d) % 3 === 0 ? `<a href="mailto:info@${d}">info@${d}</a>` : "";
      return { getResponseCode: () => (html ? 200 : 404), getContentText: () => html };
    }
    const token = String(opt.headers?.Authorization || "");
    if (token.length < 20 || /bad|invalid/i.test(token)) return err("Not Authenticated");
    const body = JSON.parse(opt.payload || "{}") as { query: string; variables: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const q = body.query, v = body.variables || {};
    const st = this.state;
    const board = (id: string) => {
      if (!st.boards[id] && /^\d{6,}$/.test(id)) st.boards[id] = { name: "Outreach CRM", columns: [{ id: "name", title: "Name", type: "name" }], groups: [{ id: "topics", title: "Group Title" }] };
      return st.boards[id];
    };
    if (q.includes("me {")) return ok({ me: { name: "Mock monday user", email: "mock@monday.example" } });
    if (q.includes("create_board")) { const id = String(5000000000 + ++st.seq); board(id); st.boards[id].name = v.name; return ok({ create_board: { id } }); }
    if (q.includes("boards(ids")) {
      const b = board(String((v.ids || [])[0]));
      return ok({ boards: b ? [{ id: String(v.ids[0]), name: b.name, columns: b.columns, groups: b.groups }] : [] });
    }
    if (q.includes("create_column")) { const id = "col_" + ++st.seq; board(String(v.b))?.columns.push({ id, title: v.t, type: v.ty }); return ok({ create_column: { id } }); }
    if (q.includes("create_group")) { const id = "grp_" + ++st.seq; board(String(v.b))?.groups.push({ id, title: v.n }); return ok({ create_group: { id } }); }
    if (q.includes("create_item")) {
      // ~1 in 5 items fail on the first attempt (so ✗ and Retry can be tested), then succeed
      const key = "item:" + v.n;
      const n = (st.mondayAttempts[key] = (st.mondayAttempts[key] || 0) + 1);
      if (n === 1 && hash(String(v.n)) % 5 === 0) return err("ColumnValueException: قيمة غير صالحة لعمود الإيميل");
      return ok({ create_item: { id: String(8000000000 + ++st.seq) } });
    }
    if (q.includes("change_multiple_column_values")) {
      const key = "upd:" + v.i;
      const n = (st.mondayAttempts[key] = (st.mondayAttempts[key] || 0) + 1);
      if (n === 1 && hash(String(v.i)) % 6 === 0) return err("Rate limit exceeded (mock)");
      return ok({ change_multiple_column_values: { id: v.i } });
    }
    return ok({ ok: { id: "1" } });
  }

  // ------------------------------------------------------------------ API
  call<T = unknown>(fn: string, ...args: unknown[]): T {
    this.ctx.CACHE_ = {};
    return (this.ctx[fn] as (...a: unknown[]) => T)(...args);
  }

  /** Simulates the time-based triggers. Called lazily on dashboard reads (every ≥5 s). */
  tick(force = false) {
    const now = Date.now();
    const L = this.state.last;
    if (!force && now - L.tick < 5000) return;
    L.tick = now;
    const trig = JSON.parse(this.state.props.MOCK_TRIGGERS || "[]") as string[];
    try {
      if (trig.includes("runCommands") && this.state.wb["Commands"]) this.call("runCommands");
      if (trig.includes("sendQueue") && now - L.sendQueue > 5 * 60e3) { L.sendQueue = now; this.call("sendQueue"); }
      if (trig.includes("processLeads") && now - L.processLeads > 60 * 60e3) { L.processLeads = now; this.call("processLeads"); }
    } catch (e) {
      console.error("[mock engine]", this.sheetId, e);
    }
    this.save();
  }

  save() {
    fs.mkdirSync(MOCK_DIR, { recursive: true });
    const file = path.join(MOCK_DIR, this.sheetId + ".json");
    fs.writeFileSync(file + ".tmp", JSON.stringify({ ...this.state, wb: toJSONSafe(this.state.wb) }));
    fs.renameSync(file + ".tmp", file);
  }

  static load(sheetId: string): MockState | null {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(MOCK_DIR, sheetId + ".json"), "utf8"));
      return { ...raw, wb: fromJSONSafe(raw.wb) };
    } catch {
      return null;
    }
  }
}
