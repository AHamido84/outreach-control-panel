// Minimal mocks of Google Apps Script services to exercise Code.gs end to end.
const fs = require('fs');
const vm = require('vm');
const data = JSON.parse(fs.readFileSync(__dirname + '/wb.json', 'utf8'));

// ---------- Spreadsheet ----------
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr: nr || 1, nc: nc || 1 }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); out.push(row); }
    return out;
  }
  getValue() { return this.sh.get(this.r, this.c); }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sh.put(this.r + i, this.c + j, x))); return this; }
  setValue(x) { this.sh.put(this.r, this.c, x); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.put(this.r + i, this.c + j, ''); return this; }
  setFontWeight() { return this; } setFontColor() { return this; } setBackground() { return this; } setNumberFormat() { return this; }
}
class Sheet {
  constructor(name, rows) { this.name = name; this.rows = rows.map(r => r.slice()); }
  get(r, c) { const row = this.rows[r - 1]; const v = row ? row[c - 1] : ''; return v === undefined || v === null ? '' : v; }
  put(r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    const row = this.rows[r - 1]; while (row.length < c) row.push('');
    // Sheets turns yyyy-MM-dd strings into dates
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(v)) v = new Date(v.length > 10 ? v.replace(' ', 'T') + ':00Z' : v + 'T00:00:00Z');
    row[c - 1] = v;
  }
  getLastRow() { let n = 0; this.rows.forEach((r, i) => { if (r.some(v => v !== '' && v !== null && v !== undefined)) n = i + 1; }); return n; }
  getLastColumn() { return Math.max(0, ...this.rows.map(r => { let n = 0; r.forEach((v, i) => { if (v !== '' && v !== null) n = i + 1; }); return n; })); }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  setRightToLeft() {} setFrozenRows() {}
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, j) => this.put(r, j + 1, v)); }
}
const sheets = {}; Object.keys(data).forEach(k => sheets[k] = new Sheet(k, data[k]));
const ss = { getSpreadsheetTimeZone: () => 'UTC', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n, [])), toast: (m) => console.log('  [toast]', m) };

