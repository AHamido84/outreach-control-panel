/**
 * Outreach Engine — Apps Script  (v2)
 *
 * CHANGELOG v2 (لوحة التحكم Outreach Control Panel):
 *  - تابات جديدة بيعملها setup(): Commands (أوامر من الداشبورد) · Send Results (نتيجة كل إرسال) · System (حالة السكريبت).
 *  - عمود جديد في Leads: "حالة monday" (تم / فشل: السبب).
 *  - إعداد جديد في Company: Reply-To.
 *  - Trigger جديد كل دقيقة: runCommands — بينفذ أوامر الداشبورد ويحدّث تاب System.
 *  - أي خطأ في monday لعميل واحد مابيوقفش باقي التشغيل، وبيتسجل في "حالة monday".
 *  - الإرسال بيتأكد إن "إيميل الإرسال" متفعّل كـ Send mail as قبل ما يبعت.
 *  - قائمة جديدة: "ربط الداشبورد" لحفظ ENGINE_KEY.
 *  - كل اللي كان شغال قبل كده شغال زي ما هو، حتى من غير الداشبورد.
 * يشتغل على شيت "Outreach Engine — Master".
 * كل حاجة بتتقري من التابات بأسماء الأعمدة، فإضافة مصدر أو نشاط أو قالب مش محتاجة تعديل في الكود.
 *
 * المطلوب قبل التشغيل:
 *   1) Services (+) ← Gmail API (Advanced Gmail service).
 *   2) من القائمة Outreach ← "إعداد أول مرة".
 */

// ============================== ثوابت ==============================

var TAB = {
  COMPANY: 'Company', SOURCES: 'Sources', MAPPING: 'Field Mapping', IMPORT: 'Import',
  LEADS: 'Leads', SEGMENTS: 'Segments', SEQUENCE: 'Sequence', TEMPLATES: 'Templates',
  DNC: 'Do-Not-Contact', LOG: 'Log',
  COMMANDS: 'Commands', RESULTS: 'Send Results', SYSTEM: 'System'
};
var ENGINE_VERSION = '2.0.0';

var NEW_TABS = {
  'Commands': ['ID', 'النوع', 'البيانات', 'موعد التنفيذ', 'الحالة', 'تاريخ الإنشاء', 'تاريخ التنفيذ', 'النتيجة', 'المنشئ'],
  'Send Results': ['Command ID', 'الوقت', 'Lead ID', 'الإيميل', 'الخطوة', 'القالب/النسخة', 'تم الإرسال', 'الخطأ', 'Thread ID', 'monday', 'خطأ monday'],
  'System': ['المفتاح', 'القيمة', 'الوصف']
};
var CMD = { PENDING: 'في الانتظار', RUNNING: 'جاري التنفيذ', DONE: 'تم', FAILED: 'فشل', CANCELLED: 'ملغي' };

// أعمدة إضافية بيضيفها setup في تاب Leads لتتبع حالة كل عميل
var LEAD_STATE_COLS = ['حالة التواصل', 'الخطوة الحالية', 'النسخة', 'تاريخ أول إرسال', 'تاريخ آخر إرسال',
  'المتابعة الجاية', 'Thread ID', 'ميعاد الجلسة', 'حالة monday'];

// إعدادات اختيارية بيضيفها setup في تاب Company لو مش موجودة
var OPTIONAL_COMPANY_ROWS = [
  ['كلمة في عنوان الحجز', '', 'اختياري: لو اتكتبت، أي حد يحجز بعنوان فيه الكلمة دي يتضاف كعميل حتى لو مش في القايمة'],
  ['إيميل التنبيهات', '', 'اختياري: يوصلك عليه ملخص لما حد يرد أو يحجز'],
  ['عدد الإيميلات في كل تشغيل', 2, 'السكريبت بيشتغل كل 5 دقايق في وقت الإرسال'],
  ['أيام انتظار بعد آخر خطوة', 4, 'بعدها الحالة تبقى (مافيش رد)'],
  ['Reply-To', '', 'اختياري: الردود تروح على الإيميل ده بدل إيميل الإرسال']
];

var STATUS = {
  READY: 'جاهز', SENT: 'تم الإرسال', REPLIED: 'رد', BOOKED: 'حجز جلسة', NO_REPLY: 'مافيش رد',
  BOUNCE: 'Bounce', REMOVE: 'طلب الإزالة'
};
var PROC = {
  NEW: 'جديد', SYNCED: 'اتنقل لـ monday', DUP: 'مكرر', NO_EMAIL: 'مافيش إيميل', BAD: 'إيميل غلط', DNC: 'في Do-Not-Contact'
};

// أعمدة بورد monday: العنوان ← النوع + القيمة من الليد
var MONDAY_COLS = [
  { title: 'الشخص / المنصب', type: 'text' },
  { title: 'الإيميل', type: 'email' },
  { title: 'الموقع', type: 'link' },
  { title: 'التليفون', type: 'text' },
  { title: 'النشاط', type: 'dropdown' },
  { title: 'المدينة', type: 'dropdown' },
  { title: 'المصدر', type: 'dropdown' },
  { title: 'اللغة', type: 'dropdown' },
  { title: 'Segment', type: 'dropdown' },
  { title: 'الحالة', type: 'status' },
  { title: 'تاريخ أول إرسال', type: 'date' },
  { title: 'المتابعة الجاية', type: 'date' },
  { title: 'رقم المتابعة', type: 'numbers' },
  { title: 'ميعاد الجلسة', type: 'date' },
  { title: 'Thread ID', type: 'text' },
  { title: 'ملاحظات', type: 'long_text' }
];

// الحالة ← الجروب (لو الجروبات دي موجودة على البورد)
var GROUP_BY_STATUS = {
  'جاهز': 'في الانتظار', 'تم الإرسال': 'جاري التواصل', 'متابعة': 'جاري التواصل',
  'رد': 'ردود وحجوزات', 'حجز جلسة': 'ردود وحجوزات', 'مهتم': 'ردود وحجوزات',
  'مافيش رد': 'مقفول', 'Bounce': 'مقفول', 'طلب الإزالة': 'مقفول', 'غير مهتم': 'مقفول'
};

var AR_DAYS = { 7: 'الأحد', 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت' };
var EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
var BAD_EMAIL_PARTS = ['example.com', 'example.org', 'domain.com', 'email.com', 'sentry', 'wixpress', '.png', '.jpg',
  '.jpeg', '.gif', '.webp', '.svg', 'noreply', 'no-reply', 'donotreply'];

// ============================== القائمة ==============================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Outreach')
    .addItem('إعداد أول مرة', 'setup')
    .addSeparator()
    .addItem('استيراد من تاب Import', 'importFromSheet')
    .addItem('تجهيز الليدز الآن (إيميلات + Segments + monday)', 'processLeads')
    .addItem('إرسال دفعة الآن', 'sendQueueManual')
    .addItem('فحص الردود والحجوزات الآن', 'watchTick')
    .addSeparator()
    .addItem('تغيير monday Token', 'promptToken')
    .addItem('ربط الداشبورد (ENGINE_KEY)', 'promptEngineKey')
    .addItem('إيقاف كل التشغيل التلقائي', 'removeTriggers')
    .addToUi();
}

// ============================== الإعداد ==============================

function setup() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  // 1) Gmail API
  try { Gmail.Users.getProfile('me'); } catch (e) {
    ui.alert('فعّل Gmail API الأول: من محرر Apps Script ← Services (+) ← Gmail API ← Add. وبعدين شغّل الإعداد تاني.');
    return;
  }

  // 2) أعمدة الحالة في Leads + الإعدادات الاختيارية في Company
  var leadsSheet = sheet_(TAB.LEADS);
  var headers = headers_(leadsSheet);
  LEAD_STATE_COLS.forEach(function (h) {
    if (headers.indexOf(h) === -1) {
      var col = leadsSheet.getLastColumn() + 1;
      leadsSheet.getRange(1, col).setValue(h).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F4E5F');
      headers.push(h);
    }
  });
  var compSheet = sheet_(TAB.COMPANY);
  var labels = compSheet.getRange(1, 1, compSheet.getLastRow(), 1).getValues().map(function (r) { return String(r[0]).trim(); });
  OPTIONAL_COMPANY_ROWS.forEach(function (row) {
    if (labels.indexOf(row[0]) === -1) {
      compSheet.appendRow(row);
      compSheet.getRange(compSheet.getLastRow(), 2).setBackground('#FFF2CC');
    }
  });

  // 2b) تابات الداشبورد
  ensureDashboardTabs_();

  // 3) monday
  if (!props.getProperty('MONDAY_TOKEN')) promptToken();
  if (props.getProperty('MONDAY_TOKEN')) {
    var c = company_();
    var boardId = boardIdOf_(c['monday Board ID']);
    if (boardId && !mondayBoardExists_(boardId)) {
      var ans = ui.alert('البورد ' + boardId + ' مش ظاهر للـ Token ده.',
        'يا إما الرقم غلط، يا إما الـ Token من حساب monday تاني أو مالوش صلاحية على البورد.\n\nأعمل بورد جديد بدله؟', ui.ButtonSet.YES_NO);
      if (ans !== ui.Button.YES) return;
      boardId = '';
    }
    if (!boardId) {
      var res = monday_('mutation ($name:String!){create_board(board_name:$name, board_kind:private){id}}',
        { name: 'Outreach CRM — ' + (c['اسم الشركة'] || 'Company') });
      boardId = res.create_board.id;
    }
    setCompany_('monday Board ID', "'" + boardId); // نص عشان الشيت مايحوّلش الرقم

    ensureMondayColumns_(boardId);
  } else {
    ui.alert('مافيش monday Token، فالسكريبت هيشتغل من غير monday. تقدر تضيفه بعدين من القائمة.');
  }

  // 4) التشغيل التلقائي
  installTriggers_();
  writeSystem_(true);

  log_('setup', 0, 'نجح', 'الأعمدة والبورد والتشغيل التلقائي جاهزين');
  ui.alert('الإعداد خلص ✓\n\nالإرسال مش هيبدأ غير لما تخلّي "الإرسال شغال" = نعم في تاب Company.');
}

