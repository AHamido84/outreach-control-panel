// v2 tests: command queue, Send Results, monday status, token handoff, sender check, System tab.
const H = require('./harness');
const { ctx, tab, leadRows, setCompany, sentMails, props, mondayCalls } = H;
const assert = require('assert');
const crypto = require('crypto');
const reset = () => { ctx.CACHE_.company = null; ctx.CACHE_.sources = null; ctx.CACHE_.sender = null; };

// Same scheme as lib/seal.ts in the dashboard
function seal(plain, key) {
  const n = crypto.randomBytes(16).toString('base64');
  const p = Buffer.from(plain, 'utf8');
  const out = Buffer.alloc(p.length);
  let block;
  for (let i = 0; i < p.length; i++) {
    if (i % 32 === 0) block = crypto.createHmac('sha256', key).update(n + ':' + (i / 32)).digest();
    out[i] = p[i] ^ block[i % 32];
  }
  const c = out.toString('base64');
  const t = crypto.createHmac('sha256', key).update(n + ':' + c).digest('base64');
  return { n, c, t };
}

function addCommand(id, type, data, runAt) {
  const sh = tab('Commands'); const h = sh.rows[0];
  const row = h.map(() => '');
  row[h.indexOf('ID')] = id; row[h.indexOf('النوع')] = type; row[h.indexOf('البيانات')] = JSON.stringify(data || {});
  row[h.indexOf('موعد التنفيذ')] = runAt || ''; row[h.indexOf('الحالة')] = 'في الانتظار';
  sh.rows.push(row);
}
function cmd(id) {
  const sh = tab('Commands'); const h = sh.rows[0];
  const r = sh.rows.find(x => x[0] === id); return Object.fromEntries(h.map((k, i) => [k, r[i]]));
}
function results(id) {
  const sh = tab('Send Results'); const h = sh.rows[0];
  return sh.rows.slice(1).filter(r => r[0] === id).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

// fresh sheet
tab('Leads').rows = [tab('Leads').rows[0]];
setCompany('monday Board ID', '555');
props.MONDAY_TOKEN = 'tok';
reset(); ctx.ensureDashboardTabs_();
assert.ok(tab('Commands') && tab('Send Results') && tab('System'), 'new tabs');
assert.ok(tab('Leads').rows[0].includes('حالة monday'));
assert.ok(tab('Company').rows.some(r => r[0] === 'Reply-To'));
ctx.ensureMondayColumns_('555');

// import via Import tab + command (like the dashboard does)
tab('Import').rows = [tab('Import').rows[0], ['SRC03', 'Company', 'First Name', 'Email', 'Industry', 'City', 'Country'],
  ['', 'Alpha Co', 'Sara', 'sara@alpha-co.com', 'مقاولات', 'الرياض', 'السعودية'],
  ['', 'Beta Co', 'Omar', 'omar@beta-co.com', 'مقاولات', 'الرياض', 'السعودية'],
  ['', 'Gamma', 'Ali', 'ali@gamma-sa.com', 'مقاولات', 'الرياض', 'السعودية']];
addCommand('C1', 'import', {});
addCommand('C2', 'process', {});
reset(); ctx.runCommands();
assert.strictEqual(cmd('C1')['الحالة'], 'تم', JSON.stringify(cmd('C1')));
assert.strictEqual(JSON.parse(cmd('C1')['النتيجة']).added, 3);
assert.strictEqual(cmd('C2')['الحالة'], 'تم');
let L = leadRows();
assert.ok(L.every(x => x['حالة monday'] === 'تم' && x['حالة التواصل'] === 'جاهز'), JSON.stringify(L.map(x => [x['حالة monday'], x['حالة التواصل']])));

// dry run — nothing sent
setCompany('الإرسال شغال', 'لا');
addCommand('C3', 'send', { count: 5, dryRun: true });
reset(); ctx.runCommands();
assert.strictEqual(cmd('C3')['الحالة'], 'تم', cmd('C3')['النتيجة']);
assert.strictEqual(sentMails.length, 0);
assert.strictEqual(results('C3').length, 3);
assert.ok(results('C3').every(r => r['تم الإرسال'] === 'معاينة'));

// real send blocked while الإرسال شغال = لا
addCommand('C4', 'send', { count: 2 });
reset(); ctx.runCommands();
assert.strictEqual(cmd('C4')['الحالة'], 'فشل');
assert.ok(cmd('C4')['النتيجة'].includes('متوقف'));

// send anyway with selected leads + one monday failure
const origFetch = ctx.UrlFetchApp.fetch;
let failNextChange = true;
ctx.UrlFetchApp.fetch = (url, opt) => {
  if (url.includes('monday') && failNextChange && JSON.parse(opt.payload).query.includes('change_multiple_column_values')) {
    failNextChange = false;
    return { getContentText: () => JSON.stringify({ errors: [{ message: 'Column not found' }] }), getResponseCode: () => 200 };
  }
  return origFetch(url, opt);
};
addCommand('C5', 'send', { count: 2, leadIds: ['L00001', 'L00003'], ignoreEnabled: true, ignoreWindow: true });
reset(); ctx.runCommands();
assert.strictEqual(cmd('C5')['الحالة'], 'تم', cmd('C5')['النتيجة']);
const r5 = results('C5');
console.log('C5 results:', r5.map(r => [r['Lead ID'], r['تم الإرسال'], r['monday'], r['خطأ monday']].join(' | ')));
assert.strictEqual(r5.length, 2);
assert.ok(r5.every(r => r['تم الإرسال'] === 'نعم' && r['Thread ID']));
assert.strictEqual(r5[0]['monday'], 'فشل');
assert.strictEqual(r5[1]['monday'], 'تم');
L = leadRows();
assert.ok(String(L[0]['حالة monday']).startsWith('فشل'));
assert.strictEqual(L[1]['حالة التواصل'], 'جاهز', 'L00002 not selected, untouched');

// retry monday for failed ones
addCommand('C6', 'retryMonday', {});
reset(); ctx.runCommands();
assert.strictEqual(JSON.parse(cmd('C6')['النتيجة']).ok, 1, cmd('C6')['النتيجة']);
assert.strictEqual(leadRows()[0]['حالة monday'], 'تم');

// scheduled in the future: not executed yet
addCommand('C7', 'send', { count: 1, dryRun: true }, new Date(Date.now() + 3600e3).toISOString());
reset(); ctx.runCommands();
assert.strictEqual(cmd('C7')['الحالة'], 'في الانتظار');

// cancelled command is skipped
addCommand('C8', 'send', { count: 1, dryRun: true });
tab('Commands').rows.find(r => r[0] === 'C8')[tab('Commands').rows[0].indexOf('الحالة')] = 'ملغي';
reset(); ctx.runCommands();
assert.strictEqual(cmd('C8')['الحالة'], 'ملغي');

// test email does not touch lead state
const before = JSON.stringify(leadRows());
addCommand('C9', 'sendTest', { leadId: 'L00002', template: 'INTRO-AR', version: 'A', to: 'me@gmail.com' });
reset(); ctx.runCommands();
assert.strictEqual(cmd('C9')['الحالة'], 'تم', cmd('C9')['النتيجة']);
assert.ok(sentMails[sentMails.length - 1].subject.startsWith('[TEST]'));
assert.strictEqual(JSON.stringify(leadRows()), before);

// monday token handoff
props.ENGINE_KEY = 'k_' + crypto.randomBytes(24).toString('hex');
const sealed = seal('eyJhbGciOiJIUzI1NiJ9.تجربة.token-123', props.ENGINE_KEY);
addCommand('C10', 'setMondayToken', { sealed });
reset(); ctx.runCommands();
assert.strictEqual(cmd('C10')['الحالة'], 'تم', cmd('C10')['النتيجة']);
assert.strictEqual(props.MONDAY_TOKEN, 'eyJhbGciOiJIUzI1NiJ9.تجربة.token-123');
assert.strictEqual(cmd('C10')['البيانات'], '***', 'payload wiped');
// tampered
const bad = seal('x', props.ENGINE_KEY); bad.c = Buffer.from('y').toString('base64');
addCommand('C11', 'setMondayToken', { sealed: bad });
reset(); ctx.runCommands();
assert.strictEqual(cmd('C11')['الحالة'], 'فشل');

// sender not verified -> send fails with clear error
setCompany('إيميل الإرسال', 'other@unknown.com');
addCommand('C12', 'sendTest', { to: 'me@gmail.com' });
reset(); ctx.runCommands();
assert.strictEqual(cmd('C12')['الحالة'], 'فشل');
assert.ok(cmd('C12')['النتيجة'].includes('Send mail as'));
setCompany('إيميل الإرسال', 'ahmed@arabcomputers-team.com');

// System tab
const sys = Object.fromEntries(tab('System').rows.slice(1).map(r => [r[0], r[1]]));
console.log('System:', sys);
assert.ok(sys.heartbeat > 0);
assert.strictEqual(sys.mondayToken, 'نعم');
assert.strictEqual(sys.dashboardLinked, 'نعم');

// automatic sendQueue still works and logs to Send Results as 'auto'
setCompany('الإرسال شغال', 'نعم');
ctx.inSendWindow_ = () => true;
reset(); ctx.sendQueue();
assert.ok(results('auto').length >= 1, 'auto results logged');

console.log('\nV2 TESTS PASSED');
