// Phone numbers must survive import as text (leading zero / + kept).
// Turns on the harness' "user entered" emulation: numeric strings → numbers, 'text → text.
const H = require('./harness');
const { OPTS, ctx, tab, leadRows } = H;
const assert = require('assert');

OPTS.userEntered = true;
tab('Leads').rows = [tab('Leads').rows[0]];
ctx.ensureDashboardTabs_();

tab('Import').rows = [
  tab('Import').rows[0],
  ['SRC01', 'اسم الشركة', 'البريد الإلكتروني', 'الجوال', 'النشاط', 'المدينة'],
  ['', 'شركة أ', 'a@phone-a.com', '0501234567', 'مقاولات', 'الرياض'],
  ['', 'شركة ب', 'b@phone-b.com', '+966501234567', 'مقاولات', 'الرياض'],
  ['', 'شركة ج', 'c@phone-c.com', "'0551112222", 'مقاولات', 'الرياض'],
  ['', 'شركة د', 'd@phone-d.com', '', 'مقاولات', 'الرياض']
];
ctx.CACHE_.company = null; ctx.CACHE_.sources = null;
const r = ctx.importFromSheet();
assert.strictEqual(r.added, 4, JSON.stringify(r));

const L = leadRows();
assert.strictEqual(L[0]['التليفون'], '0501234567', 'leading zero kept');
assert.strictEqual(L[1]['التليفون'], '+966501234567', '+ prefix kept as text');
assert.strictEqual(L[2]['التليفون'], '0551112222', 'already-quoted value not double-quoted');
assert.strictEqual(L[3]['التليفون'], '', 'empty stays empty');

console.log('\nPHONE TESTS PASSED');