function promptToken() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('monday API Token', 'من monday: الصورة بتاعتك ← Developers ← My access tokens. الصقه هنا:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() === ui.Button.OK && r.getResponseText().trim()) {
    PropertiesService.getScriptProperties().setProperty('MONDAY_TOKEN', r.getResponseText().trim());
  }
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function installTriggers_() {
  removeTriggers();
  ScriptApp.newTrigger('processLeads').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('sendQueue').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('watchTick').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('runCommands').timeBased().everyMinutes(1).create();
}

/** بيعمل تابات Commands و Send Results و System وعمود "حالة monday" لو مش موجودين (بدون واجهة). */
function ensureDashboardTabs_() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(NEW_TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var heads = NEW_TABS[name];
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.setRightToLeft(true);
      sh.getRange(1, 1, 1, heads.length).setValues([heads]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F4E5F');
      sh.setFrozenRows(1);
      if (name === 'Commands') sh.getRange('C:D').setNumberFormat('@'); // البيانات والموعد نص
    } else {
      var cur = headers_(sh);
      heads.forEach(function (h) {
        if (cur.indexOf(h) === -1) {
          sh.getRange(1, sh.getLastColumn() + 1).setValue(h).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F4E5F');
          cur.push(h);
        }
      });
    }
  });
  var leadsSheet = sheet_(TAB.LEADS);
  var lh = headers_(leadsSheet);
  LEAD_STATE_COLS.forEach(function (h) {
    if (lh.indexOf(h) === -1) {
      leadsSheet.getRange(1, leadsSheet.getLastColumn() + 1).setValue(h).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1F4E5F');
      lh.push(h);
    }
  });
  var compSheet = sheet_(TAB.COMPANY);
  var labels = compSheet.getRange(1, 1, compSheet.getLastRow(), 1).getValues().map(function (r) { return String(r[0]).trim(); });
  OPTIONAL_COMPANY_ROWS.forEach(function (row) {
    if (labels.indexOf(row[0]) === -1) {
      compSheet.appendRow(row);
      compSheet.getRange(compSheet.getLastRow(), 2).setBackground('#FFF2CC');
    }
  });
}

function promptEngineKey() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('ربط الداشبورد', 'الصق ENGINE_KEY اللي ظاهر في الداشبورد (صفحة الشركات ← ربط):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() === ui.Button.OK && r.getResponseText().trim()) {
    PropertiesService.getScriptProperties().setProperty('ENGINE_KEY', r.getResponseText().trim());
    ensureDashboardTabs_();
    var hasTrigger = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'runCommands'; });
    if (!hasTrigger) ScriptApp.newTrigger('runCommands').timeBased().everyMinutes(1).create();
    writeSystem_(true);
    ui.alert('تم الربط ✓');
  }
}

// ============================== الاستيراد ==============================

/** بياخد الداتا من تاب Import: الصف 2 = أسماء أعمدة المصدر، والداتا من الصف 3، وكود المصدر في العمود A. */
function importFromSheet() {
  return withLock_(function () {
    var sh = sheet_(TAB.IMPORT);
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 3) { toast_('تاب Import فاضي'); return { rows: 0, summary: 'تاب Import فاضي' }; }
    var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var srcHeaders = values[0].slice(1).map(function (h) { return String(h).trim(); });
    var defaultSrc = String(values[0][0] || '').trim();

    var sources = {};
    table_(TAB.SOURCES).rows.forEach(function (s) { if (s['كود المصدر']) sources[String(s['كود المصدر']).trim()] = s; });
    var mapping = buildMapping_();
    var leads = table_(TAB.LEADS);
    var known = knownContacts_(leads);
    var dnc = dncSets_();
    var nextId = nextLeadId_(leads);
    var today = today_();
    var out = [], counts = { added: 0, dup: 0, noEmail: 0, dnc: 0, bad: 0 };

    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (row.slice(1).join('').trim() === '') continue;
      var src = String(row[0] || defaultSrc).trim();
      if (!sources[src]) throw new Error('كود المصدر "' + src + '" مش موجود في تاب Sources');
      if (sources[src]['مفعّل'] === 'لا') continue;

      var lead = {};
      srcHeaders.forEach(function (h, j) {
        if (!h) return;
        var field = (mapping[src] && mapping[src][h]) || (leads.headers.indexOf(h) > -1 ? h : null);
        if (field && row[j + 1] !== '' && !lead[field]) lead[field] = String(row[j + 1]).trim();
      });
      lead['ID'] = 'L' + ('0000' + (nextId++)).slice(-5);
      lead['تاريخ الإضافة'] = today;
      lead['كود المصدر'] = src;
      lead['الإيميل'] = pickEmail_(lead['الإيميل'] || '', lead['الموقع'] || '');
      lead['الموقع'] = normalizeUrl_(lead['الموقع'] || '');
      // نص عشان الشيت مايحوّلش 0501234567 لرقم ويضيع الصفر (setValues بيفسّر النص زي الكتابة اليدوي)
      if (lead['التليفون']) lead['التليفون'] = "'" + String(lead['التليفون']).replace(/^'+/, '');

      var email = lead['الإيميل'], domain = domainOf_(lead['الموقع']);
      if (email && (known.emails[email] || (domain && known.domainsWithEmail[domain]))) { lead['حالة المعالجة'] = PROC.DUP; counts.dup++; }
      else if (email && isDnc_(email, dnc)) { lead['حالة المعالجة'] = PROC.DNC; counts.dnc++; }
      else if (email) { lead['حالة المعالجة'] = PROC.NEW; counts.added++; known.emails[email] = true; if (domain) known.domainsWithEmail[domain] = true; }
      else if (lead['الموقع']) {
        if (known.sites[domain]) { lead['حالة المعالجة'] = PROC.DUP; counts.dup++; }
        else { lead['حالة المعالجة'] = PROC.NEW; counts.added++; }
      } else { lead['حالة المعالجة'] = PROC.NO_EMAIL; counts.noEmail++; }
      if (domain) known.sites[domain] = true;

      out.push(leads.headers.map(function (h) { return lead[h] !== undefined ? lead[h] : ''; }));
    }

    if (out.length) {
      var ls = leads.sheet;
      ls.getRange(ls.getLastRow() + 1, 1, out.length, leads.headers.length).setValues(out);
      sh.getRange(3, 1, lastRow - 2, lastCol).clearContent();
    }
    var msg = 'جديد: ' + counts.added + ' · مكرر: ' + counts.dup + ' · بدون إيميل: ' + counts.noEmail + ' · ممنوع: ' + counts.dnc;
    log_('importFromSheet', out.length, 'نجح', msg);
    toast_('اتستورد ' + out.length + ' صف — ' + msg);
    return { rows: out.length, added: counts.added, duplicate: counts.dup, noEmail: counts.noEmail, dnc: counts.dnc, summary: msg };
  });
}

function buildMapping_() {
  var m = {};
  table_(TAB.MAPPING).rows.forEach(function (r) {
    var s = String(r['كود المصدر']).trim(), from = String(r['اسم العمود في المصدر']).trim(), to = String(r['الحقل الموحد']).trim();
    if (!s || !from || !to) return;
    (m[s] = m[s] || {})[from] = to;
  });
  return m;
}

// ============================== تجهيز الليدز ==============================

/** كل ساعة: يستخرج الإيميلات من المواقع، يحدد الـ Segment، وينقل الجاهز لـ monday. */
function processLeads() {
  markRun_('processLeads');
  return withLock_(function () {
    var c = company_();
    var leads = table_(TAB.LEADS);
    var known = knownContacts_(leads);
    var dnc = dncSets_();
    var segments = activeSegments_();
    var stats = { extracted: 0, segmented: 0, synced: 0, mondayFailed: 0 };
    var started = Date.now();

    leads.rows.forEach(function (L) {
      if (Date.now() - started > 4.5 * 60 * 1000) return; // حد وقت التشغيل
      if (L['حالة المعالجة'] !== PROC.NEW) return;

      // (أ) استخراج الإيميل من الموقع
      if (!L['الإيميل'] && L['الموقع']) {
        if (String(L['ملاحظات']).indexOf('تم البحث في الموقع') > -1) return;
        var found = extractEmailFromSite_(L['الموقع']);
        if (found && !known.emails[found] && !isDnc_(found, dnc)) {
          leads.set(L, 'الإيميل', found); known.emails[found] = true; stats.extracted++;
        } else if (found) {
          leads.set(L, 'الإيميل', found);
          leads.set(L, 'حالة المعالجة', isDnc_(found, dnc) ? PROC.DNC : PROC.DUP);
          return;
        } else {
          leads.set(L, 'ملاحظات', appendNote_(L['ملاحظات'], 'تم البحث في الموقع: مالقيناش إيميل'));
          leads.set(L, 'حالة المعالجة', PROC.NO_EMAIL);
          return;
        }
      }
      if (!isValidEmail_(L['الإيميل'])) { leads.set(L, 'حالة المعالجة', PROC.BAD); return; }
      if (isDnc_(L['الإيميل'], dnc)) { leads.set(L, 'حالة المعالجة', PROC.DNC); return; }

      // (ب) الـ Segment
      if (!L['كود الـ Segment']) {
        var seg = matchSegment_(L, segments);
        if (!seg) {
          if (String(L['ملاحظات']).indexOf('مافيش Segment') === -1) leads.set(L, 'ملاحظات', appendNote_(L['ملاحظات'], 'مافيش Segment مطابق'));
          return;
        }
        leads.set(L, 'كود الـ Segment', seg['كود الـ Segment']);
        if (!L['اللغة']) leads.set(L, 'اللغة', seg['اللغة'] || 'AR');
        stats.segmented++;
      }

      // (ج) monday — خطأ في عميل واحد مايوقفش الباقي
      if (!L['حالة التواصل']) leads.set(L, 'حالة التواصل', STATUS.READY);
      if (mondayEnabled_(c)) {
        var mr = mondaySafe_(c, leads, L, null);
        if (mr.ok) { leads.set(L, 'حالة المعالجة', PROC.SYNCED); stats.synced++; } else stats.mondayFailed++;
      }
    });

    var summary = 'إيميلات من مواقع: ' + stats.extracted + ' · Segments: ' + stats.segmented + ' · monday: ' + stats.synced +
      (stats.mondayFailed ? ' · فشل monday: ' + stats.mondayFailed : '');
    log_('processLeads', stats.extracted + stats.segmented + stats.synced, stats.mondayFailed ? 'فيه أخطاء' : 'نجح', summary);
    stats.summary = summary;
    return stats;
  });
}