// ---------- other services ----------
const props = {};
const sentMails = [];
const threads = {};
let msgSeq = 0;
function fmt(d, tz, pat) {
  const off = tz === 'UTC' ? 0 : 3; // Asia/Riyadh
  const x = new Date(d.getTime() + off * 3600e3);
  const p = n => String(n).padStart(2, '0');
  const map = { yyyy: x.getUTCFullYear(), MM: p(x.getUTCMonth() + 1), dd: p(x.getUTCDate()), HH: p(x.getUTCHours()), mm: p(x.getUTCMinutes()), ss: p(x.getUTCSeconds()) };
  if (pat === 'u') return String(x.getUTCDay() === 0 ? 7 : x.getUTCDay());
  if (pat === 'H') return String(x.getUTCHours());
  return pat.replace(/yyyy|MM|dd|HH|mm|ss/g, k => map[k]);
}
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const mondayCalls = [];
let itemSeq = 100;
const ctx = {
  console,
  SpreadsheetApp: { getActive: () => ss, flush: () => {}, getUi: () => { throw new Error('no ui in tests'); } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, getProperties: () => ({ ...props }), setProperties: (o) => Object.assign(props, o) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Session: { getScriptTimeZone: () => 'Asia/Riyadh', getActiveUser: () => ({ getEmail: () => 'me@gmail.com' }), getEffectiveUser: () => ({ getEmail: () => 'me@gmail.com' }) },
  Utilities: {
    formatDate: fmt, getUuid: () => 'uuid-1234', sleep: () => {},
    base64Encode: (s) => Array.isArray(s) ? Buffer.from(s.map(x => x & 255)).toString('base64') : b64(s), base64EncodeWebSafe: (s) => b64(s).replace(/\+/g, '-').replace(/\//g, '_'),
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map(x => x > 127 ? x - 256 : x),
    computeHmacSha256Signature: (v, k) => Array.from(require('crypto').createHmac('sha256', k).update(v).digest()).map(x => x > 127 ? x - 256 : x),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map(x => x & 255)).toString('utf8') }),
    Charset: { UTF_8: 'utf8' }
  },
  UrlFetchApp: {
    fetch: (url, opt) => {
      if (url.indexOf('api.monday.com') > -1) {
        const body = JSON.parse(opt.payload); mondayCalls.push(body);
        const q = body.query;
        let d = {};
        if (q.includes('boards(ids')) d = { boards: [{ columns: [{ id: 'name', title: 'Name', type: 'name' }], groups: [{ id: 'topics', title: 'Group Title' }] }] };
        else if (q.includes('create_column')) d = { create_column: { id: 'col_' + mondayCalls.length } };
        else if (q.includes('create_group')) d = { create_group: { id: 'grp_' + mondayCalls.length } };
        else if (q.includes('create_item')) d = { create_item: { id: String(itemSeq++) } };
        else if (q.includes('create_board')) d = { create_board: { id: '999' } };
        else d = { ok: { id: '1' } };
        return { getContentText: () => JSON.stringify({ data: d }), getResponseCode: () => 200 };
      }
      // fake websites
      const html = url.includes('nokhba-site.com/contact') ? '<a href="mailto:Sales@Nokhba-Site.com">x</a> logo@2x.png info@other.com'
        : url.includes('nomail-site.com') ? '<p>no emails</p>' : '';
      return { getResponseCode: () => (html ? 200 : 404), getContentText: () => html };
    }
  },
  Gmail: {
    Users: {
      getProfile: () => ({}),
      Messages: {
        send: (payload) => {
          const raw = Buffer.from(payload.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
          const id = 'm' + (++msgSeq); const threadId = payload.threadId || 't' + msgSeq;
          const to = /\r\nTo: (.*)\r\n/.exec(raw)[1];
          const subjEnc = /\r\nSubject: =\?UTF-8\?B\?(.*)\?=\r\n/.exec(raw)[1];
          const subject = Buffer.from(subjEnc, 'base64').toString('utf8');
          const textPart = raw.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n\r\n--')[0].replace(/\r\n/g, '');
          const text = Buffer.from(textPart, 'base64').toString('utf8');
          sentMails.push({ to, subject, text, threadId, inReplyTo: /In-Reply-To: (.*)\r\n/.exec(raw)?.[1] });
          (threads[threadId] = threads[threadId] || []).push({ from: 'Ahmed <ahmed@arabcomputers-team.com>', subject, body: text, mid: '<' + id + '@mail>' });
          return { id, threadId };
        }
      }
    }
  },
  GmailApp: {
    getAliases: () => ['ahmed@arabcomputers-team.com'],
    getThreadById: (id) => ({
      getMessages: () => (threads[id] || []).map(m => ({
        getFrom: () => m.from, getSubject: () => m.subject, getPlainBody: () => m.body, getHeader: () => m.mid
      }))
    })
  },
  CalendarApp: { getDefaultCalendar: () => ({ getEvents: () => calEvents }) },
  MailApp: { sendEmail: (to, s, b) => console.log('  [notify]', to, s), getRemainingDailyQuota: () => 95 },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create() {} }), everyMinutes: () => ({ create() {} }) }) }) }
};
let calEvents = [];
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), ctx);

// ---------- helpers for the test ----------
const tab = n => sheets[n];
function leadRows() {
  const sh = tab('Leads'); const h = sh.rows[0];
  return sh.rows.slice(1).filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] instanceof Date ? r[i].toISOString().slice(0, 16) : r[i]])));
}
function setCompany(label, v) { const sh = tab('Company'); sh.rows.forEach(r => { if (r[0] === label) r[1] = v; }); }
function logRows() { return tab('Log').rows.slice(2).map(r => r.slice(1, 5).join(' | ')); }
module.exports = { ctx, sheets, tab, leadRows, setCompany, logRows, sentMails, threads, mondayCalls, props, setEvents: e => { calEvents = e; } };
