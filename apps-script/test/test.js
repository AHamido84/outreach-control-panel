const H = require('./harness');
const { ctx, tab, leadRows, setCompany, logRows, sentMails, threads, mondayCalls, props } = H;
const assert = require('assert');
const reset = () => { ctx.CACHE_.company = null; ctx.CACHE_.sources = null; };

// clean example rows the user would delete; keep templates/segments/sequence examples
tab('Leads').rows = [tab('Leads').rows[0]];
tab('Do-Not-Contact').rows.push(['blocked.com', 'دومين', 'منافس', '', '']);
setCompany('monday Board ID', '555');
props.MONDAY_TOKEN = 'tok';

// --- setup (no UI: call the pieces directly) ---
ctx.ensureMondayColumns_('555');
const colMap = JSON.parse(props.MONDAY_COLS);
assert.ok(colMap['الإيميل'] && colMap['الحالة'], 'columns created');
const grp = JSON.parse(props.MONDAY_GROUPS);
assert.ok(grp['جاري التواصل'], 'groups created');
// state columns like setup does
ctx.ensureDashboardTabs_();

// --- import: Arabic file with its own headers (SRC01 mapping) ---
tab('Import').rows = [
  tab('Import').rows[0],
  ['SRC01', 'اسم الشركة', 'البريد الإلكتروني', 'الجوال', 'النشاط', 'المدينة', 'الموقع'],
  ['', 'شركة النخبة', '', '0500', 'مقاولات', 'الرياض', 'nokhba-site.com'],
  ['', 'شركة البناء', 'Info@Bena.sa ; ceo@bena.sa', '', 'مقاولات', 'الرياض', 'bena.sa'],
  ['', 'شركة البناء فرع', 'sales@bena.sa', '', 'مقاولات', 'الرياض', 'bena.sa'],     // same domain -> dup
  ['', 'منافس', 'x@blocked.com', '', 'مقاولات', 'الرياض', ''],                       // DNC domain
  ['', 'مافيش', '', '', 'مقاولات', 'الرياض', ''],                                  // no email
  ['', 'موقع فاضي', '', '', 'مقاولات', 'الرياض', 'nomail-site.com'],
  ['', 'عيادة', 'dr@clinic-jed.com', '', 'عيادات', 'جدة', ''],
  ['', 'مطعم', 'a@food.com', '', 'مطاعم', 'الرياض', ''],                           // no segment
];
reset(); ctx.importFromSheet();
let L = leadRows();
console.log('after import:', L.map(x => [x.ID, x['اسم الجهة'], x['الإيميل'], x['حالة المعالجة']].join(' / ')));
assert.strictEqual(L.length, 8);
assert.strictEqual(L[1]['الإيميل'], 'info@bena.sa');
assert.strictEqual(L[2]['حالة المعالجة'], 'مكرر');
assert.strictEqual(L[3]['حالة المعالجة'], 'في Do-Not-Contact');
assert.strictEqual(L[4]['حالة المعالجة'], 'مافيش إيميل');
assert.strictEqual(tab('Import').rows.slice(2).flat().join(''), '', 'import cleared');

// --- process ---
reset(); ctx.processLeads();
L = leadRows();
console.log('after process:', L.map(x => [x.ID, x['الإيميل'], x['كود الـ Segment'], x['حالة المعالجة'], x['حالة التواصل'], x['monday Item ID']].join(' / ')));
assert.strictEqual(L[0]['الإيميل'], 'sales@nokhba-site.com', 'extracted same-domain email');
assert.strictEqual(L[0]['كود الـ Segment'], 'SEG01');
assert.strictEqual(L[6]['كود الـ Segment'], 'SEG02');
assert.strictEqual(L[5]['حالة المعالجة'], 'مافيش إيميل');
assert.ok(String(L[7]['ملاحظات']).includes('مافيش Segment'));
assert.strictEqual(L[0]['حالة التواصل'], 'جاهز');
assert.ok(L[0]['monday Item ID']);

// --- send (manual, bypass window) ---
setCompany('الإرسال شغال', 'نعم');
setCompany('عدد الإيميلات في كل تشغيل', 5);
tab('Company').rows.push(['عدد الإيميلات في كل تشغيل', 5, '']);
setCompany('لينك البروفايل', 'https://arab-computers.com/profile');
reset(); ctx.sendQueue(true);
console.log('log:', logRows());
console.log('sent:', sentMails.map(m => m.to + ' | ' + m.subject));
assert.strictEqual(sentMails.length, 3, 'two SEG01 + one SEG02 within shares of cap 15');
const first = sentMails[0];
assert.ok(first.text.includes('?ref=L0000') || first.text.includes('ref=L'), 'profile ref');
assert.ok(!/\{[^}]+\}/.test(first.text), 'no unresolved vars');
console.log('\n----- first email -----\nSubject:', first.subject, '\n' + first.text, '\n------');
L = leadRows();
assert.strictEqual(L[0]['حالة التواصل'], 'تم الإرسال');