function activeSegments_() {
  return table_(TAB.SEGMENTS).rows.filter(function (s) { return s['كود الـ Segment'] && s['مفعّل'] !== 'لا'; });
}

function matchSegment_(L, segments) {
  var act = norm_(L['النشاط']), country = norm_(L['البلد']), city = norm_(L['المدينة']);
  if (!act) return null;
  for (var i = 0; i < segments.length; i++) {
    var s = segments[i];
    var sAct = norm_(s['النشاط']), sCountry = norm_(s['البلد']), sCity = norm_(s['المدينة (اختياري)']);
    if (!sAct || (act.indexOf(sAct) === -1 && sAct.indexOf(act) === -1)) continue;
    if (sCountry && country && country !== sCountry) continue;
    if (sCity && (!city || (city.indexOf(sCity) === -1 && sCity.indexOf(city) === -1))) continue;
    return s;
  }
  return null;
}

function extractEmailFromSite_(url) {
  var base = normalizeUrl_(url).replace(/\/+$/, '');
  var domain = domainOf_(base);
  var paths = ['', '/contact', '/contact-us', '/contactus', '/about', '/ar/contact', '/en/contact'];
  var all = [];
  for (var i = 0; i < paths.length && all.length === 0; i++) {
    try {
      var r = UrlFetchApp.fetch(base + paths[i], { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false });
      if (r.getResponseCode() >= 400) continue;
      var html = r.getContentText().replace(/&#64;|\[at\]|\(at\)/gi, '@');
      all = (html.match(EMAIL_RE) || []).map(function (e) { return e.toLowerCase(); }).filter(isValidEmail_);
    } catch (e) { /* موقع مش شغال */ }
  }
  if (!all.length) return '';
  all.sort(function (a, b) {
    var sa = (domainOf_(a.split('@')[1]) === domain ? 0 : 1), sb = (domainOf_(b.split('@')[1]) === domain ? 0 : 1);
    return sa - sb;
  });
  return all[0];
}

// ============================== الإرسال ==============================

function sendQueueManual() { sendQueue(true); }

/** كل 5 دقايق: يبعت المتابعات المستحقة الأول، وبعدين الجديد حسب نصيب كل Segment. */
function sendQueue(manual) {
  manual = manual === true;
  if (!manual) markRun_('sendQueue');
  withLock_(function () {
    var c = company_();
    if (c['الإرسال شغال'] !== 'نعم') { if (manual) toast_('الإرسال متوقف: خلّي "الإرسال شغال" = نعم'); return; }
    if (!manual && !inSendWindow_(c)) return;
    var r = sendBatch_({ count: Number(c['عدد الإيميلات في كل تشغيل']) || 2, ignoreWindow: manual }, manual ? 'manual' : 'auto');
    if (manual) toast_(r.summary);
  });
}

/**
 * قلب الإرسال: بيبني الطابور ويبعت ويسجل كل نتيجة في تاب Send Results.
 * opts: {count, leadIds?, segment?, dryRun?, ignoreWindow?, ignoreEnabled?}
 * بيرجع {sent, failed, results:[...], summary}
 */
function sendBatch_(opts, commandId) {
  opts = opts || {};
  var c = company_();
  var dry = opts.dryRun === true;
  if (!dry && !opts.ignoreEnabled && c['الإرسال شغال'] !== 'نعم') throw new Error('الإرسال متوقف ("الإرسال شغال" = لا)');
  if (!dry && !opts.ignoreWindow && !inSendWindow_(c)) return { sent: 0, failed: 0, results: [], summary: 'برّه وقت الإرسال' };
  if (!dry && bounceGuard_(c)) throw new Error('الإرسال وقف بسبب نسبة Bounce عالية — راجع الداتا');

  var cap = Number(c['الحد اليومي للإيميلات']) || 15;
  var gapSec = Math.min(Number(c['الفاصل بين الإيميلات (ثواني)']) || 60, 60);
  var props = PropertiesService.getScriptProperties();
  var dayKey = 'SENT_' + today_();
  var sentToday = Number(props.getProperty(dayKey) || 0);
  var remaining = cap - sentToday;
  var budget = Math.min(Number(opts.count) || 2, dry ? cap : remaining);
  if (budget <= 0) return { sent: 0, failed: 0, results: [], summary: 'وصلت للحد اليومي (' + cap + ')' };

  var leads = table_(TAB.LEADS);
  var seq = sequences_(), tpls = templates_(), dnc = dncSets_(), segments = activeSegments_();
  var me = myAddresses_(c), today = today_();
  var queue = buildQueue_(c, leads, segments, cap, today, opts);

  // مهلة التشغيل: نسيب وقت للتسجيل
  var started = Date.now(), maxMs = 4.5 * 60 * 1000;
  var results = [], sent = 0, failed = 0;
  for (var i = 0; i < queue.length && (sent + failed) < budget; i++) {
    if (Date.now() - started > maxMs) break;
    var L = queue[i];
    var res = { leadId: L['ID'], email: L['الإيميل'], step: '', template: '', ok: false, error: '', threadId: L['Thread ID'] || '', monday: '', mondayError: '' };
    try {
      if (isDnc_(L['الإيميل'], dnc)) { if (!dry) leads.set(L, 'حالة التواصل', STATUS.REMOVE); res.error = 'في Do-Not-Contact'; results.push(res); continue; }
      if (!dry && L['Thread ID'] && threadHasReply_(L['Thread ID'], me)) { checkLeadThread_(c, leads, L, me, dnc); res.error = 'العميل رد قبل المتابعة — اتوقف'; results.push(res); continue; }
      var plan = planNextStep_(c, L, seq, tpls);
      if (plan.done) {
        if (!dry) {
          leads.set(L, 'حالة التواصل', STATUS.NO_REPLY);
          leads.set(L, 'المتابعة الجاية', '');
          var mr0 = mondaySafe_(c, leads, L, { 'الحالة': STATUS.NO_REPLY, 'المتابعة الجاية': '' });
          res.monday = mr0.label; res.mondayError = mr0.error || '';
        }
        res.error = 'خلصت الخطوات — الحالة بقت (مافيش رد)';
        results.push(res);
        continue;
      }
      res.step = plan.step.step;
      res.template = plan.step.template + '/' + plan.tpl.version;
      if (dry) {
        fillTemplate_(plan.tpl.body, L, c, plan.lang); // يتأكد إن المتغيرات كاملة
        res.ok = true;
        res.error = 'معاينة';
        sent++;
      } else {
        var r = sendNextStep_(c, leads, L, plan, today);
        res.ok = true; res.threadId = r.threadId; res.monday = r.monday.label; res.mondayError = r.monday.error || '';
        sent++;
        props.setProperty(dayKey, String(sentToday + sent));
        if ((sent + failed) < budget && i < queue.length - 1) Utilities.sleep(gapSec * 1000);
      }
    } catch (e) {
      res.error = String(e.message || e).slice(0, 300);
      failed++;
    }
    results.push(res);
  }
  appendResults_(commandId || 'manual', results, dry);
  var summary = (dry ? 'معاينة: ' + sent + ' هيتبعتلهم' : 'اتبعت ' + sent) + (failed ? ' · فشل ' + failed : '') +
    (queue.length === 0 ? ' · مافيش حد مستحق دلوقتي' : '');
  if (!dry && (sent || failed)) log_('sendBatch', sent, failed ? 'فيه أخطاء' : 'نجح', summary);
  return { sent: sent, failed: failed, results: results, summary: summary };
}

/** المتابعات المستحقة الأول، وبعدين الجديد حسب نصيب الـ Segment. لو فيه leadIds بياخدهم هما بس. */
function buildQueue_(c, leads, segments, cap, today, opts) {
  var queue = [];
  var only = opts.leadIds && opts.leadIds.length ? opts.leadIds.map(String) : null;
  var segFilter = opts.segment ? String(opts.segment) : null;
  var ok = function (L) {
    if (only && only.indexOf(String(L['ID'])) === -1) return false;
    if (segFilter && String(L['كود الـ Segment']) !== segFilter) return false;
    return true;
  };
  leads.rows.forEach(function (L) {
    var st = String(L['حالة التواصل']);
    if (ok(L) && (st === STATUS.SENT || st.indexOf('متابعة') === 0) && L['المتابعة الجاية'] && day_(L['المتابعة الجاية']) <= today) queue.push(L);
  });
  var mondayOn = mondayEnabled_(c);
  if (only) {
    leads.rows.forEach(function (L) {
      if (ok(L) && L['حالة التواصل'] === STATUS.READY && L['كود الـ Segment'] && (!mondayOn || L['monday Item ID'])) queue.push(L);
    });
    return queue;
  }
  var newToday = {};
  leads.rows.forEach(function (L) { if (day_(L['تاريخ أول إرسال']) === today) newToday[L['كود الـ Segment']] = (newToday[L['كود الـ Segment']] || 0) + 1; });
  var segAllow = {};
  segments.forEach(function (s) { segAllow[s['كود الـ Segment']] = Math.max(0, Math.round(cap * (Number(s['نصيبه من الحد اليومي']) || 0)) - (newToday[s['كود الـ Segment']] || 0)); });
  leads.rows.forEach(function (L) {
    var seg = L['كود الـ Segment'];
    if (ok(L) && L['حالة التواصل'] === STATUS.READY && segAllow[seg] > 0 && (!mondayOn || L['monday Item ID'])) { queue.push(L); segAllow[seg]--; }
  });
  return queue;
}

/** بيحدد الخطوة الجاية والقالب من غير ما يبعت. */
function planNextStep_(c, L, seq, tpls) {
  var steps = seq[L['كود الـ Segment']];
  if (!steps || !steps.length) throw new Error('مافيش خطوات في Sequence للـ Segment ' + L['كود الـ Segment']);
  var started = L['حالة التواصل'] !== STATUS.READY;
  var current = started ? Number(L['الخطوة الحالية']) : -1;
  var idx = -1;
  for (var i = 0; i < steps.length; i++) if (steps[i].step > current) { idx = i; break; }
  if (idx === -1) return { done: true };
  var step = steps[idx];
  var lang = String(L['اللغة'] || 'AR').toUpperCase();
  var variants = tpls[step.template];
  if (!variants || !variants.length) throw new Error('القالب ' + step.template + ' مش موجود في Templates');
  var tpl;
  if (!started) {
    var pool = variants.filter(function (t) { return t.version === 'A' || t.version === 'B'; });
    if (!pool.length) pool = variants;
    var n = Number(String(L['ID']).replace(/\D/g, '')) || 0;
    tpl = pool[n % pool.length];
  } else {
    tpl = variants.filter(function (t) { return t.version === L['النسخة']; })[0] || variants[0];
  }
  return { done: false, started: started, step: step, next: steps[idx + 1], tpl: tpl, lang: lang };
}

function appendResults_(commandId, results, dry) {
  if (!results.length) return;
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB.RESULTS);
  if (!sh) return; // الداشبورد مش متركب — عادي
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var heads = headers_(sh);
  var rows = results.map(function (r) {
    var o = {
      'Command ID': commandId, 'الوقت': now, 'Lead ID': r.leadId, 'الإيميل': r.email, 'الخطوة': r.step,
      'القالب/النسخة': r.template, 'تم الإرسال': dry ? 'معاينة' : (r.ok ? 'نعم' : 'لا'), 'الخطأ': dry && r.ok ? '' : r.error,
      'Thread ID': r.threadId, 'monday': r.monday, 'خطأ monday': r.mondayError
    };
    return heads.map(function (h) { return o[h] !== undefined ? o[h] : ''; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, heads.length).setValues(rows);
}

/** يبعت الخطوة اللي اتحددت في planNextStep_ ويحدّث الشيت و monday. */
function sendNextStep_(c, leads, L, plan, today) {
  var tpl = plan.tpl, step = plan.step, lang = plan.lang, started = plan.started;
  var body = fillTemplate_(tpl.body, L, c, lang);
  var subject = fillTemplate_(tpl.subject, L, c, lang);
  var res;
  if (!started) {
    res = sendMail_(c, L['الإيميل'], subject, body, lang, null);
    leads.set(L, 'Thread ID', res.threadId);
    leads.set(L, 'تاريخ أول إرسال', today);
    leads.set(L, 'النسخة', tpl.version);
  } else {
    res = sendMail_(c, L['الإيميل'], null, body, lang, L['Thread ID']);
  }
  var waitDays = plan.next ? plan.next.delay : (Number(c['أيام انتظار بعد آخر خطوة']) || 4);
  var nextDate = addDays_(today, waitDays);
  var st = step.step === 0 ? STATUS.SENT : 'متابعة ' + step.step;
  leads.set(L, 'حالة التواصل', st);
  leads.set(L, 'الخطوة الحالية', step.step);
  leads.set(L, 'تاريخ آخر إرسال', today);
  leads.set(L, 'المتابعة الجاية', nextDate);
  var upd = { 'الحالة': st, 'المتابعة الجاية': nextDate, 'رقم المتابعة': step.step, 'Thread ID': L['Thread ID'] };
  if (!started) upd['تاريخ أول إرسال'] = today;
  var m = mondaySafe_(c, leads, L, upd);
  return { threadId: res.threadId, monday: m };
}

function sequences_() {
  var out = {};
  table_(TAB.SEQUENCE).rows.forEach(function (r) {
    var s = String(r['كود الـ Segment']).trim();
    if (!s || r['كود القالب'] === '') return;
    (out[s] = out[s] || []).push({
      step: Number(r['رقم الخطوة']) || 0,
      delay: Number(r['بعد كام يوم من الخطوة اللي قبلها']) || 0,
      template: String(r['كود القالب']).trim()
    });
  });
  Object.keys(out).forEach(function (k) { out[k].sort(function (a, b) { return a.step - b.step; }); });
  return out;
}

function templates_() {
  var out = {};
  table_(TAB.TEMPLATES).rows.forEach(function (r) {
    var code = String(r['كود القالب']).trim();
    if (!code || !r['النص']) return;
    (out[code] = out[code] || []).push({
      version: String(r['النسخة'] || '-').trim(),
      subject: String(r['الموضوع'] || ''),
      body: String(r['النص'])
    });
  });
  return out;
}

/** يملا المتغيرات {...} من أعمدة الليد وتاب Company. أي متغير مش معروف يوقف الإرسال. */
function fillTemplate_(text, L, c, lang) {
  var vars = {};
  Object.keys(L).forEach(function (k) { if (k.charAt(0) !== '_') vars[k.replace(/\s+/g, '_')] = L[k]; });
  Object.keys(c).forEach(function (k) { vars[k.replace(/\s+/g, '_')] = c[k]; });
  var isAr = lang !== 'EN';
  vars['اسم_الشخص'] = L['اسم الشخص'] || (isAr ? 'فريق ' + L['اسم الجهة'] : L['اسم الجهة'] + ' team');
  vars['اسم_شركتنا'] = c['اسم الشركة'];
  vars['اسم_المرسل'] = c['اسم المرسل'];
  vars['وصف_الخدمة'] = c['وصف الخدمة في سطر'];
  vars['لينك_الحجز'] = c['لينك صفحة الحجز'];
  var prof = String(c['لينك البروفايل'] || '');
  vars['لينك_البروفايل'] = prof ? prof + (prof.indexOf('?') > -1 ? '&' : '?') + 'ref=' + L['ID'] : '';
  vars['التوقيع'] = [c['اسم المرسل'], c['المنصب'], c['اسم الشركة'], c['رقم الواتساب'] ? (isAr ? 'واتساب: ' : 'WhatsApp: ') + c['رقم الواتساب'] : '']
    .filter(String).join('\n');

  var missing = [];
  var out = String(text).replace(/\{([^{}]+)\}/g, function (m, key) {
    var k = key.trim().replace(/\s+/g, '_');
    var v = vars[k];
    if (v === undefined || v === null || String(v).trim() === '') { missing.push(key); return m; }
    return isDate_(v) ? Utilities.formatDate(v, tz_(c), 'yyyy-MM-dd') : String(v);
  });
  if (missing.length) throw new Error('متغيرات ناقصة: ' + missing.join('، '));
  return out;
}

/** إرسال عن طريق Gmail API عشان المتابعات تنزل في نفس المحادثة عند العميل. */
function sendMail_(c, to, subject, text, lang, threadId) {
  var from = String(c['إيميل الإرسال'] || Session.getEffectiveUser().getEmail()).trim();
  var sender = senderInfo_(c);
  if (!sender.verified) throw new Error('الإيميل المرسل ' + from + ' مش متفعّل كـ "Send mail as" في Gmail الحساب ' + sender.account);
  var name = String(c['اسم المرسل'] || '') + (c['اسم الشركة'] ? ' — ' + c['اسم الشركة'] : '');
  var inReplyTo = '', refs = '';
  if (threadId) {
    var msgs = GmailApp.getThreadById(threadId).getMessages();
    subject = 'Re: ' + msgs[0].getSubject().replace(/^(Re:\s*)+/i, '');
    var ids = msgs.map(function (m) { return m.getHeader('Message-ID'); }).filter(String);
    inReplyTo = ids[ids.length - 1] || '';
    refs = ids.join(' ');
  }
  var raw = buildMime_({ from: from, fromName: name, to: to, subject: subject, text: text, html: toHtml_(text, lang),
    inReplyTo: inReplyTo, references: refs, replyTo: String(c['Reply-To'] || '').trim() });
  var payload = { raw: Utilities.base64EncodeWebSafe(raw, Utilities.Charset.UTF_8) };
  if (threadId) payload.threadId = threadId;
  return Gmail.Users.Messages.send(payload, 'me');
}

function buildMime_(o) {
  var b = 'b_' + Utilities.getUuid().replace(/-/g, '');
  var enc = function (s) { return '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?='; };
  var lines = [
    'From: ' + enc(o.fromName) + ' <' + o.from + '>',
    'To: ' + o.to,
    'Subject: ' + enc(o.subject),
    'MIME-Version: 1.0',
    'List-Unsubscribe: <mailto:' + o.from + '?subject=unsubscribe>'
  ];
  if (o.replyTo) lines.push('Reply-To: ' + o.replyTo);
  if (o.inReplyTo) lines.push('In-Reply-To: ' + o.inReplyTo, 'References: ' + o.references);
  lines.push('Content-Type: multipart/alternative; boundary="' + b + '"', '',
    '--' + b, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    wrap76_(Utilities.base64Encode(o.text, Utilities.Charset.UTF_8)), '',
    '--' + b, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    wrap76_(Utilities.base64Encode(o.html, Utilities.Charset.UTF_8)), '',
    '--' + b + '--');
  return lines.join('\r\n');
}

function toHtml_(text, lang) {
  var esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  esc = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>');
  var dir = lang === 'EN' ? 'ltr' : 'rtl';
  return '<div dir="' + dir + '" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;text-align:' +
    (dir === 'rtl' ? 'right' : 'left') + '">' + esc + '</div>';
}

function inSendWindow_(c) {
  var tz = tz_(c), now = new Date();
  var dayName = AR_DAYS[Number(Utilities.formatDate(now, tz, 'u'))];
  var days = String(c['أيام الإرسال'] || '').split(/[,،]/).map(function (d) { return d.trim(); });
  if (days.indexOf(dayName) === -1) return false;
  var h = Number(Utilities.formatDate(now, tz, 'H'));
  return h >= Number(c['ساعة بداية الإرسال'] || 9) && h < Number(c['ساعة نهاية الإرسال'] || 12);
}

/** لو نسبة الـ Bounce عدّت الحد، الإرسال يقف لوحده. */
function bounceGuard_(c) {
  var rows = table_(TAB.LEADS).rows;
  var sent = rows.filter(function (L) { return L['تاريخ أول إرسال']; }).length;
  var bounced = rows.filter(function (L) { return L['حالة التواصل'] === STATUS.BOUNCE; }).length;
  var max = Number(c['أقصى نسبة Bounce']) || 0.03;
  if (sent >= 20 && bounced / sent > max) {
    setCompany_('الإرسال شغال', 'لا');
    var msg = 'الإرسال وقف: نسبة الـ Bounce ' + Math.round(bounced / sent * 100) + '% (' + bounced + ' من ' + sent + '). راجع جودة الداتا قبل ما تشغّله تاني.';
    log_('bounceGuard', bounced, 'إيقاف', msg);
    notify_(c, 'Outreach: الإرسال وقف', msg);
    return true;
  }
  return false;
}

// ============================== الردود والـ Bounce والحجوزات ==============================

/** كل 15 دقيقة: يفحص المحادثات المفتوحة والحجوزات. */
function watchTick() {
  markRun_('watchTick');
  withLock_(function () {
    var c = company_();
    var leads = table_(TAB.LEADS);
    var me = myAddresses_(c), dnc = dncSets_();
    var events = [];
    var cutoff = addDays_(today_(), -30);

    leads.rows.forEach(function (L) {
      var st = String(L['حالة التواصل']);
      var active = st === STATUS.SENT || st.indexOf('متابعة') === 0 || (st === STATUS.NO_REPLY && day_(L['تاريخ آخر إرسال']) >= cutoff);
      if (!active || !L['Thread ID']) return;
      try {
        var r = checkLeadThread_(c, leads, L, me, dnc);
        if (r) events.push(r);
      } catch (e) { log_('watchTick', 0, 'خطأ', L['ID'] + ': ' + e.message); }
    });

    events = events.concat(checkBookings_(c, leads));
    if (events.length) {
      log_('watchTick', events.length, 'نجح', events.join(' | ').slice(0, 1000));
      notify_(c, 'Outreach: ' + events.length + ' تحديث جديد', events.join('\n'));
    }
  });
}

function threadHasReply_(threadId, me) {
  return GmailApp.getThreadById(threadId).getMessages().some(function (m) { return !isMine_(m.getFrom(), me); });
}

/** بيرجع وصف للحدث لو لقى رد أو Bounce. */
function checkLeadThread_(c, leads, L, me, dnc) {
  var msgs = GmailApp.getThreadById(L['Thread ID']).getMessages();
  for (var i = 1; i < msgs.length; i++) {
    var m = msgs[i];
    var from = m.getFrom();
    if (isMine_(from, me)) continue;
    var body = m.getPlainBody() || '';
    var isBounce = /mailer-daemon|postmaster/i.test(from) || /delivery status notification|undeliverable|mail delivery (failed|subsystem)|لم يتم تسليم/i.test(m.getSubject());
    if (isBounce) {
      leads.set(L, 'حالة التواصل', STATUS.BOUNCE);
      leads.set(L, 'المتابعة الجاية', '');
      addDnc_(L['الإيميل'], 'إيميل', 'Bounce', L['ID']);
      mondaySafe_(c, leads, L, { 'الحالة': STATUS.BOUNCE, 'المتابعة الجاية': '' });
      return null; // مش محتاج تنبيه
    }
    var firstLines = body.split(/\r?\n/).slice(0, 3).join(' ').trim();
    var optOut = /^\s*(لا|لأ|no|stop|unsubscribe|remove|إلغاء|الغاء)(?=$|[\s.,!،؛:؟?])/i.test(firstLines) || /unsubscribe/i.test(m.getSubject());
    var st = optOut ? STATUS.REMOVE : STATUS.REPLIED;
    leads.set(L, 'حالة التواصل', st);
    leads.set(L, 'المتابعة الجاية', '');
    if (optOut) addDnc_(L['الإيميل'], 'إيميل', 'طلب الإزالة', L['ID']);
    var mr = mondaySafe_(c, leads, L, { 'الحالة': st, 'المتابعة الجاية': '' });
    if (mr.ok) {
      try { mondayPostUpdate_(c, L, 'رد من ' + from + ':\n\n' + body.split(/\n>|\nOn .+wrote:|\nفي .+كتب/)[0].slice(0, 1500)); } catch (e) { log_('monday', 0, 'خطأ', L['ID'] + ': ' + e.message); }
    }
    return (optOut ? 'طلب إزالة: ' : 'رد جديد: ') + L['اسم الجهة'] + ' <' + L['الإيميل'] + '>';
  }
  return null;
}

function checkBookings_(c, leads) {
  var events = [];
  var tz = tz_(c), keyword = norm_(c['كلمة في عنوان الحجز']);
  var byEmail = {};
  leads.rows.forEach(function (L) { if (L['الإيميل']) byEmail[String(L['الإيميل']).toLowerCase()] = L; });
  var me = myAddresses_(c);
  var now = new Date();
  var cal = CalendarApp.getDefaultCalendar().getEvents(new Date(now.getTime() - 2 * 864e5), new Date(now.getTime() + 60 * 864e5));

  cal.forEach(function (ev) {
    var when = Utilities.formatDate(ev.getStartTime(), tz, 'yyyy-MM-dd HH:mm');
    var guests = ev.getGuestList().map(function (g) { return g.getEmail().toLowerCase(); }).filter(function (e) { return !isMine_(e, me); });
    guests.forEach(function (email) {
      var L = byEmail[email];
      if (!L && keyword && norm_(ev.getTitle()).indexOf(keyword) > -1) {
        L = addBookingLead_(leads, email, ev.getTitle());
        byEmail[email] = L;
      }
      if (!L || dateTime_(L['ميعاد الجلسة'], tz) === when) return;
      leads.set(L, 'ميعاد الجلسة', ev.getStartTime());
      leads.set(L, 'حالة التواصل', STATUS.BOOKED);
      leads.set(L, 'المتابعة الجاية', '');
      mondaySafe_(c, leads, L, { 'الحالة': STATUS.BOOKED, 'ميعاد الجلسة': ev.getStartTime(), 'المتابعة الجاية': '' });
      events.push('حجز جلسة: ' + (L['اسم الجهة'] || email) + ' — ' + when);
    });
  });
  return events;
}

function addBookingLead_(leads, email, title) {
  var lead = {
    'ID': 'L' + ('0000' + nextLeadId_(leads)).slice(-5), 'تاريخ الإضافة': today_(), 'كود المصدر': 'حجز مباشر',
    'اسم الجهة': title, 'الإيميل': email, 'حالة المعالجة': PROC.NEW, 'ملاحظات': 'حجز من صفحة الحجز مباشرة'
  };
  leads.sheet.appendRow(leads.headers.map(function (h) { return lead[h] !== undefined ? lead[h] : ''; }));
  lead._row = leads.sheet.getLastRow();
  leads.rows.push(lead);
  return lead;
}

// ============================== أوامر الداشبورد ==============================

/**
 * كل دقيقة: ينفّذ الأوامر اللي الداشبورد كتبها في تاب Commands.
 * لو مفيش أوامر مستحقة بيخرج بسرعة.
 */
function runCommands() {
  markRun_('runCommands');
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(TAB.COMMANDS);
  if (!sh || sh.getLastRow() < 2) { heartbeatMaybe_(); return; }
  var heads = headers_(sh);
  var col = function (h) { return heads.indexOf(h); };
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, heads.length).getValues();
  var now = Date.now();
  var due = [], stuck = [];
  data.forEach(function (r, i) {
    var st = String(r[col('الحالة')]).trim();
    if (st === CMD.PENDING) {
      var at = r[col('موعد التنفيذ')];
      var t = at ? (isDate_(at) ? at.getTime() : Date.parse(String(at))) : 0;
      if (!t || isNaN(t) || t <= now) due.push({ row: i + 2, vals: r });
    } else if (st === CMD.RUNNING) {
      var ex = Date.parse(String(r[col('تاريخ التنفيذ')]));
      if (ex && now - ex > 10 * 60 * 1000) stuck.push(i + 2);
    }
  });
  stuck.forEach(function (row) {
    sh.getRange(row, col('الحالة') + 1).setValue(CMD.FAILED);
    sh.getRange(row, col('النتيجة') + 1).setValue('{"error":"التنفيذ اتقطع (تعدّى الوقت المسموح)"}');
  });
  if (!due.length) { heartbeatMaybe_(); return; }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // في تشغيل تاني شغال — نحاول الدقيقة الجاية
  CACHE_.locked = true;
  var started = Date.now();
  try {
    for (var k = 0; k < due.length; k++) {
      if (Date.now() - started > 4 * 60 * 1000) break;
      var d = due[k];
      var cell = function (h) { return sh.getRange(d.row, col(h) + 1); };
      // اتلغى أو اتنفذ من تشغيل تاني؟
      if (String(cell('الحالة').getValue()).trim() !== CMD.PENDING) continue;
      cell('الحالة').setValue(CMD.RUNNING);
      cell('تاريخ التنفيذ').setValue(new Date().toISOString());
      SpreadsheetApp.flush();
      var id = String(d.vals[col('ID')]);
      var type = String(d.vals[col('النوع')]).trim();
      var payload = {};
      try { payload = JSON.parse(String(d.vals[col('البيانات')] || '{}')); } catch (e) { payload = {}; }
      var result, ok = true;
      try {
        CACHE_.company = null;
        result = executeCommand_(type, payload, id, { sheet: sh, row: d.row, dataCol: col('البيانات') + 1 });
      } catch (e) {
        ok = false;
        result = { error: String(e.message || e).slice(0, 500) };
        PropertiesService.getScriptProperties().setProperty('LAST_ERROR', new Date().toISOString() + ' — ' + type + ': ' + result.error);
      }
      cell('الحالة').setValue(ok ? CMD.DONE : CMD.FAILED);
      cell('النتيجة').setValue(JSON.stringify(result).slice(0, 45000));
      SpreadsheetApp.flush();
    }
  } finally {
    CACHE_.locked = false;
    lock.releaseLock();
  }
  writeSystem_(false);
}

function executeCommand_(type, p, id, ctx) {
  switch (type) {
    case 'import': return importFromSheet();
    case 'process': return processLeads();
    case 'send': return sendBatch_({
      count: p.count, leadIds: p.leadIds, segment: p.segment, dryRun: p.dryRun === true,
      ignoreWindow: p.ignoreWindow === true, ignoreEnabled: p.ignoreEnabled === true
    }, id);
    case 'sendTest': return sendTest_(p);
    case 'retryMonday': return retryMonday_(p.leadIds || []);
    case 'testMonday': return testMonday_();
    case 'checkSender': var info = senderInfo_(company_(), true); writeSystem_(true); return info;
    case 'setMondayToken': return setMondayTokenFromCommand_(p, ctx);
    case 'setup':
      ensureDashboardTabs_();
      installTriggers_();
      var c = company_();
      if (mondayEnabled_(c)) ensureMondayColumns_(boardIdOf_(c['monday Board ID']));
      writeSystem_(true);
      return { summary: 'التابات والتشغيل التلقائي اتظبطوا' + (mondayEnabled_(c) ? ' + أعمدة monday' : '') };
    case 'heartbeat': writeSystem_(true); return { summary: 'اتحدّث' };
    default: throw new Error('نوع أمر مش معروف: ' + type);
  }
}

/** إيميل تجريبي: مابيغيّرش أي حالة في الشيت. */
function sendTest_(p) {
  if (!p.to || String(p.to).indexOf('@') === -1) throw new Error('اكتب إيميل صحيح للتجربة');
  var c = company_();
  var lang = 'AR', subject, body;
  if (p.leadId && p.template) {
    var leads = table_(TAB.LEADS);
    var L = leads.rows.filter(function (r) { return String(r['ID']) === String(p.leadId); })[0];
    if (!L) throw new Error('العميل ' + p.leadId + ' مش موجود');
    var variants = templates_()[p.template];
    if (!variants) throw new Error('القالب ' + p.template + ' مش موجود');
    var tpl = variants.filter(function (t) { return t.version === (p.version || 'A'); })[0] || variants[0];
    lang = String(L['اللغة'] || 'AR').toUpperCase();
    subject = fillTemplate_(tpl.subject || '(بدون موضوع)', L, c, lang);
    if (/^\(/.test(subject)) subject = 'Re: ' + p.template;
    body = fillTemplate_(tpl.body, L, c, lang);
  } else {
    subject = 'اختبار الإيميل المرسل — ' + (c['اسم الشركة'] || '');
    body = 'ده إيميل تجريبي من Outreach Engine.\nلو وصلك في الـ Inbox يبقى الإرسال شغال تمام.\n\n' +
      [c['اسم المرسل'], c['المنصب'], c['اسم الشركة']].filter(String).join('\n');
  }
  var res = sendMail_(c, String(p.to).trim(), '[TEST] ' + subject, body, lang, null);
  return { summary: 'اتبعت لـ ' + p.to, threadId: res.threadId, subject: '[TEST] ' + subject };
}

function testMonday_() {
  var c = company_();
  var token = PropertiesService.getScriptProperties().getProperty('MONDAY_TOKEN');
  if (!token) throw new Error('مافيش monday Token');
  var me = monday_('query { me { name email } }', {});
  var boardId = boardIdOf_(c['monday Board ID']);
  var board = null;
  if (boardId) {
    var d = monday_('query ($ids:[ID!]){boards(ids:$ids){id name columns{title}}}', { ids: [boardId] });
    board = d.boards && d.boards[0];
  }
  var missing = board ? MONDAY_COLS.map(function (x) { return x.title; }).filter(function (t) {
    return !board.columns.some(function (col) { return col.title === t; });
  }) : [];
  return {
    summary: 'monday شغال: ' + me.me.name + (board ? ' · البورد: ' + board.name : boardId ? ' · البورد مش ظاهر!' : ' · مافيش Board ID'),
    account: me.me.name, board: board ? board.name : null, boardReachable: !!board, missingColumns: missing
  };
}

/** معلومات الإيميل المرسل: هل متفعّل كـ Send mail as؟ */
function senderInfo_(c, fresh) {
  if (CACHE_.sender && !fresh) return CACHE_.sender;
  var account = Session.getEffectiveUser().getEmail();
  var aliases = [];
  try { aliases = GmailApp.getAliases(); } catch (e) { /* */ }
  var sender = String(c['إيميل الإرسال'] || account).trim().toLowerCase();
  var list = [String(account).toLowerCase()].concat(aliases.map(function (a) { return String(a).toLowerCase(); }));
  var quota = null;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { /* */ }
  CACHE_.sender = { account: account, sender: sender, aliases: aliases, verified: list.indexOf(sender) > -1, quota: quota };
  return CACHE_.sender;
}

/**
 * التوكن بييجي متشفّر بـ ENGINE_KEY:
 *   keystream[i] = HMAC-SHA256(key, nonce + ':' + i)  (كل بلوك 32 بايت)
 *   c = plaintext XOR keystream ،  tag = base64(HMAC-SHA256(key, nonce + ':' + c))
 * بعد القراية خانة البيانات بتتمسح وتبقى ***.
 */
function setMondayTokenFromCommand_(p, ctx) {
  try { ctx.sheet.getRange(ctx.row, ctx.dataCol).setValue('***'); SpreadsheetApp.flush(); } catch (e) { /* */ }
  var key = PropertiesService.getScriptProperties().getProperty('ENGINE_KEY');
  if (!key) throw new Error('الداشبورد مش مربوط: من القائمة Outreach ← ربط الداشبورد');
  var token = openSealed_(p.sealed, key);
  PropertiesService.getScriptProperties().setProperty('MONDAY_TOKEN', token);
  var c = company_();
  var out = { summary: 'التوكن اتحفظ' };
  if (boardIdOf_(c['monday Board ID'])) {
    try { ensureMondayColumns_(boardIdOf_(c['monday Board ID'])); out.summary += ' وأعمدة البورد اتظبطت'; }
    catch (e) { out.summary += ' — بس البورد: ' + e.message; }
  }
  writeSystem_(true);
  return out;
}

function openSealed_(sealed, key) {
  if (!sealed || !sealed.n || !sealed.c || !sealed.t) throw new Error('بيانات التوكن ناقصة');
  var expect = Utilities.base64Encode(Utilities.computeHmacSha256Signature(sealed.n + ':' + sealed.c, key));
  if (expect !== sealed.t) throw new Error('ENGINE_KEY مش مطابق للداشبورد — اربط تاني');
  var c = Utilities.base64Decode(sealed.c);
  var out = [];
  var block = [], bi = 0;
  for (var i = 0; i < c.length; i++) {
    if (i % 32 === 0) { block = Utilities.computeHmacSha256Signature(sealed.n + ':' + bi, key); bi++; }
    out.push(c[i] ^ block[i % 32]);
  }
  return Utilities.newBlob(out).getDataAsString('UTF-8');
}

/** تاب System: الداشبورد بيقرا منه حالة السكريبت. */
function heartbeatMaybe_() {
  var last = Number(PropertiesService.getScriptProperties().getProperty('LAST_HEARTBEAT') || 0);
  if (Date.now() - last > 5 * 60 * 1000) writeSystem_(false);
}

function writeSystem_(full) {
  try { writeSystemUnsafe_(full); } catch (e) { console.error('writeSystem_: ' + e.message); }
}

function writeSystemUnsafe_(full) {
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB.SYSTEM);
  if (!sh) return;
  var props = PropertiesService.getScriptProperties();
  var c; try { c = company_(); } catch (e) { c = {}; }
  var p = props.getProperties();
  var info = senderInfo_(c, true);
  var gmailApi = 'لا';
  try { Gmail.Users.getProfile('me'); gmailApi = 'نعم'; } catch (e) { /* */ }
  var triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var needed = ['processLeads', 'sendQueue', 'watchTick', 'runCommands'];
  var boardOk = p.SYS_BOARD_OK || '';
  if ((full || !p.SYS_BOARD_AT || Date.now() - Number(p.SYS_BOARD_AT) > 30 * 60 * 1000) && p.MONDAY_TOKEN && boardIdOf_(c['monday Board ID'])) {
    try { boardOk = mondayBoardExists_(boardIdOf_(c['monday Board ID'])) ? 'نعم' : 'لا'; } catch (e) { boardOk = 'خطأ: ' + String(e.message).slice(0, 80); }
    props.setProperties({ SYS_BOARD_OK: boardOk, SYS_BOARD_AT: String(Date.now()) });
  }
  var inWin = false; try { inWin = inSendWindow_(c); } catch (e) { /* */ }
  var rows = [
    ['heartbeat', Date.now(), 'آخر مرة السكريبت حدّث التاب ده'],
    ['version', ENGINE_VERSION, 'إصدار السكريبت'],
    ['gmailAccount', info.account, 'حساب Gmail اللي السكريبت شغال بيه'],
    ['sender', info.sender, 'الإيميل المرسل'],
    ['senderVerified', info.verified ? 'نعم' : 'لا', 'هل الإيميل المرسل متفعّل كـ Send mail as'],
    ['aliases', info.aliases.join(', '), 'الإيميلات المتاحة للإرسال'],
    ['gmailQuota', info.quota === null ? '' : info.quota, 'المتبقي من حد Gmail النهارده'],
    ['gmailApi', gmailApi, 'Gmail API متفعّل'],
    ['mondayToken', p.MONDAY_TOKEN ? 'نعم' : 'لا', 'monday Token موجود'],
    ['mondayBoard', boardOk, 'البورد ظاهر للتوكن'],
    ['triggers', needed.filter(function (n) { return triggers.indexOf(n) > -1; }).length + '/' + needed.length, 'التشغيل التلقائي المتركب'],
    ['missingTriggers', needed.filter(function (n) { return triggers.indexOf(n) === -1; }).join(', '), 'تشغيل تلقائي ناقص'],
    ['sendingEnabled', c['الإرسال شغال'] || '', 'الإرسال شغال'],
    ['inWindow', inWin ? 'نعم' : 'لا', 'داخل وقت الإرسال دلوقتي'],
    ['sentToday', Number(p['SENT_' + today_()] || 0), 'اتبعت النهارده'],
    ['dailyCap', Number(c['الحد اليومي للإيميلات']) || 0, 'الحد اليومي'],
    ['lastProcessLeads', Number(p.LAST_RUN_processLeads || 0), 'آخر تشغيل للتجهيز'],
    ['lastSendQueue', Number(p.LAST_RUN_sendQueue || 0), 'آخر تشغيل للإرسال'],
    ['lastWatchTick', Number(p.LAST_RUN_watchTick || 0), 'آخر تشغيل للمراقبة'],
    ['lastRunCommands', Number(p.LAST_RUN_runCommands || 0), 'آخر تشغيل لأوامر الداشبورد'],
    ['lastError', p.LAST_ERROR || '', 'آخر خطأ'],
    ['dashboardLinked', p.ENGINE_KEY ? 'نعم' : 'لا', 'ENGINE_KEY متحفظ'],
    ['timezone', tz_(c), 'المنطقة الزمنية']
  ];
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 3).clearContent();
  sh.getRange(2, 1, rows.length, 3).setValues(rows);
  props.setProperty('LAST_HEARTBEAT', String(Date.now()));
}

// ============================== monday ==============================

function mondayEnabled_(c) {
  return !!(PropertiesService.getScriptProperties().getProperty('MONDAY_TOKEN') && boardIdOf_(c['monday Board ID']));
}

function monday_(query, variables) {
  var token = PropertiesService.getScriptProperties().getProperty('MONDAY_TOKEN');
  var r = UrlFetchApp.fetch('https://api.monday.com/v2', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: token },
    payload: JSON.stringify({ query: query, variables: variables || {} })
  });
  var j = JSON.parse(r.getContentText());
  if (j.errors || j.error_message) throw new Error('monday: ' + JSON.stringify(j.errors || j.error_message).slice(0, 300));
  return j.data;
}

/** يضيف أي عمود ناقص على البورد، ويحفظ الـ IDs. */
function ensureMondayColumns_(boardId) {
  var d = monday_('query ($ids:[ID!]){boards(ids:$ids){columns{id title type} groups{id title}}}', { ids: [boardId] });
  var board = d.boards && d.boards[0];
  if (!board) throw new Error('البورد ' + boardId + ' مش موجود أو الـ Token مالوش صلاحية عليه');
  var map = {};
  board.columns.forEach(function (col) { map[col.title] = col.id; });
  MONDAY_COLS.forEach(function (col) {
    if (map[col.title]) return;
    var r = monday_('mutation ($b:ID!, $t:String!, $ty:ColumnType!){create_column(board_id:$b, title:$t, column_type:$ty){id}}',
      { b: boardId, t: col.title, ty: col.type });
    map[col.title] = r.create_column.id;
  });
  var groups = {};
  board.groups.forEach(function (g) { groups[g.title] = g.id; });
  var wanted = ['مقفول', 'ردود وحجوزات', 'جاري التواصل', 'في الانتظار']; // create_group بيحط الجديد فوق
  wanted.forEach(function (t) {
    if (groups[t]) return;
    var r = monday_('mutation ($b:ID!, $n:String!){create_group(board_id:$b, group_name:$n){id}}', { b: boardId, n: t });
    groups[t] = r.create_group.id;
  });
  var props = PropertiesService.getScriptProperties();
  props.setProperty('MONDAY_COLS', JSON.stringify(map));
  props.setProperty('MONDAY_GROUPS', JSON.stringify(groups));
}