// --- follow-up: make it due ---
const sh = tab('Leads'); const hi = sh.rows[0].indexOf('المتابعة الجاية');
sh.rows.slice(1).forEach(r => { if (r[hi]) r[hi] = new Date('2020-01-01T00:00:00Z'); });
// lead 2 replies before follow-up
const t2 = L[1]['Thread ID'];
threads[t2].push({ from: 'CEO <info@bena.sa>', subject: 'Re: x', body: 'مهتم، كلمني بكره\n> quoted', mid: '<r1@x>' });
// lead SEG02 bounces
const t3 = L[6]['Thread ID'];
threads[t3].push({ from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)', body: '', mid: '<b@x>' });
reset(); ctx.watchTick();
L = leadRows();
console.log('after watch:', L.map(x => [x.ID, x['حالة التواصل']].join(' ')));
assert.strictEqual(L[1]['حالة التواصل'], 'رد');
assert.strictEqual(L[6]['حالة التواصل'], 'Bounce');
assert.ok(tab('Do-Not-Contact').rows.some(r => r[0] === 'dr@clinic-jed.com'));

const before = sentMails.length;
reset(); ctx.sendQueue(true);
const fu = sentMails.slice(before);
console.log('follow-ups:', fu.map(m => m.to + ' | ' + m.subject + ' | inReplyTo=' + m.inReplyTo));
assert.strictEqual(fu.length, 1);
assert.ok(fu[0].subject.startsWith('Re: '));
assert.ok(fu[0].inReplyTo);
assert.strictEqual(fu[0].threadId, L[0]['Thread ID']);
L = leadRows();
assert.strictEqual(L[0]['حالة التواصل'], 'متابعة 1');

// --- opt-out reply ---
threads[L[0]['Thread ID']].push({ from: 'x <sales@nokhba-site.com>', subject: 'Re', body: 'لا شكراً', mid: '<o@x>' });
reset(); ctx.watchTick();
L = leadRows();
assert.strictEqual(L[0]['حالة التواصل'], 'طلب الإزالة');

// --- booking by a lead + by a stranger with keyword ---
setCompany('كلمة في عنوان الحجز', 'جلسة');
tab('Company').rows.push(['كلمة في عنوان الحجز', 'جلسة', '']);
const ev = (email, title) => ({ getStartTime: () => new Date('2026-11-20T09:00:00Z'), getTitle: () => title,
  getGuestList: () => [{ getEmail: () => email }, { getEmail: () => 'me@gmail.com' }] });
H.setEvents([ev('info@bena.sa', 'جلسة استشارية (CEO)'), ev('new@person.com', 'جلسة استشارية (New)')]);
reset(); ctx.watchTick();
L = leadRows();
console.log('after booking:', L.map(x => [x.ID, x['حالة التواصل'], x['ميعاد الجلسة']].join(' ')));
assert.strictEqual(L[1]['حالة التواصل'], 'حجز جلسة');
assert.ok(L.some(x => x['الإيميل'] === 'new@person.com' && x['حالة التواصل'] === 'حجز جلسة'));
// second tick: no duplicates, no re-report
const n = L.length; const logN = tab('Log').rows.length; reset(); ctx.watchTick();
assert.strictEqual(leadRows().length, n); assert.strictEqual(tab('Log').rows.length, logN, 'no repeated booking events');

// --- bounce guard ---
console.log('\nmonday calls:', mondayCalls.length, '· last:', mondayCalls[mondayCalls.length - 1].query.slice(0, 60));
console.log('log tail:', logRows().slice(-4));
console.log('\nALL TESTS PASSED');

// --- extra: missing variable blocks the send, window check, bounce guard ---
reset();
assert.throws(() => ctx.fillTemplate_('أهلاً {حاجة_مش_موجودة}', { 'اسم الجهة': 'x', ID: 'L1' }, ctx.company_(), 'AR'), /متغيرات ناقصة/);
const c = ctx.company_();
console.log('inSendWindow now:', ctx.inSendWindow_(c));
// fake 20 sent with 2 bounces (10%) -> guard stops sending
const S = tab('Leads'); const hh = S.rows[0];
for (let i = 0; i < 20; i++) { const r = hh.map(() => ''); r[hh.indexOf('ID')] = 'X' + i; r[hh.indexOf('تاريخ أول إرسال')] = new Date(); r[hh.indexOf('حالة التواصل')] = i < 2 ? 'Bounce' : 'تم الإرسال'; S.rows.push(r); }
reset(); assert.strictEqual(ctx.bounceGuard_(ctx.company_()), true);
reset(); assert.strictEqual(ctx.company_()['الإرسال شغال'], 'لا');
console.log('EXTRA TESTS PASSED');