/** يقبل رقم البورد أو لينك البورد كامل. */
function boardIdOf_(v) {
  var s = String(v || '').trim();
  var m = s.match(/boards\/(\d+)/);
  if (m) return m[1];
  if (typeof v === 'number') return v.toFixed(0);
  return s.replace(/\D/g, '');
}

function mondayBoardExists_(boardId) {
  var d = monday_('query ($ids:[ID!]){boards(ids:$ids){id}}', { ids: [boardId] });
  return !!(d.boards && d.boards.length);
}

function mondayMaps_() {
  var p = PropertiesService.getScriptProperties();
  return { cols: JSON.parse(p.getProperty('MONDAY_COLS') || '{}'), groups: JSON.parse(p.getProperty('MONDAY_GROUPS') || '{}') };
}

function mondayValue_(title, v, tz) {
  var def = MONDAY_COLS.filter(function (c) { return c.title === title; })[0];
  if (!def) return null;
  if (v === '' || v === null || v === undefined) return def.type === 'date' ? {} : '';
  switch (def.type) {
    case 'email': return { email: String(v), text: String(v) };
    case 'link': return { url: String(v), text: String(v) };
    case 'status': return { label: String(v) };
    case 'dropdown': return { labels: [String(v)] };
    case 'long_text': return { text: String(v) };
    case 'numbers': return String(v);
    case 'date':
      if (isDate_(v) && (v.getUTCHours() || v.getUTCMinutes())) {
        return { date: Utilities.formatDate(v, 'UTC', 'yyyy-MM-dd'), time: Utilities.formatDate(v, 'UTC', 'HH:mm:ss') };
      }
      return { date: isDate_(v) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v).slice(0, 10) };
    default: return String(v);
  }
}

function leadToMonday_(L, c) {
  if (!CACHE_.sources) {
    CACHE_.sources = {};
    table_(TAB.SOURCES).rows.forEach(function (s) { CACHE_.sources[s['كود المصدر']] = s['اسم المصدر']; });
  }
  var sources = CACHE_.sources;
  return {
    'الشخص / المنصب': [L['اسم الشخص'], L['المنصب']].filter(String).join(' — '),
    'الإيميل': L['الإيميل'], 'الموقع': L['الموقع'], 'التليفون': L['التليفون'],
    'النشاط': L['النشاط'], 'المدينة': L['المدينة'], 'المصدر': sources[L['كود المصدر']] || L['كود المصدر'],
    'اللغة': L['اللغة'], 'Segment': L['كود الـ Segment'], 'الحالة': L['حالة التواصل'] || STATUS.READY,
    'ملاحظات': L['ملاحظات'],
    'ميعاد الجلسة': L['ميعاد الجلسة'] || undefined
  };
}

function toColumnValues_(fields, c) {
  var maps = mondayMaps_(), out = {}, tz = tz_(c);
  Object.keys(fields).forEach(function (title) {
    var id = maps.cols[title];
    if (!id) return;
    if (fields[title] === undefined) return;
    var v = mondayValue_(title, fields[title], tz);
    if (v === '') return;
    out[id] = v;
  });
  return out;
}

function mondayCreateItem_(c, L) {
  var vals = toColumnValues_(leadToMonday_(L, c), c);
  var group = groupFor_(L['حالة التواصل'] || STATUS.READY);
  var q = group
    ? 'mutation ($b:ID!, $g:String!, $n:String!, $v:JSON!){create_item(board_id:$b, group_id:$g, item_name:$n, column_values:$v, create_labels_if_missing:true){id}}'
    : 'mutation ($b:ID!, $n:String!, $v:JSON!){create_item(board_id:$b, item_name:$n, column_values:$v, create_labels_if_missing:true){id}}';
  var vars = { b: boardIdOf_(c['monday Board ID']), n: String(L['اسم الجهة'] || L['الإيميل']), v: JSON.stringify(vals) };
  if (group) vars.g = group;
  return monday_(q, vars).create_item.id;
}

function mondayUpdate_(c, L, fields) {
  if (!mondayEnabled_(c) || !L['monday Item ID']) return;
  var vals = toColumnValues_(fields, c);
  monday_('mutation ($b:ID!, $i:ID!, $v:JSON!){change_multiple_column_values(board_id:$b, item_id:$i, column_values:$v, create_labels_if_missing:true){id}}',
    { b: boardIdOf_(c['monday Board ID']), i: String(L['monday Item ID']), v: JSON.stringify(vals) });
  if (fields['الحالة']) {
    var g = groupFor_(fields['الحالة']);
    if (g) monday_('mutation ($i:ID!, $g:String!){move_item_to_group(item_id:$i, group_id:$g){id}}', { i: String(L['monday Item ID']), g: g });
  }
}

/**
 * أي عملية monday لعميل واحد: لو مالوش Item بيتعمله، وبعدين يتحدّث.
 * النتيجة بتتسجل في عمود "حالة monday" ومابترميش error.
 * fields = null → إنشاء/مزامنة كاملة.
 */
function mondaySafe_(c, leads, L, fields) {
  if (!mondayEnabled_(c)) return { ok: null, label: 'غير مفعّل', error: '' };
  try {
    if (!L['monday Item ID']) {
      leads.set(L, 'monday Item ID', "'" + mondayCreateItem_(c, L));
      L['monday Item ID'] = String(L['monday Item ID']).replace(/^'/, '');
    } else if (fields === null) {
      mondayUpdate_(c, L, leadToMonday_(L, c));
    }
    if (fields) mondayUpdate_(c, L, fields);
    setIfCol_(leads, L, 'حالة monday', 'تم');
    return { ok: true, label: 'تم', error: '' };
  } catch (e) {
    var msg = String(e.message || e).replace(/^monday: /, '').slice(0, 150);
    setIfCol_(leads, L, 'حالة monday', 'فشل: ' + msg);
    log_('monday', 0, 'خطأ', L['ID'] + ': ' + msg);
    return { ok: false, label: 'فشل', error: msg };
  }
}

function setIfCol_(table, row, header, value) {
  if (table.headers.indexOf(header) > -1) table.set(row, header, value);
}

/** إعادة المحاولة على monday لعملاء معينين (أو كل اللي فشلوا لو القايمة فاضية). */
function retryMonday_(leadIds) {
  var c = company_();
  if (!mondayEnabled_(c)) throw new Error('monday مش متظبط (Token أو Board ID ناقص)');
  var leads = table_(TAB.LEADS);
  var ids = (leadIds || []).map(String);
  var ok = 0, fail = 0, errors = [];
  leads.rows.forEach(function (L) {
    var pick = ids.length ? ids.indexOf(String(L['ID'])) > -1 : String(L['حالة monday']).indexOf('فشل') === 0;
    if (!pick || !L['الإيميل']) return;
    var full = leadToMonday_(L, c);
    if (L['تاريخ أول إرسال']) full['تاريخ أول إرسال'] = day_(L['تاريخ أول إرسال']);
    if (L['المتابعة الجاية']) full['المتابعة الجاية'] = day_(L['المتابعة الجاية']);
    if (L['الخطوة الحالية'] !== '' && L['الخطوة الحالية'] !== undefined) full['رقم المتابعة'] = L['الخطوة الحالية'];
    if (L['Thread ID']) full['Thread ID'] = L['Thread ID'];
    var r = mondaySafe_(c, leads, L, full);
    if (r.ok) { ok++; if (L['حالة المعالجة'] === PROC.NEW && L['حالة التواصل']) leads.set(L, 'حالة المعالجة', PROC.SYNCED); }
    else { fail++; errors.push(L['ID'] + ': ' + r.error); }
  });
  return { ok: ok, failed: fail, summary: 'monday: نجح ' + ok + (fail ? ' · فشل ' + fail : ''), errors: errors.slice(0, 20) };
}

function mondayPostUpdate_(c, L, text) {
  if (!mondayEnabled_(c) || !L['monday Item ID']) return;
  monday_('mutation ($i:ID!, $t:String!){create_update(item_id:$i, body:$t){id}}',
    { i: String(L['monday Item ID']), t: String(text).replace(/\n/g, '<br>') });
}

function groupFor_(status) {
  var groups = mondayMaps_().groups;
  var key = String(status).indexOf('متابعة') === 0 ? 'متابعة' : status;
  var title = GROUP_BY_STATUS[key];
  return title && groups[title] ? groups[title] : null;
}

// ============================== Do-Not-Contact ==============================

function dncSets_() {
  var s = { emails: {}, domains: {} };
  table_(TAB.DNC).rows.forEach(function (r) {
    var v = String(r['الإيميل أو الدومين']).trim().toLowerCase();
    if (!v) return;
    if (r['النوع'] === 'دومين' || v.indexOf('@') === -1) s.domains[v.replace(/^@/, '')] = true; else s.emails[v] = true;
  });
  return s;
}

function isDnc_(email, dnc) {
  email = String(email).toLowerCase();
  return !!(dnc.emails[email] || dnc.domains[email.split('@')[1]]);
}

function addDnc_(email, type, reason, note) {
  var sh = sheet_(TAB.DNC);
  sh.appendRow([String(email).toLowerCase(), type, reason, today_(), note || '']);
}

// ============================== أدوات الشيت ==============================

function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('التاب "' + name + '" مش موجود');
  return sh;
}

function headers_(sh) {
  return sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(function (h) { return String(h).trim(); });
}

/** بيقرا تاب كجدول: كل صف object بأسماء الأعمدة. set() بيكتب الخلية على طول. */
function table_(name) {
  var sh = sheet_(name);
  var headers = headers_(sh);
  var last = sh.getLastRow();
  var rows = [];
  if (last > 1) {
    sh.getRange(2, 1, last - 1, headers.length).getValues().forEach(function (vals, i) {
      if (vals.join('') === '') return;
      var o = { _row: i + 2 };
      headers.forEach(function (h, j) { if (h) o[h] = vals[j]; });
      rows.push(o);
    });
  }
  return {
    sheet: sh, headers: headers, rows: rows,
    set: function (row, header, value) {
      var col = headers.indexOf(header);
      if (col === -1) throw new Error('العمود "' + header + '" مش موجود في ' + name + ' — شغّل "إعداد أول مرة"');
      sh.getRange(row._row, col + 1).setValue(value);
      row[header] = value;
    }
  };
}

var CACHE_ = {};

function company_() {
  if (CACHE_.company) return CACHE_.company;
  var sh = sheet_(TAB.COMPANY);
  var vals = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2).getValues();
  var c = {};
  vals.forEach(function (r) { var k = String(r[0]).trim(); if (k) c[k] = typeof r[1] === 'string' ? r[1].trim() : r[1]; });
  CACHE_.company = c;
  return c;
}

function setCompany_(label, value) {
  CACHE_.company = null;
  var sh = sheet_(TAB.COMPANY);
  var labels = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var i = 0; i < labels.length; i++) if (String(labels[i][0]).trim() === label) { sh.getRange(i + 1, 2).setValue(value); return; }
  sh.appendRow([label, value, '']);
}

function knownContacts_(leads) {
  var k = { emails: {}, domainsWithEmail: {}, sites: {} };
  leads.rows.forEach(function (L) {
    var e = String(L['الإيميل'] || '').toLowerCase().trim();
    if (e) { k.emails[e] = true; }
    var d = domainOf_(L['الموقع']);
    if (d) { k.sites[d] = true; if (e && e.split('@')[1] === d) k.domainsWithEmail[d] = true; }
  });
  return k;
}

function nextLeadId_(leads) {
  var max = 0;
  leads.rows.forEach(function (L) { var n = Number(String(L['ID']).replace(/\D/g, '')); if (n > max) max = n; });
  return max + 1;
}

function log_(fn, count, result, details) {
  try {
    sheet_(TAB.LOG).appendRow([Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), fn, count, result, details || '']);
  } catch (e) { console.error(e); }
}

function toast_(msg) {
  try { SpreadsheetApp.getActive().toast(msg, 'Outreach', 8); } catch (e) { console.log(msg); }
}

function notify_(c, subject, body) {
  var to = String(c['إيميل التنبيهات'] || '').trim();
  if (to) MailApp.sendEmail(to, subject, body);
}

function withLock_(fn) {
  if (CACHE_.locked) return fn(); // جوه runCommands: القفل معانا خلاص، والأخطاء ترجع للأمر
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  CACHE_.locked = true;
  try { return fn(); } catch (e) {
    log_('error', 0, 'خطأ', e.message);
    PropertiesService.getScriptProperties().setProperty('LAST_ERROR', new Date().toISOString() + ' — ' + String(e.message).slice(0, 300));
    try { SpreadsheetApp.getUi().alert('خطأ: ' + e.message); } catch (x) { /* تشغيل تلقائي */ }
  } finally { CACHE_.locked = false; lock.releaseLock(); }
}

function markRun_(name) {
  try { PropertiesService.getScriptProperties().setProperty('LAST_RUN_' + name, String(Date.now())); } catch (e) { /* */ }
}

// ============================== أدوات عامة ==============================

function ssTz_() {
  if (!CACHE_.ssTz) CACHE_.ssTz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return CACHE_.ssTz;
}

function tz_(c) { return String((c && c['المنطقة الزمنية']) || Session.getScriptTimeZone()); }

function today_() { return Utilities.formatDate(new Date(), tz_(company_()), 'yyyy-MM-dd'); }

function day_(v) {
  if (!v) return '';
  if (isDate_(v)) return Utilities.formatDate(v, ssTz_(), 'yyyy-MM-dd'); // الشيت بيحوّل التواريخ بتوقيته هو
  return String(v).slice(0, 10);
}

function dateTime_(v, tz) {
  if (!v) return '';
  return isDate_(v) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm') : String(v).slice(0, 16);
}

function addDays_(isoDay, n) {
  var p = isoDay.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + Number(n)));
  return d.toISOString().slice(0, 10);
}

function norm_(s) { return String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي'); }

function normalizeUrl_(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

function domainOf_(u) {
  u = String(u || '').trim().toLowerCase();
  if (!u) return '';
  return u.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#:]/)[0];
}

function isValidEmail_(e) {
  e = String(e || '').toLowerCase().trim();
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(e)) return false;
  for (var i = 0; i < BAD_EMAIL_PARTS.length; i++) if (e.indexOf(BAD_EMAIL_PARTS[i]) > -1) return false;
  return true;
}

/** لو الخلية فيها أكتر من إيميل، ياخد اللي على دومين الموقع الأول. */
function pickEmail_(raw, site) {
  var list = (String(raw).match(EMAIL_RE) || []).map(function (e) { return e.toLowerCase(); }).filter(isValidEmail_);
  if (!list.length) return '';
  var d = domainOf_(site);
  var same = list.filter(function (e) { return d && e.split('@')[1] === d; });
  return (same[0] || list[0]);
}

function appendNote_(old, note) { return old ? String(old) + ' · ' + note : note; }

function myAddresses_(c) {
  var list = [String(c['إيميل الإرسال'] || ''), Session.getActiveUser().getEmail()];
  try { list = list.concat(GmailApp.getAliases()); } catch (e) { /* */ }
  return list.filter(String).map(function (e) { return e.toLowerCase(); });
}

function isMine_(from, me) {
  from = String(from).toLowerCase();
  return me.some(function (e) { return from.indexOf(e) > -1; });
}

function wrap76_(s) { return s.replace(/(.{76})/g, '$1\r\n'); }

function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }
