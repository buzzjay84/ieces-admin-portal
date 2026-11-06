/* BSP Registration — Electron desktop app (renderer).
   Data is saved to bsp-data.json in the app's AppData folder via window.bsp (preload.js). */

const DEFAULTS = {
  settings: {
    council: '',
    signName: 'Jonybhee A. Bazan',
    signPosition: 'Project Development Officer I\nBSP Coordinator',
    supabaseUrl: 'https://joilvslvsioayrjshuxg.supabase.co',
    supabaseKey: 'sb_publishable_aozkBamT5C58KY03X9kUgA_iehy73ZU',
    defaultSponsor: 'Isabela East Central Elementary School',
    receiptPrefix: 'AR-',
    nextReceipt: 1,
    rates: { scout: 50, teacher: 60, lay: 100, camp: 0 },
    campName: 'Boy Scout Camping',
    campDate: '',
    campVenue: '',
    schoolYear: String(new Date().getFullYear()),
  },
  units: [],
  adults: [],
  campIntents: {}, // website registration id -> true when the learner also signed up for camp before import
  archives: {}, // school year -> { units, adults, archivedAt } snapshot taken when that year was rolled over
};

const UNIT_TYPES = ['Langkay', 'Kawan', 'Troop', 'Outfit', 'Circle'];
const NATURES = ['School-Based', 'Community-Based'];

const OFFICERS = [
  { key: 'SPL', label: 'SPL/SCL/RL' },
  { key: 'ASPL', label: 'Assistant SPL/SCL/RL' },
  { key: 'SCRIBE', label: 'Scribe' },
  { key: 'TREASURER', label: 'Treasurer' },
  { key: 'AUDITOR', label: 'Auditor (For Rover Circles Only)' },
  { key: 'QM', label: 'Quartermaster' },
];
const MEMBERS_PER_FIRST_PAGE = 32; // 4 blocks of 8, as on BSP Form 6-01
const MEMBERS_PER_EXTRA_PAGE = 56;

const ADULT_ROLES = [
  { key: 'UL_LANGKAY', group: 'A', label: 'Langkay Leader/Assistant' },
  { key: 'UL_KAWAN', group: 'A', label: 'Kawan Leader/Assistant' },
  { key: 'UL_TROOP', group: 'A', label: 'Troop Leader/Assistant' },
  { key: 'UL_OUTFIT', group: 'A', label: 'Outfit Leader/Assistant' },
  { key: 'UL_CIRCLE', group: 'A', label: 'Circle Manager/Assistant' },
  { key: 'LAY_ISR', group: 'B', label: 'Institutional Scouting Representative/ISCOM/ISC' },
  { key: 'LAY_DIST', group: 'B', label: 'District/Municipal Commissioner/Coordinator/Member-at-Large' },
  { key: 'LAY_LCS', group: 'B', label: 'Local Council Staff' },
];

const FEE_LABELS = {
  scout: 'Scouts',
  teacher: 'Teachers (Unit Leaders / Assistants)',
  lay: 'School Heads & BSP Coordinators (Lay Leaders)',
};

const RANKS = ['Membership Badge', 'Tenderfoot', 'Second Class', 'First Class', 'Explorer', 'Pathfinder', 'Outdoorsman', 'Venturer', 'Eagle Scout'];

/* ------------------------------------------------------------------ data */

let db = load();
let route = { view: 'summary', id: null };
let editingScoutId = null;
let listFilter = '';
let showUnpaidCampers = false;

function load() {
  try {
    const d = JSON.parse(window.bsp.load());
    if (d) {
      d.settings = { ...DEFAULTS.settings, ...d.settings, rates: { ...DEFAULTS.settings.rates, ...(d.settings || {}).rates } };
      d.units = d.units || [];
      d.adults = d.adults || [];
      d.campIntents = d.campIntents || {};
      d.archives = d.archives || {};
      return d;
    }
  } catch (e) { console.error(e); }
  return JSON.parse(JSON.stringify(DEFAULTS));
}
function save() {
  if (!window.bsp.save(JSON.stringify(db))) { alert('Could not save data to disk!'); return false; }
  void syncLearnerReceipts();
  void syncWebsiteFees();
  return true;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const getUnit = id => db.units.find(u => u.id === id);
const getAdult = id => db.adults.find(a => a.id === id);

/* --------------------------------------------------------------- helpers */

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gradeSectionLabel = value => String(value ?? '').trim().replace(/^(Grade\s+\d+|Kinder|SNED)\s*[–—-]\s*\1\b\s*(?:[–—-]\s*)?/i, '$1 – ').replace(/\s+–\s*$/, '');
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = s => s ? parseISO(s).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
const fmtShort = s => s ? parseISO(s).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
// middle initials are all capitals: "d.s" / "D.s." -> "D.S" (a trailing dot is added on display)
const mi = s => (s || '').trim().replace(/\.+$/, '').toUpperCase();
// name extension (Jr., Sr., III…) follows the given name in "Surname, Given Jr. M." and ends the forward form
const fullName = p => [p.surname, ', ', p.given ?? p.first, p.ext ? ' ' + p.ext : '', mi(p.mi) ? ' ' + mi(p.mi) + '.' : ''].join('').trim();
const fullNameFwd = p => [(p.given ?? p.first), mi(p.mi) ? mi(p.mi) + '.' : '', p.surname, p.ext].filter(Boolean).join(' ');
const NAME_EXTS = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];
// "jr" / "JR." / "Jr" -> "Jr."; anything else is kept as typed
const nameExt = v => { const t = (v || '').trim().replace(/\.$/, ''); return NAME_EXTS.find(x => x.replace('.', '').toLowerCase() === t.toLowerCase()) || t; };
const websiteRef = p => (p.onlineId || '').slice(0, 8).toUpperCase();
const orNumber = p => p.payment?.orNo || websiteRef(p);
const registrationSource = p => p.onlineId ? 'Online' : 'Local';
const websiteRefLabel = p => websiteRef(p) ? `<div class="muted">Website ref. <b class="mono">${h(websiteRef(p))}</b></div>` : '';
const unitLabel = u => `${u.unitType || 'Unit'} No. ${u.unitNo || '—'}`;
const unitMissing = u => [!u.sponsor && 'sponsoring institution', !u.unitNo && 'unit no.', !u.unitType && 'unit type', !u.dateApplied && 'date applied'].filter(Boolean);
const sponsorKey = s => (s || '').trim().toUpperCase() || '(NO SPONSORING INSTITUTION)';

function ageOn(birth, ref) {
  if (!birth) return '';
  const b = parseISO(birth), r = ref ? parseISO(ref) : new Date();
  let a = r.getFullYear() - b.getFullYear();
  if (r.getMonth() < b.getMonth() || (r.getMonth() === b.getMonth() && r.getDate() < b.getDate())) a--;
  return a >= 0 ? a : '';
}

function toWords(n) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const w = n => n < 20 ? a[n]
    : n < 100 ? b[Math.floor(n / 10)] + (n % 10 ? '-' + a[n % 10] : '')
    : n < 1000 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + w(n % 100) : '')
    : n < 1e6 ? w(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + w(n % 1000) : '')
    : w(Math.floor(n / 1e6)) + ' Million' + (n % 1e6 ? ' ' + w(n % 1e6) : '');
  const cents = Math.round(Number(n) * 100), p = Math.floor(cents / 100), c = cents % 100;
  return (p ? w(p) : 'Zero') + ' Peso' + (p === 1 ? '' : 's') + (c ? ' and ' + w(c) + ' Centavos' : '') + ' Only';
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ------------------------------------------------------------------ fees */

const R = () => db.settings.rates;
const roleOf = key => ADULT_ROLES.find(r => r.key === key);
const adultCat = a => (roleOf(a.role) || {}).group === 'B' ? 'lay' : 'teacher';
const adultFee = a => Number(R()[adultCat(a)]);
const unitFee = u => u.scouts.length * Number(R().scout);
// a unit's paid amount is the sum of its scouts' individual payments
const paidOf = x => x.scouts ? x.scouts.reduce((n, s) => n + paidOf(s), 0) : Number((x.payment || {}).amountPaid || 0);
const paidScouts = u => sortedScouts(u).filter(s => paidOf(s) > 0);
const unitOrNumber = u => u.payment?.orNo || [...new Set(paidScouts(u).map(orNumber).filter(Boolean))].join(', ');

function payStatus(fee, paid) {
  if (fee <= 0) return '<span class="badge off">No fee</span>';
  if (paid >= fee) return '<span class="badge paid">Paid</span>';
  if (paid > 0) return '<span class="badge partial">Partial</span>';
  return '<span class="badge unpaid">Unpaid</span>';
}

function nextReceiptNo() {
  const used = new Set([...db.units.flatMap(u => u.scouts), ...db.adults].flatMap(r => [r.payment?.receiptNo, r.camp?.receiptNo]).filter(Boolean));
  for (const reservation of Object.values(db.receiptReservations || {})) {
    if (reservation.schoolYear === db.settings.schoolYear) used.add(reservation.receiptNo);
  }
  let next = Number(db.settings.nextReceipt);
  if (!Number.isSafeInteger(next) || next < 1) next = 1;
  let receiptNo;
  do { receiptNo = db.settings.receiptPrefix + String(next++).padStart(5, '0'); } while (used.has(receiptNo));
  db.settings.nextReceipt = next;
  return receiptNo;
}

function issueReceiptIfNeeded(rec) {
  rec.payment = rec.payment || {};
  if (paidOf(rec) > 0 && !rec.payment.receiptNo) rec.payment.receiptNo = nextReceiptNo();
}

/* ------------------------------------------------------------------ camp */
/* Boy Scout camping is optional for learners and paid separately from registration.
   s.camp = { joined, amountPaid, datePaid, receiptNo, receiptPrintedAt }. When the camp fee is paid
   together with the registration fee, both share one receipt number; otherwise camp gets its own. */

const campFee = () => Number(R().camp || 0);
const campName = () => db.settings.campName || 'Boy Scout Camping';
// venue defaults to the school (sponsoring institution) when left empty
const campVenue = () => db.settings.campVenue || db.settings.defaultSponsor || '';
const campDateLabel = () => db.settings.campDate ? `${db.settings.campDate} (tentative)` : 'date to be announced';
const campJoined = s => !!s.camp?.joined;
const campPaidOf = s => Number(s.camp?.amountPaid || 0);
const campShared = s => campPaidOf(s) > 0 && !!s.camp.receiptNo && s.camp.receiptNo === s.payment?.receiptNo;

const GRADE_ORDER = ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'SNED'];
// "Grade 6 – Rizal" -> { level: 'Grade 6', section: 'Rizal' }; local entries may be free text such as "6-Rizal"
function gradeParts(text) {
  const t = (text || '').trim();
  const m = t.match(/^(kinder(?:garten)?|sned|(?:grade|gr\.?|g)?\s*(\d{1,2}))\b\s*[-–—,:/]?\s*(.*)$/i);
  if (!m) return { level: t ? 'Other' : 'No grade', section: t };
  const level = m[2] ? `Grade ${Number(m[2])}` : /^k/i.test(m[1]) ? 'Kinder' : 'SNED';
  return { level, section: m[3].trim() };
}
const gradeRank = level => { const i = GRADE_ORDER.indexOf(level); return i >= 0 ? i : level === 'Other' ? 90 : level === 'No grade' ? 99 : 50 + Number(level.replace(/\D/g, '') || 0); };
// BSP scout section for a grade level: Kinder = KID, Grades 1–3 = Kab (Kawan), Grades 4–6 = Boy Scout (Troop)
function scoutSection(level) {
  if (level === 'Kinder') return 'KID Scout';
  const n = Number((level.match(/^Grade (\d+)$/) || [])[1]);
  return n >= 1 && n <= 3 ? 'Kab Scout' : n >= 4 && n <= 6 ? 'Boy Scout' : '';
}
// SNED learners are not included in the camp
const campEligible = s => gradeParts(s.grade).level !== 'SNED';
// a camp fee already collected stays counted even if the grade is later changed to SNED
const campIn = s => campJoined(s) && (campEligible(s) || campPaidOf(s) > 0);
const campers = u => u.scouts.filter(campIn);

// receiptNo: pass the registration receipt to combine both fees on one receipt
function payCamp(s, receiptNo) {
  s.camp = { ...(s.camp || {}), joined: true, amountPaid: campFee(), datePaid: todayISO(), receiptNo: receiptNo || nextReceiptNo() };
  delete s.camp.receiptPrintedAt;
}

function sortedScouts(u) {
  const order = k => { const i = OFFICERS.findIndex(o => o.key === k); return i < 0 ? 99 : i; };
  return [...u.scouts].sort((a, b) => order(a.position) - order(b.position) || fullName(a).localeCompare(fullName(b)));
}

/* -------------------------------------------------------------- rendering */

function render({ preserveScroll = false } = {}) {
  const scrollX = window.scrollX, scrollY = window.scrollY;
  const tableScroll = preserveScroll ? [...document.querySelectorAll('#main .table-wrap')].map(el => el.scrollLeft) : [];
  document.getElementById('main').classList.toggle('online-wide', route.view === 'online');
  document.querySelectorAll('.tabs button').forEach(b => {
    const v = route.view === 'registration' ? 'online' : route.view === 'unit' ? 'units' : route.view === 'adult' ? 'adults' : route.view;
    if (b.dataset.view === 'online') b.innerHTML = `Online${online.rows && online.rows.length ? ` <span class="nav-badge">${online.rows.length}</span>` : ''}`;
    b.classList.toggle('active', b.dataset.view === v);
  });
  document.getElementById('councilLabel').textContent = db.settings.council ? db.settings.council : 'Boy Scouts of the Philippines';
  const views = { summary: viewSummary, online: viewOnline, registration: viewRegistration, units: viewUnits, unit: viewUnit, adults: viewAdults, adult: viewAdult, settings: viewSettings };
  // live updates re-render while staff type in the search box; keep focus and caret there
  const typing = document.activeElement?.matches('[data-filter]') ? document.activeElement.selectionStart : null;
  document.getElementById('main').innerHTML = views[route.view]();
  const filter = typing !== null && document.querySelector('[data-filter]');
  if (filter) { filter.focus(); filter.setSelectionRange(typing, typing); }
  if (preserveScroll) {
    document.querySelectorAll('#main .table-wrap').forEach((el, i) => { el.scrollLeft = tableScroll[i] || 0; });
    window.scrollTo(scrollX, scrollY);
  } else window.scrollTo(0, 0);
  if (route.view === 'settings') window.bsp.dataPath().then(p => { const el = document.getElementById('dataPath'); if (el) el.textContent = ' in ' + p; });
}

function go(view, id = null) { route = { view, id }; editingScoutId = null; render(); }

const radios = (name, options, value, cls = '') =>
  `<div class="choices ${cls}">${options.map(o => {
    const v = typeof o === 'string' ? o : o.key, l = typeof o === 'string' ? o : o.label;
    return `<label><input type="radio" name="${name}" value="${h(v)}" ${v === value ? 'checked' : ''}> ${h(l)}</label>`;
  }).join('')}</div>`;

const field = (label, name, value, { type = 'text', span = '', req = false, list = '', extra = '' } = {}) =>
  `<div class="f ${span}"><label class="${req ? 'req' : ''}">${label}</label>
   <input type="${type}" name="${name}" value="${h(value)}" ${req ? 'required' : ''} ${list ? `list="${list}"` : ''} ${extra}></div>`;

function datalists() {
  const sponsors = [...new Set([...db.units, ...db.adults].map(x => (x.sponsor || '').trim()).filter(Boolean))];
  const adults = db.adults.map(a => fullName(a));
  return `<datalist id="dl-sponsors">${sponsors.map(s => `<option value="${h(s)}">`).join('')}</datalist>
    <datalist id="dl-adults">${adults.map(s => `<option value="${h(s)}">`).join('')}</datalist>
    <datalist id="dl-exts">${NAME_EXTS.map(s => `<option value="${s}">`).join('')}</datalist>
    <datalist id="dl-ranks">${RANKS.map(s => `<option value="${h(s)}">`).join('')}</datalist>`;
}

/* ---------------------------------------------------------------- summary */

function computeSummary() {
  const r = R();
  const bySponsor = {};
  const row = name => bySponsor[sponsorKey(name)] ||= { name: (name || '').trim() || '(No sponsoring institution)', scouts: 0, teachers: 0, lay: 0, units: 0, total: 0, paid: 0 };

  for (const u of db.units) {
    const s = row(u.sponsor);
    s.units++; s.scouts += u.scouts.length;
    s.total += unitFee(u); s.paid += paidOf(u);
  }
  for (const a of db.adults) {
    const s = row(a.sponsor);
    adultCat(a) === 'lay' ? s.lay++ : s.teachers++;
    s.total += adultFee(a); s.paid += paidOf(a);
  }
  const rows = Object.values(bySponsor).sort((a, b) => a.name.localeCompare(b.name));
  const allCampers = db.units.flatMap(campers);
  const camp = { joined: allCampers.length, paidCount: allCampers.filter(s => campPaidOf(s) > 0).length,
    paid: allCampers.reduce((n, s) => n + campPaidOf(s), 0), due: allCampers.length * campFee() };
  const t = rows.reduce((acc, s) => { for (const k of ['scouts', 'teachers', 'lay', 'units', 'total', 'paid']) acc[k] += s[k]; return acc; },
    { scouts: 0, teachers: 0, lay: 0, units: 0, total: 0, paid: 0 });
  t.scoutAmt = t.scouts * r.scout; t.teacherAmt = t.teachers * r.teacher; t.layAmt = t.lay * r.lay;
  return { rows, t, camp };
}

function viewSummary() {
  const r = R(), { rows, t, camp } = computeSummary();
  const unpaidCampers = db.units.flatMap(u => u.scouts.filter(s => campEligible(s) && !(campPaidOf(s) > 0)).map(s => ({ u, s })));
  return `
  <div class="page-head">
    <div><h1>Summary of Registration Fees</h1><p class="sub">Totals across every unit and adult registered in this app.</p></div>
    <div class="toolbar">
      <button class="btn" data-act="csvSummary">Export summary (CSV)</button>
      <button class="btn" data-act="csvMaster">Export master list (CSV)</button>
      <button class="btn primary" data-act="printSummary">Print summary</button>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="k">Scouts × ${peso(r.scout)}</div><div class="v">${peso(t.scoutAmt)}</div><div class="d">${t.scouts} scout(s) in ${t.units} unit(s)</div></div>
    <div class="stat"><div class="k">Teachers × ${peso(r.teacher)}</div><div class="v">${peso(t.teacherAmt)}</div><div class="d">${t.teachers} unit leader(s)/assistant(s)</div></div>
    <div class="stat"><div class="k">School heads & BSP coordinators × ${peso(r.lay)}</div><div class="v">${peso(t.layAmt)}</div><div class="d">${t.lay} lay leader(s)</div></div>
    <div class="stat"><div class="k">${h(campName())} fees paid</div><div class="v">${peso(camp.paid)}</div><div class="d">${camp.paidCount} of ${camp.joined} camper(s) · Balance ${peso(camp.due - camp.paid)}</div></div>
    <div class="stat total"><div class="k">Registration grand total</div><div class="v">${peso(t.total)}</div><div class="d">Collected ${peso(t.paid)} · Balance ${peso(t.total - t.paid)}</div></div>
  </div>

  <div class="card">
    <h2>${h(campName())} <span class="muted" style="font-weight:400;font-size:13px">(separate from registration · ${h(campDateLabel())})</span></h2>
    <div class="table-wrap"><table class="list" style="max-width:620px">
      <thead><tr><th></th><th class="num">Learners</th><th class="num">Amount</th></tr></thead>
      <tbody>
        <tr><td>Joined the camp (× ${num(campFee())})</td><td class="num">${camp.joined}</td><td class="num">${num(camp.due)}</td></tr>
        <tr><td>Camp fee paid</td><td class="num">${camp.paidCount}</td><td class="num">${num(camp.paid)}</td></tr>
      </tbody>
      <tfoot><tr><td>Balance (joined campers)</td><td class="num">${camp.joined - camp.paidCount}</td><td class="num">${peso(camp.due - camp.paid)}</td></tr>
        <tr><td>All learners without camp payment</td><td class="num"><button class="btn sm" data-act="toggleUnpaidCampers" aria-label="View all learners without camp payment" aria-expanded="${showUnpaidCampers}" aria-controls="unpaid-campers">${unpaidCampers.length}</button></td><td></td></tr></tfoot>
    </table></div>
    <div id="unpaid-campers" ${showUnpaidCampers ? '' : 'hidden'}>
      <h3>Learners without camp payment</h3>
      <p class="muted">Includes eligible learners who have not joined the camp. SNED learners are excluded. Registration payments are separate.</p>
      <div class="table-wrap"><table class="list">
        <thead><tr><th>Learner</th><th>Grade / section</th><th>School / unit</th><th class="num">Registration paid</th><th class="num">Camp paid</th><th></th></tr></thead>
        <tbody>${unpaidCampers.map(({ u, s }) => `<tr>
          <td>${h(fullName(s))}</td><td>${h(s.grade)}</td><td>${h(u.sponsor)} · ${h(unitLabel(u))}</td>
          <td class="num">${peso(paidOf(s))}</td><td class="num">${peso(campPaidOf(s))}</td>
          <td><button class="btn sm" data-act="openUnit" data-id="${h(u.id)}">Open unit</button></td>
        </tr>`).join('') || '<tr><td colspan="6" class="empty">All eligible learners have a camp payment recorded.</td></tr>'}</tbody>
      </table></div>
    </div>
    ${camp.joined ? `<div class="table-wrap" style="margin-top:10px"><table class="list" style="max-width:620px">
      <thead><tr><th>Scout section</th><th class="num">Campers</th><th class="num">Paid</th><th class="num">Collected</th></tr></thead>
      <tbody>${sectionCounts('camp').map(c => `<tr><td>${h(c.section)}${sectionGrades[c.section] ? ` <span class="muted">· ${sectionGrades[c.section]}</span>` : ''}</td><td class="num">${c.total}</td><td class="num">${c.paidCount}</td><td class="num">${num(c.paid)}</td></tr>`).join('')}</tbody>
    </table></div>` : ''}
    <div class="actions">
      <button class="btn primary" data-act="printList" data-kind="camp" ${camp.joined ? '' : 'disabled title="No learner has joined the camp yet"'}>Print camp list (by section &amp; grade)</button>
      <button class="btn" data-act="xlsxList" data-kind="camp" ${camp.joined ? '' : 'disabled'}>Download Excel (.xlsx)</button>
    </div>
  </div>

  ${db.units.some(u => u.scouts.length) ? `<div class="card">
    <h2>Registered learners by scout section</h2>
    <div class="table-wrap"><table class="list" style="max-width:620px">
      <thead><tr><th>Scout section</th><th class="num">Learners</th><th class="num">Paid</th><th class="num">Collected</th></tr></thead>
      <tbody>${sectionCounts('registration').map(c => `<tr><td>${h(c.section)}${sectionGrades[c.section] ? ` <span class="muted">· ${sectionGrades[c.section]}</span>` : ''}</td><td class="num">${c.total}</td><td class="num">${c.paidCount}</td><td class="num">${num(c.paid)}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="actions">
      <button class="btn primary" data-act="printList" data-kind="registration">Print registration list (by section &amp; grade)</button>
      <button class="btn" data-act="xlsxList" data-kind="registration">Download Excel (.xlsx)</button>
    </div>
  </div>` : ''}

  <div class="card">
    <h2>Fee breakdown</h2>
    <div class="table-wrap"><table class="list">
      <thead><tr><th>Category</th><th class="num">Count</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>
        <tr><td>${FEE_LABELS.scout}</td><td class="num">${t.scouts}</td><td class="num">${num(r.scout)}</td><td class="num">${num(t.scoutAmt)}</td></tr>
        <tr><td>${FEE_LABELS.teacher}</td><td class="num">${t.teachers}</td><td class="num">${num(r.teacher)}</td><td class="num">${num(t.teacherAmt)}</td></tr>
        <tr><td>${FEE_LABELS.lay}</td><td class="num">${t.lay}</td><td class="num">${num(r.lay)}</td><td class="num">${num(t.layAmt)}</td></tr>
      </tbody>
      <tfoot><tr><td>TOTAL</td><td class="num">${t.scouts + t.teachers + t.lay}</td><td></td><td class="num">${peso(t.total)}</td></tr></tfoot>
    </table></div>
  </div>

  <div class="card">
    <h2>Per sponsoring institution (school)</h2>
    <div class="table-wrap"><table class="list">
      <thead><tr><th>Sponsoring institution</th><th class="num">Units</th><th class="num">Scouts</th><th class="num">Teachers</th><th class="num">Heads/Coord.</th><th class="num">Total due</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th></tr></thead>
      <tbody>${rows.length ? rows.map(s => `<tr>
        <td>${h(s.name)}</td><td class="num">${s.units}</td><td class="num">${s.scouts}</td><td class="num">${s.teachers}</td><td class="num">${s.lay}</td>
        <td class="num">${num(s.total)}</td><td class="num">${num(s.paid)}</td><td class="num">${num(s.total - s.paid)}</td><td>${payStatus(s.total, s.paid)}</td></tr>`).join('')
        : `<tr><td colspan="9" class="empty">Nothing registered yet. Start with <b>Units (Scouts)</b> or <b>Adults</b>.</td></tr>`}</tbody>
      ${rows.length ? `<tfoot><tr><td>TOTAL</td><td class="num">${t.units}</td><td class="num">${t.scouts}</td><td class="num">${t.teachers}</td><td class="num">${t.lay}</td><td class="num">${num(t.total)}</td><td class="num">${num(t.paid)}</td><td class="num">${num(t.total - t.paid)}</td><td></td></tr></tfoot>` : ''}
    </table></div>
  </div>`;
}

/* ------------------------------------------------------------------ units */

function viewUnits() {
  const q = listFilter.toLowerCase();
  const units = db.units.filter(u => !q || [u.sponsor, u.unitType, u.unitNo, u.aurNo, u.leaders?.ul].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.sponsor || '').localeCompare(b.sponsor || '') || (a.unitNo || '').localeCompare(b.unitNo || ''));
  return `
  <div class="page-head">
    <div><h1>Unit Registration (AUR)</h1><p class="sub">BSP Form 6-01. Fill in the unit first, then add its scouts to the roster.</p></div>
    <div class="toolbar">
      <input type="text" placeholder="Search school, unit, leader…" value="${h(listFilter)}" data-filter>
      <button class="btn primary" data-act="newUnit">+ New unit</button>
    </div>
  </div>
  <div class="card table-wrap"><table class="list">
    <thead><tr><th>Sponsoring institution</th><th>Unit</th><th>Unit leader</th><th class="num">Scouts</th><th class="num">Fee</th><th class="num">Paid</th><th>Status</th><th></th></tr></thead>
    <tbody>${units.length ? units.map(u => `<tr>
      <td><b>${h(u.sponsor) || '<span class="muted">(no school yet)</span>'}</b><div class="muted">${h(u.nature || '')}</div></td>
      <td>${h(unitLabel(u))}${unitMissing(u).length ? '<div><span class="badge partial">Details incomplete</span></div>' : ''}</td>
      <td>${h(u.leaders?.ul || '')}</td>
      <td class="num">${u.scouts.length}</td>
      <td class="num">${num(unitFee(u))}</td>
      <td class="num">${num(paidOf(u))}</td>
      <td>${payStatus(unitFee(u), paidOf(u))}</td>
      <td><div class="row-actions">
        <button class="btn sm" data-act="openUnit" data-id="${u.id}">Open</button>
        <button class="btn sm" data-act="printAUR" data-id="${u.id}">Print AUR</button>
        <button class="btn sm" data-act="receiptsUnit" data-id="${u.id}" ${unitReceipts(u).length ? '' : 'disabled title="No scout has paid yet"'}>Receipts</button>
        <button class="btn sm danger" data-act="delUnit" data-id="${u.id}">Delete</button>
      </div></td></tr>`).join('')
      : `<tr><td colspan="8" class="empty">${db.units.length ? 'No match.' : 'No units yet. Click <b>+ New unit</b> to begin.'}</td></tr>`}</tbody>
  </table></div>`;
}

function viewUnit() {
  const u = route.id ? getUnit(route.id) : null;
  const d = u || { sponsor: '', unitNo: '', council: db.settings.council, unitType: '', nature: 'School-Based', dateApplied: todayISO(), aurNo: '', leaders: {}, scouts: [], payment: {} };
  const L = d.leaders || {};
  const saved = !!u;

  return `${datalists()}
  <div class="page-head">
    <div><h1>${saved ? `${h(unitLabel(d))}${d.sponsor ? ' — ' + h(d.sponsor) : ''}` : 'New unit'}</h1>
    <p class="sub">Application for Unit Registration (BSP Form 6-01)</p></div>
    <div class="toolbar">
      <button class="btn" data-act="nav" data-view="units">← Back to units</button>
      ${saved ? `<button class="btn primary" data-act="printAUR" data-id="${u.id}">Print AUR form</button>` : ''}
    </div>
  </div>

  <form class="card" id="unitForm">
    <h2><span class="step">Step 1</span>Unit details</h2>
    ${saved && unitMissing(d).length ? `<p class="hint" style="margin-top:-6px"><span class="badge partial">Incomplete</span> Still missing: ${unitMissing(d).join(', ')}. You can fill these in any time before printing.</p>`
      : !saved ? '<p class="hint" style="margin-top:-6px">You can skip any of these for now and complete them later.</p>' : ''}
    <div class="grid">
      ${field('Sponsoring institution', 'sponsor', d.sponsor, { span: 's6', list: 'dl-sponsors' })}
      ${field('Unit no.', 'unitNo', d.unitNo, { span: 's2' })}
      ${field('Local council', 'council', d.council, { span: 's4' })}
      <div class="f s6"><span class="lbl">Unit</span>${radios('unitType', UNIT_TYPES, d.unitType)}</div>
      <div class="f s6"><span class="lbl">Nature</span>${radios('nature', NATURES, d.nature)}</div>
      ${field('Date applied', 'dateApplied', d.dateApplied, { type: 'date', span: 's3' })}
      ${field('AUR no.', 'aurNo', d.aurNo, { span: 's3' })}
      <div class="f s6"></div>
      <fieldset class="f s12"><legend>Adult leaders (Surname, Given Name, M.I.)</legend>
        <div class="grid">
          ${field('Institutional Scouting Representative', 'l_isr', L.isr, { span: 's6', list: 'dl-adults' })}
          ${field('Unit Leader', 'l_ul', L.ul, { span: 's6', list: 'dl-adults' })}
          ${field('Asst. Unit Leader for Program', 'l_aulProgram', L.aulProgram, { span: 's6', list: 'dl-adults' })}
          ${field('Asst. Unit Leader for Administration', 'l_aulAdmin', L.aulAdmin, { span: 's6', list: 'dl-adults' })}
        </div>
        <p class="hint">Each adult leader must also be registered individually in the <b>Adults</b> tab (AAR form).</p>
      </fieldset>
    </div>
    <div class="actions"><button class="btn primary" type="submit">${saved ? 'Save changes' : 'Save unit & continue to roster →'}</button></div>
  </form>

  ${saved ? rosterCard(u) + unitPaymentCard(u) : `
  <div class="card locked"><h2><span class="step">Step 2</span>Roster of scout membership</h2>
    <p class="muted">Save the unit details above first. The roster opens once the unit is saved.</p></div>`}`;
}

function rosterCard(u) {
  const s = editingScoutId ? u.scouts.find(x => x.id === editingScoutId) : null;
  const d = s || { surname: '', given: '', mi: '', position: 'MEMBER', status: 'N', birthdate: '', sex: '', cardNo: '', rank: '', years: '' };
  const ref = u.dateApplied || todayISO();
  const taken = new Set(u.scouts.filter(x => x.id !== editingScoutId && x.position !== 'MEMBER').map(x => x.position));
  const list = sortedScouts(u);

  return `
  <div class="card" id="roster">
    <h2><span class="step">Step 2</span>Roster of scout membership <span class="muted" style="font-weight:400">(${u.scouts.length} scout${u.scouts.length === 1 ? '' : 's'})</span></h2>
    <form id="scoutForm" autocomplete="off">
      ${s ? `<p class="hint">Registration source: <b>${registrationSource(s)}</b></p>` : ''}
      ${websiteRefLabel(d)}
      ${websiteRef(d) ? field('OR no. (website reference)', 'onlineOrNo', orNumber(d), { extra: 'readonly' }) : ''}
      <div class="grid">
        ${field('Surname', 'surname', d.surname, { span: 's3', req: true })}
        ${field('Given name', 'given', d.given, { span: 's3', req: true })}
        ${field('Ext.', 'ext', d.ext, { span: 's1', list: 'dl-exts', extra: 'maxlength="5" placeholder="Jr."' })}
        ${field('M.I.', 'mi', d.mi, { span: 's1', extra: 'maxlength="3"' })}
        <div class="f s4"><label>Position</label><select name="position">
          <option value="MEMBER">Member</option>
          ${OFFICERS.map(o => `<option value="${o.key}" ${d.position === o.key ? 'selected' : ''} ${taken.has(o.key) ? 'disabled' : ''}>${h(o.label)}${taken.has(o.key) ? ' (taken)' : ''}</option>`).join('')}
        </select></div>
        ${s ? '' : '<p id="onlineMatchHint" class="f s12 hint" role="status" hidden></p>'}
        ${field('Birthdate', 'birthdate', d.birthdate, { type: 'date', span: 's3', req: true, extra: `max="${todayISO()}"` })}
        <div class="f s2"><span class="lbl">Age</span><span class="age-pill" id="agePill">${ageOn(d.birthdate, ref) === '' ? '—' : ageOn(d.birthdate, ref)}</span></div>
        <div class="f s3"><span class="lbl req">Sex</span>${radios('sex', [{ key: 'M', label: 'Male' }, { key: 'F', label: 'Female' }], d.sex)}</div>
        <div class="f s4"><span class="lbl">Registration status</span>${radios('status', [{ key: 'N', label: 'N – New' }, { key: 'RR', label: 'RR – Reregistering' }], d.status)}</div>
        ${field('Membership card no.', 'cardNo', d.cardNo, { span: 's4' })}
        ${field('Highest rank earned', 'rank', d.rank, { span: 's4', list: 'dl-ranks' })}
        ${field('Years in scouting', 'years', d.years, { type: 'number', span: 's4', extra: 'min="0" max="30"' })}
        ${field('Grade / section', 'grade', d.grade, { span: 's4', extra: 'maxlength="60"' })}
        ${field('Parent / guardian name', 'guardian', d.guardian, { span: 's4', extra: 'maxlength="120"' })}
        ${field('Contact no.', 'contact', d.contact, { span: 's4', extra: 'maxlength="40"' })}
        ${s ? '' : `<div class="f s12"><div class="choices col">
          <label><input type="checkbox" name="paidNow"> Paid the ${peso(R().scout)} registration fee now (issues a receipt)</label>
          <label><input type="checkbox" name="joinCamp"> Also register for the ${h(campName())} — ${h(campDateLabel())}</label>
          <label data-camp-pay hidden style="padding-left:24px"><input type="checkbox" name="campPaidNow" disabled> Include the ${peso(campFee())} camping fee in this payment (same receipt)</label>
        </div></div>`}
      </div>
      <p class="hint">Age is computed as of the date applied (${fmtDate(ref)}). Only the age prints on the form, not the birthdate.</p>
      <div class="actions">
        <button class="btn primary" type="submit">${s ? 'Update scout' : '+ Add scout'}</button>
        ${s ? '<button class="btn" type="button" data-act="cancelScout">Cancel edit</button>' : ''}
      </div>
    </form>

    <div class="table-wrap" style="margin-top:16px"><table class="list">
      <thead><tr><th>#</th><th>Name</th><th>Source</th><th>Position</th><th>Status</th><th class="num">Age</th><th>Sex</th><th>Card no.</th><th>Highest rank</th><th class="num">Yrs</th><th>Payment</th><th>Camp</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((x, i) => `<tr class="${x.id === editingScoutId ? 'editing' : ''}">
        <td>${i + 1}</td><td><b>${h(fullName(x))}</b>${websiteRefLabel(x)}<div class="muted">${fmtShort(x.birthdate)}</div></td>
        <td><span class="badge ${x.onlineId ? 'paid' : 'off'}">${registrationSource(x)}</span></td>
        <td>${h((OFFICERS.find(o => o.key === x.position) || { label: 'Member' }).label)}</td>
        <td>${h(x.status)}</td><td class="num">${ageOn(x.birthdate, ref)}</td><td>${h(x.sex)}</td>
        <td>${h(x.cardNo)}</td><td>${h(x.rank)}</td><td class="num">${h(x.years)}</td>
        <td>${paidOf(x) > 0
          ? `<span class="badge paid">Paid</span> <span class="muted">${h(x.payment.receiptNo)}</span>${orNumber(x) ? `<div class="muted">OR No. ${h(orNumber(x))}</div>` : ''}`
          : `<button class="btn sm primary" data-act="payScout" data-id="${x.id}">Mark paid</button>${campJoined(x) && campEligible(x) && !campPaidOf(x)
            ? ` <button class="btn sm" data-act="payScout" data-camp="1" data-id="${x.id}" title="Registration and camping fees on one receipt">Paid + camp</button>` : ''}`}</td>
        <td>${campCell(x)}</td>
        <td><div class="row-actions">
          ${paidOf(x) > 0 ? `<button class="btn sm" data-act="receiptScout" data-id="${x.id}">Receipt</button>
          <button class="btn sm" data-act="unpayScout" data-id="${x.id}" title="Undo payment">Undo</button>` : ''}
          <button class="btn sm" data-act="editScout" data-id="${x.id}">Edit</button>
          <button class="btn sm danger" data-act="delScout" data-id="${x.id}">Remove</button>
        </div></td></tr>`).join('')
        : '<tr><td colspan="13" class="empty">No scouts yet. Add the first one above.</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

// camp status + actions for one learner; extra data-* attributes are passed to the buttons (e.g. data-unit)
function campCell(x, attrs = '') {
  const a = `data-id="${x.id}" ${attrs}`;
  if (!campEligible(x) && !campPaidOf(x)) return '<span class="muted" title="SNED learners are not included in the camp">SNED — not included</span>';
  if (campPaidOf(x) > 0) {
    const badge = `<span class="badge paid">Camp paid</span> <span class="muted">${h(x.camp.receiptNo)}</span>`;
    // a shared receipt is reprinted from the row's own Receipt control; Undo here removes only the camp fee
    if (campShared(x)) return `${badge}
    <div class="row-actions" style="margin-top:4px"><button class="btn sm" data-act="campUnpay" ${a} title="Remove the camping fee from this receipt">Undo camp</button></div>`;
    return `${badge}
    <div class="row-actions" style="margin-top:4px"><button class="btn sm" data-act="campReceipt" ${a}>Camp receipt</button>
    <button class="btn sm" data-act="campUnpay" ${a} title="Undo camp payment">Undo</button></div>`;
  }
  const pay = `<button class="btn sm primary" data-act="campPay" ${a} title="Records the camping fee and prints a camp-only receipt">Pay camp</button>`;
  // already joined but unpaid: offer a way to take them off the camp list without recording a payment
  if (campJoined(x)) return `<div class="row-actions">${pay}<button class="btn sm" data-act="campLeave" ${a} title="Remove from the camp without recording payment">Leave camp</button></div>`;
  return `<div class="row-actions">${pay}</div>`;
}

function unitPaymentCard(u) {
  const r = R(), p = u.payment || {}, fee = unitFee(u), paid = paidOf(u), nPaid = paidScouts(u).length;
  return `
  <form class="card" id="unitPayForm">
    <h2><span class="step">Step 3</span>Registration fees &amp; payment</h2>
    <p class="hint" style="margin-top:-6px">Each scout pays individually and gets their own receipt. Mark payments in the roster above.</p>
    <div class="table-wrap"><table class="list" style="max-width:620px">
      <thead><tr><th></th><th class="num">Scouts</th><th class="num">Amount</th></tr></thead>
      <tbody>
        <tr><td>Total registration fees (× ${num(r.scout)})</td><td class="num">${u.scouts.length}</td><td class="num">${num(fee)}</td></tr>
        <tr><td>Paid</td><td class="num">${nPaid}</td><td class="num">${num(paid)}</td></tr>
      </tbody>
      <tfoot><tr><td>Balance (unpaid)</td><td class="num">${u.scouts.length - nPaid}</td><td class="num">${peso(fee - paid)}</td></tr></tfoot>
    </table></div>
    ${campers(u).length ? `<div class="table-wrap" style="margin-top:10px"><table class="list" style="max-width:620px">
      <thead><tr><th>${h(campName())} <span class="muted" style="font-weight:400">(${h(campDateLabel())})</span></th><th class="num">Learners</th><th class="num">Amount</th></tr></thead>
      <tbody><tr><td>Camp fees (× ${num(campFee())})</td><td class="num">${campers(u).length}</td><td class="num">${num(campers(u).length * campFee())}</td></tr>
        <tr><td>Paid</td><td class="num">${campers(u).filter(s => campPaidOf(s) > 0).length}</td><td class="num">${num(campers(u).reduce((n, s) => n + campPaidOf(s), 0))}</td></tr></tbody>
    </table></div>` : ''}
    <div class="actions">
      <button class="btn" type="button" data-act="payAllScouts" ${u.scouts.length > nPaid ? '' : 'disabled'}>Mark all unpaid scouts as paid</button>
      <button class="btn" type="button" data-act="receiptsUnit" data-id="${u.id}" ${nPaid || campers(u).some(s => campPaidOf(s) > 0) ? '' : 'disabled'}>Print all receipts (${unitReceipts(u).length})</button>
    </div>
    <h2 style="margin-top:20px">Remittance to council <span class="muted" style="font-weight:400;font-size:13px">(printed on the AUR form)</span></h2>
    <div class="grid">
      ${field('Paid under OR no.', 'orNo', unitOrNumber(u), { span: 's4' })}
      ${field('Date', 'datePaid', p.datePaid || '', { type: 'date', span: 's4' })}
      ${field('Expiration date', 'expiration', u.expiration || '', { type: 'date', span: 's4' })}
    </div>
    <div class="actions"><button class="btn primary" type="submit">Save</button></div>
  </form>`;
}

/* ----------------------------------------------------------------- adults */

function viewAdults() {
  const q = listFilter.toLowerCase();
  const adults = db.adults.filter(a => !q || [fullName(a), a.sponsor, a.unitNo, roleOf(a.role)?.label].join(' ').toLowerCase().includes(q))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return `
  <div class="page-head">
    <div><h1>Adult Registration (AAR)</h1><p class="sub">BSP Form 6-03. One form per adult, printed individually.</p></div>
    <div class="toolbar">
      <input type="text" placeholder="Search name, school, role…" value="${h(listFilter)}" data-filter>
      <button class="btn primary" data-act="newAdult">+ New adult</button>
    </div>
  </div>
  <div class="card table-wrap"><table class="list">
    <thead><tr><th>Name</th><th>To serve as</th><th>Sponsoring institution</th><th>Fee category</th><th class="num">Fee</th><th class="num">Paid</th><th>Status</th><th></th></tr></thead>
    <tbody>${adults.length ? adults.map(a => `<tr>
      <td><b>${h(fullName(a))}</b>${websiteRefLabel(a)}<div class="muted">${h(a.position || '')}</div></td>
      <td>${h(roleOf(a.role)?.label || '')}${a.unitNo ? ` <span class="muted">· Unit ${h(a.unitNo)}</span>` : ''}</td>
      <td>${h(a.sponsor)}</td>
      <td>${adultCat(a) === 'lay' ? 'Head / Coordinator' : 'Teacher'}</td>
      <td class="num">${num(adultFee(a))}</td>
      <td class="num">${num(paidOf(a))}</td>
      <td>${payStatus(adultFee(a), paidOf(a))}</td>
      <td><div class="row-actions">
        <button class="btn sm" data-act="openAdult" data-id="${a.id}">Open</button>
        <button class="btn sm" data-act="printAAR" data-id="${a.id}">Print AAR</button>
        <button class="btn sm" data-act="receiptAdult" data-id="${a.id}" ${paidOf(a) > 0 ? '' : 'disabled title="Record a payment first"'}>Receipt</button>
        <button class="btn sm danger" data-act="delAdult" data-id="${a.id}">Delete</button>
      </div></td></tr>`).join('')
      : `<tr><td colspan="8" class="empty">${db.adults.length ? 'No match.' : 'No adults yet. Click <b>+ New adult</b> to begin.'}</td></tr>`}</tbody>
  </table></div>`;
}

function viewAdult() {
  const a = route.id ? getAdult(route.id) : null;
  const d = a || { aarNo: '', surname: '', first: '', mi: '', sex: '', civil: '', tenure: '', cardNo: '', expiration: '', role: '', unitNo: '', sponsor: '', council: db.settings.council, birthdate: '', birthplace: '', religion: '', occupation: '', position: '', payment: {} };
  const p = d.payment || {};
  const fee = d.role ? adultFee(d) : 0;
  const rolesA = ADULT_ROLES.filter(r => r.group === 'A'), rolesB = ADULT_ROLES.filter(r => r.group === 'B');

  return `${datalists()}
  <div class="page-head">
    <div><h1>${a ? h(fullName(a)) : 'New adult'}</h1><p class="sub">Application for Adult Registration (BSP Form 6-03)</p></div>
    <div class="toolbar">
      <button class="btn" data-act="nav" data-view="adults">← Back to adults</button>
      ${a ? `<button class="btn primary" data-act="printAAR" data-id="${a.id}">Print AAR form</button>` : ''}
    </div>
  </div>
  <form class="card" id="adultForm" autocomplete="off">
    ${websiteRefLabel(d)}
    <h2>Personal information</h2>
    <div class="grid">
      ${field('Surname', 'surname', d.surname, { span: 's4', req: true })}
      ${field('First name', 'first', d.first, { span: 's4', req: true })}
      ${field('Ext.', 'ext', d.ext, { span: 's2', list: 'dl-exts', extra: 'maxlength="5" placeholder="Jr."' })}
      ${field('M.I.', 'mi', d.mi, { span: 's2', extra: 'maxlength="3"' })}
      <div class="f s4"><span class="lbl">Sex</span>${radios('sex', [{ key: 'Male', label: 'Male' }, { key: 'Female', label: 'Female' }], d.sex)}</div>
      <div class="f s4"><label>Civil status</label><select name="civil">
        ${['', 'Single', 'Married', 'Widowed', 'Separated'].map(c => `<option ${c === d.civil ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      ${field('Religion', 'religion', d.religion, { span: 's4' })}
      ${field('Date of birth', 'birthdate', d.birthdate, { type: 'date', span: 's3', extra: `max="${todayISO()}"` })}
      <div class="f s2"><span class="lbl">Age</span><span class="age-pill" id="agePill">${ageOn(d.birthdate) === '' ? '—' : ageOn(d.birthdate)}</span></div>
      ${field('Place of birth', 'birthplace', d.birthplace, { span: 's7' })}
      ${field('Profession / occupation', 'occupation', d.occupation, { span: 's6' })}
      ${field('Position / title', 'position', d.position, { span: 's6' })}
      ${field('Contact no.', 'contact', d.contact, { span: 's6', extra: 'maxlength="40"' })}
      ${field('Email', 'email', d.email, { type: 'email', span: 's6', extra: 'maxlength="120"' })}
    </div>
  </form>

  <div class="card">
    <h2>Scouting information</h2>
    <div class="grid">
      ${field('Tenure in scouting', 'tenure', d.tenure, { span: 's4', extra: 'form="adultForm" placeholder="e.g. 5 years"' })}
      ${field('Membership card no.', 'cardNo', d.cardNo, { span: 's4', extra: 'form="adultForm"' })}
      ${field('Expiration date', 'expiration', d.expiration, { type: 'date', span: 's4', extra: 'form="adultForm"' })}
      <div class="f s6"><span class="lbl req">To serve as — A. Unit leaders <span class="muted">(Teachers · ${peso(R().teacher)})</span></span>
        ${radiosForm('role', rolesA, d.role)}</div>
      <div class="f s6"><span class="lbl req">To serve as — B. Lay leaders <span class="muted">(School heads & BSP coordinators · ${peso(R().lay)})</span></span>
        ${radiosForm('role', rolesB, d.role)}</div>
      ${field('Unit no.', 'unitNo', d.unitNo, { span: 's2', extra: 'form="adultForm"' })}
      ${field('Sponsoring institution', 'sponsor', d.sponsor, { span: 's6', list: 'dl-sponsors', req: true, extra: 'form="adultForm"' })}
      ${field('Council', 'council', d.council, { span: 's4', extra: 'form="adultForm"' })}
      ${field('AAR no.', 'aarNo', d.aarNo, { span: 's3', extra: 'form="adultForm"' })}
    </div>
  </div>

  <div class="card">
    <h2>Registration fee &amp; payment</h2>
    <p>Fee: <b id="adultFee">${d.role ? peso(fee) + ' — ' + (adultCat(d) === 'lay' ? 'Lay Leaders / Local Council Staff' : 'UL/AUL') : 'Choose what this adult will serve as'}</b></p>
    <div class="grid">
      ${field('Amount paid (₱)', 'amountPaid', p.amountPaid ?? '', { type: 'number', span: 's3', extra: 'form="adultForm" min="0" step="0.01"' })}
      ${field('Date paid', 'datePaid', p.datePaid || '', { type: 'date', span: 's3', extra: 'form="adultForm"' })}
      ${field('Paid under OR no.', 'orNo', orNumber(d), { span: 's3', extra: 'form="adultForm"' })}
    </div>
    <p class="hint">${a ? `Status: ${payStatus(fee, paidOf(a))}${p.receiptNo ? ` · Receipt no. <b>${h(p.receiptNo)}</b>` : ''}` : ''}</p>
    <div class="actions">
      <button class="btn" type="button" data-act="fillFullAdult">Pay full amount</button>
      <button class="btn primary" type="submit" form="adultForm">${a ? 'Save changes' : 'Save adult'}</button>
      ${a ? `<button class="btn" type="button" data-act="receiptAdult" data-id="${a.id}" ${paidOf(a) > 0 ? '' : 'disabled'}>Print receipt</button>` : ''}
    </div>
  </div>`;
}

const radiosForm = (name, options, value) =>
  `<div class="choices col">${options.map(o => `<label><input type="radio" form="adultForm" name="${name}" value="${o.key}" ${o.key === value ? 'checked' : ''}> ${h(o.label)}</label>`).join('')}</div>`;

/* ----------------------------------------------------------------- online */
/* Registrations submitted on the school website (Supabase table bsp_registrations). */

let online = { email: null, rows: null, loading: false, error: '', kind: 'scout', checked: false };
const sbCfg = () => ({ url: db.settings.supabaseUrl.replace(/\/+$/, ''), key: db.settings.supabaseKey });
const onlineRef = r => r.id.slice(0, 8).toUpperCase();
const localByOnlineId = id => db.adults.find(a => a.onlineId === id)
  || db.units.flatMap(u => u.scouts.map(s => ({ ...s, _unit: u }))).find(s => s.onlineId === id);
// surname+given only, ignoring middle initial: staff matching a name as they type may not
// have reached the M.I. field yet, and a stored record's M.I. shouldn't block the match
const nameKey = (surname, given) => `${(surname || '').trim()}, ${(given || '').trim()}`.toLowerCase();

// finds a pending/imported website submission with the same name, so staff adding a scout
// by hand are steered to the online record instead of creating a disconnected duplicate
function matchingOnlineScout(surname, given) {
  if (!surname.trim() || !given.trim()) return null;
  const key = nameKey(surname, given);
  return (online.rows || []).find(r => r.reg_type === 'scout' && nameKey(r.surname, r.given_name) === key);
}

// most-recent-year-first search across archived (rolled-over) school years for a same-named
// scout, so re-registering a returning learner can reuse their last known details
function matchingArchivedScout(surname, given) {
  if (!surname.trim() || !given.trim()) return null;
  const key = nameKey(surname, given);
  for (const year of Object.keys(db.archives).sort().reverse()) {
    for (const u of db.archives[year].units) {
      const scout = u.scouts.find(s => nameKey(s.surname, s.given) === key);
      if (scout) return { year, scout };
    }
  }
  return null;
}
function archivedScout(year, id) {
  const a = db.archives[year];
  if (!a) return null;
  for (const u of a.units) { const s = u.scouts.find(x => x.id === id); if (s) return s; }
  return null;
}

function websiteFeePayload(settings = db.settings) {
  const rates = {};
  for (const key of ['scout', 'teacher', 'lay', 'camp']) {
    const raw = settings.rates[key], amount = Number(raw);
    if (raw == null || String(raw).trim() === '' || !Number.isFinite(amount) || amount < 0 || amount > 99999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
      throw new Error('Fees must be non-negative amounts with at most two decimal places.');
    }
    rates[key] = amount;
  }
  return { p_sponsor: settings.defaultSponsor.trim(), p_rates: rates,
    p_camp_name: settings.campName || 'Boy Scout Camping', p_camp_date: settings.campDate || '',
    p_camp_venue: settings.campVenue || settings.defaultSponsor.trim(),
    p_current_sy: (settings.schoolYear || '').trim() };
}

let websiteFeesRunning = false;
async function syncWebsiteFees() {
  if (window.bsp.cloudStart) return;
  // Only explicitly saved/published settings are uploaded. Opening an old backup
  // or signing in on another computer must not publish its defaults automatically.
  if (!online.email || !db.settings.websiteFeesPending || websiteFeesRunning) return;
  const sessionState = online, email = online.email, localDb = db, cfg = sbCfg();
  const current = () => online === sessionState && online.email === email && db === localDb
    && JSON.stringify(sbCfg()) === JSON.stringify(cfg);
  let signature, succeeded = false;
  websiteFeesRunning = true;
  try {
    const payload = websiteFeePayload();
    signature = JSON.stringify(payload);
    const result = await window.bsp.sbRest(cfg, 'POST', 'rpc/bsp_publish_fees', payload);
    if (!current()) return;
    if (result.error) throw new Error(result.error);
    const published = result.data?.[0];
    if (published?.sponsor !== payload.p_sponsor || !published.updated_at) throw new Error('The website did not confirm the published fees.');
    succeeded = true;
    if (JSON.stringify(websiteFeePayload()) === signature) {
      db.settings.websiteFeesPending = false;
      db.settings.websiteFeesPublishedAt = published.updated_at;
      if (!window.bsp.save(JSON.stringify(db))) {
        db.settings.websiteFeesPending = true;
        throw new Error('Fees reached the website, but the local confirmation could not be saved. Retry publishing.');
      }
    }
    online.feeSyncError = '';
  } catch (err) {
    succeeded = false;
    if (current()) online.feeSyncError = `Website fees have not been confirmed: ${err.message} Run bsp_website_fees.sql if the fee service is not installed, then retry publishing.`;
  } finally {
    websiteFeesRunning = false;
    if (current()) {
      if (route.view === 'settings') render({ preserveScroll: true });
      // A newer settings save made during this request is published next.
      if (succeeded && db.settings.websiteFeesPending) void syncWebsiteFees();
    }
  }
}

async function connectSharedWorkspace() {
  if (!window.bsp.cloudStart) return;
  try { await window.bsp.cloudStart(sbCfg()); }
  catch (err) {
    online.error = /No handler registered/.test(err.message) ? 'Restart the desktop app to load the new Supabase connection service.' : `Cannot connect to Supabase: ${err.message}`;
    window.dispatchEvent(new CustomEvent('bsp-cloud-error', { detail: online.error }));
  }
}

async function onlineInit() {
  if (online.checked) return;
  online.checked = true;
  let s;
  try { s = await window.bsp.sbSession(); }
  catch (err) { online.error = err.message; if (route.view !== 'registration') render(); return; }
  online.email = s ? s.email : null;
  if (online.email) await connectSharedWorkspace();
  if (online.email) { startOnlineLive(); onlineRefresh(); } else if (route.view !== 'registration') render();
}

function startOnlineLive() {
  if (window.bsp.sbWatch) window.bsp.sbWatch(sbCfg()).then(() => { online.liveError = ''; }).catch(err => {
    online.liveError = /No handler registered/.test(err.message)
      ? 'Restart the app to enable live updates. You can use Refresh in the meantime.'
      : 'Live updates are unavailable. Use Refresh to check for new registrations.';
    if (route.view === 'online') render({ preserveScroll: true });
  });
}

let onlineRefreshPending = false;
window.bsp.onRegistrationChange?.(update => {
  if (!online.email) return;
  if (update.error) {
    online.liveError = update.error;
    if (route.view === 'online') render({ preserveScroll: true });
  } else if (update.changed) {
    online.liveError = '';
    if (online.loading || online.importing) onlineRefreshPending = true;
    else onlineRefresh();
  }
});

const syncedLearnerReceipts = new Map();
let syncingLearnerReceipts = false;
async function syncLearnerReceipts() {
  if (window.bsp.cloudStart) return;
  if (!online.email || syncingLearnerReceipts) return;
  syncingLearnerReceipts = true;
  try {
    for (const scout of db.units.flatMap(unit => unit.scouts).filter(scout => scout.onlineId)) {
      const ar = paidOf(scout) > 0 ? scout.payment?.receiptNo || null : null;
      const printedAt = ar ? scout.payment?.receiptPrintedAt || null : null;
      const campAr = campPaidOf(scout) > 0 ? scout.camp?.receiptNo || null : null;
      const campPrintedAt = campAr ? scout.camp?.receiptPrintedAt || null : null;
      // Reflects the live roster, not just the original website submission: a
      // coordinator can add a learner to (or remove them from) the camp here
      // after import, and the website's "Paid for camp" status needs to know
      // whether camp applies at all, separately from whether it is paid.
      const joined = campJoined(scout);
      const signature = JSON.stringify([ar, printedAt, campAr, campPrintedAt, joined]);
      if (syncedLearnerReceipts.get(scout.onlineId) === signature) continue;
      // Older local backups do not know the printing time. Do not erase a
      // timestamp already synced by another updated copy of the app.
      const update = { ar_no: ar, camp_ar_no: campAr, camp_requested: joined };
      const res = await window.bsp.sbRest(sbCfg(), 'PATCH', `bsp_registrations?id=eq.${encodeURIComponent(scout.onlineId)}`, update);
      if (res.error) throw new Error(res.error);
      if (printedAt && res.data?.length) {
        // The first recorded server timestamp wins, including after restoring
        // an older backup or printing from another desktop installation.
        const stamp = await window.bsp.sbRest(sbCfg(), 'PATCH', `bsp_registrations?id=eq.${encodeURIComponent(scout.onlineId)}&receipt_printed_at=is.null`, { receipt_printed_at: printedAt });
        if (stamp.error) throw new Error(stamp.error);
      }
      if (campPrintedAt && res.data?.length) {
        const campStamp = await window.bsp.sbRest(sbCfg(), 'PATCH', `bsp_registrations?id=eq.${encodeURIComponent(scout.onlineId)}&camp_receipt_printed_at=is.null`, { camp_receipt_printed_at: campPrintedAt });
        if (campStamp.error) throw new Error(campStamp.error);
      }
      if (res.data?.length) syncedLearnerReceipts.set(scout.onlineId, signature);
    }
    online.syncError = '';
  } catch (err) { online.syncError = `Website receipt sync failed: ${err.message}. Check supabase/bsp_public_learner_list.sql; sync will retry on refresh.`; console.warn(online.syncError); }
  finally { syncingLearnerReceipts = false; }
}

async function onlineRefresh() {
  if (online.loading || online.importing) return;
  const refreshState = online;
  online.loading = true; online.error = ''; if (route.view === 'online') render({ preserveScroll: true });
  void syncLearnerReceipts();
  void syncWebsiteFees();
  let res;
  try { res = await window.bsp.sbRest(sbCfg(), 'GET', 'bsp_registrations?status=in.(pending,imported)&order=created_at.asc'); }
  catch (err) { res = { error: err.message }; }
  if (online !== refreshState) return; // signed out or switched sessions while loading
  online.loading = false;
  if (res.error) {
    online.error = /bsp_registrations/.test(res.error) && /exist|find/i.test(res.error)
      ? 'The bsp_registrations table does not exist yet. Run supabase/bsp_registrations.sql in the Supabase SQL Editor.'
      : res.error;
    if (/sign in/i.test(res.error)) online.email = null;
  } else online.rows = res.data;
  if (route.view === 'online') render({ preserveScroll: true });
  else document.querySelector('[data-view=online]').innerHTML = `Online${online.rows?.length ? ` <span class="nav-badge">${online.rows.length}</span>` : ''}`;
  flushOnlineRefresh();
}

function flushOnlineRefresh() {
  if (onlineRefreshPending && !online.loading && !online.importing) {
    onlineRefreshPending = false;
    if (online.email) void onlineRefresh();
  }
}

// best existing unit for a registration, or '' for "create a new unit"
function guessUnit(r) {
  const sp = sponsorKey(r.sponsor || db.settings.defaultSponsor);
  const same = db.units.filter(u => sponsorKey(u.sponsor) === sp);
  const exact = same.find(u => u.unitType === r.unit_type && (u.unitNo || '') === (r.unit_no || ''));
  if (exact) return exact.id;
  const byType = same.filter(u => r.unit_type && u.unitType === r.unit_type);
  if (byType.length === 1) return byType[0].id;
  if (!r.unit_type && same.length === 1) return same[0].id;
  return '';
}

function unitChoice(r) {
  const pick = online.unitChoices?.[r.id] ?? guessUnit(r);
  return `<select data-unit-for="${r.id}" class="online-unit-select" aria-label="Add ${h(fullName({ surname: r.surname, given: r.given_name, mi: r.middle_initial }))} to unit">
    ${db.units.map(u => `<option value="${u.id}" ${u.id === pick ? 'selected' : ''}>${h(unitLabel(u))} — ${h(u.sponsor || '(no school)')}</option>`).join('')}
    <option value="" ${pick ? '' : 'selected'}>+ New unit: ${h(r.unit_type || 'Unit')} No. ${h(r.unit_no || '—')}</option>
  </select>`;
}

const campChoice = id => online.campChoices?.[id] ?? (db.campIntents[id] ?? !!online.rows?.find(r => r.id === id)?.camp_requested);

function viewOnline() {
  return onlineTabs('online') + viewOnlineList();
}

function viewOnlineList() {
  onlineInit();
  if (!online.checked || (online.email === null && online.loading)) return '<div class="card empty">Connecting…</div>';
  if (!online.email) return `
  <div class="page-head"><div><h1>Online registrations</h1><p class="sub">Registrations submitted on the school website.</p></div></div>
  <form class="card" id="onlineSignIn" style="max-width:520px">
    <h2>Sign in to Supabase</h2>
    <p class="muted">Use a Supabase account whose e-mail is listed in <b>bsp_admins</b>.</p>
    <div class="grid">
      ${field('E-mail', 'email', '', { type: 'text', span: 's12', req: true })}
      ${field('Password', 'password', '', { type: 'password', span: 's12', req: true })}
    </div>
    ${online.error ? `<p class="hint" style="color:var(--red)">${h(online.error)}</p>` : ''}
    <div class="actions"><button class="btn primary" type="submit">Sign in</button></div>
  </form>`;

  const category = r => r.reg_type === 'scout' ? 'scout' : roleOf(r.role)?.group === 'B' ? 'coordinator' : 'teacher';
  const allPaid = [...db.units.flatMap(u => u.scouts.filter(s => s.onlineId && paidOf(s) > 0).map(s => ({ s, u }))),
    ...db.adults.filter(a => a.onlineId && paidOf(a) > 0).map(a => ({ a }))]
    .sort((x, y) => ((y.s || y.a).payment.receiptNo || '').localeCompare((x.s || x.a).payment.receiptNo || ''));
  const pending = (online.rows || []).filter(r => { const local = localByOnlineId(r.id); return !local || paidOf(local) <= 0; });
  const isPaid = online.paymentStatus === 'paid';
  const paidCategory = entry => entry.s ? 'scout' : category(entry.a);
  const q = listFilter.trim().toLowerCase(), hit = (...v) => !q || v.join(' ').toLowerCase().includes(q);
  const rows = pending.filter(r => category(r) === online.kind
    && hit(onlineRef(r), r.surname, r.given_name, r.middle_initial, r.grade_section, r.guardian_name, r.contact_no, r.role, r.unit_no));
  const paidOnline = allPaid.filter(entry => paidCategory(entry) === online.kind && hit(...(({ s, a }) => {
    const x = s || a;
    return [x.payment.receiptNo, x.camp?.receiptNo, websiteRef(x), x.surname, x.given, x.first, x.ext, x.mi, s?.grade, s?.guardian, x.contact];
  })(entry)));
  const groups = [['scout', 'Learners'], ['teacher', 'Teachers'], ['coordinator', 'Heads / Coordinators']];

  return `
  <div class="page-head">
    <div><h1>Online registrations</h1><p class="sub">Website submissions update live when registrations change. Import to include the name in the BSP form, then record payment and print the receipt. Signed in as ${h(online.email)}.</p></div>
    <div class="toolbar">
      <button class="btn" data-act="onlineRefresh">${online.loading ? 'Refreshing…' : '↻ Refresh'}</button>
      <button class="btn" style="margin-left:auto" data-act="onlineSignOut">Sign out</button>
    </div>
  </div>
  ${online.error ? `<div class="card" style="border-color:#e6bdb9;color:var(--red)">${h(online.error)}</div>` : ''}
  ${online.liveError ? `<div class="card hint" role="status">${h(online.liveError)}</div>` : ''}
  ${online.syncError ? `<div class="card" role="alert">${h(online.syncError)}</div>` : ''}
  <div class="filter-bar">
  <div class="seg" aria-label="Payment status">
    <button class="${!isPaid ? 'on' : ''}" data-act="onlinePaymentStatus" data-status="pending">Pending payment <span class="nav-badge">${pending.length}</span></button>
    <button class="${isPaid ? 'on' : ''}" data-act="onlinePaymentStatus" data-status="paid">Paid <span class="nav-badge">${allPaid.length}</span></button>
  </div>
  <div class="seg">
    ${groups.map(([key, label]) => `<button class="${online.kind === key ? 'on' : ''}" data-act="onlineKind" data-kind="${key}">${label} <span class="nav-badge">${isPaid ? allPaid.filter(entry => paidCategory(entry) === key).length : pending.filter(r => category(r) === key).length}</span></button>`).join('')}
  </div>
  <label class="search-box" title="Search (Ctrl+F)">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input type="search" placeholder="Search name, website ref., receipt no., grade…" aria-label="Search online registrations" value="${h(listFilter)}" data-filter>
  </label>
  </div>
  ${q ? `<p class="search-count" role="status">${(isPaid ? paidOnline : rows).length} match${(isPaid ? paidOnline : rows).length === 1 ? '' : 'es'} for “${h(listFilter.trim())}” in ${isPaid ? 'Paid' : 'Pending payment'} · ${groups.find(([key]) => key === online.kind)[1]}</p>` : ''}
  ${!isPaid ? `<div class="card table-wrap">
    <table class="list online-list">
      <thead><tr><th class="online-ref">Website ref.</th><th class="online-name">Name</th>${online.kind === 'scout'
        ? '<th class="online-grade">Grade / section</th><th class="online-contact">Parent / guardian</th>'
        : '<th>To serve as</th><th>Unit</th><th>Contact</th>'}<th class="num">Fee</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(r => {
        const name = fullName({ surname: r.surname, given: r.given_name, mi: r.middle_initial });
        const fee = r.reg_type === 'scout' ? R().scout : adultFee({ role: r.role });
        const dup = localByOnlineId(r.id);
        return `<tr>
          <td><b class="mono">${onlineRef(r)}</b><div class="muted">${fmtShort(r.created_at.slice(0, 10))}</div></td>
          <td class="online-name"><b>${h(name)}</b><div class="muted">${r.sex === 'F' ? 'Female' : r.sex === 'M' ? 'Male' : ''}${r.reg_status === 'RR' ? ' · Reregistering' : ''}</div></td>
          ${r.reg_type === 'scout'
            ? `<td>${h(gradeSectionLabel(r.grade_section))}<div class="muted">Age: ${ageOn(r.birthdate)}</div></td>
               <td>${h(r.guardian_name)}<div class="muted">${h(r.contact_no)}</div></td>`
            : `<td>${h(roleOf(r.role)?.label || '')}</td><td>${h([r.unit_type, r.unit_no].filter(Boolean).join(' No. '))}</td>
               <td>${h(r.contact_no)}<div class="muted">${h(r.email)}</div></td>`}
          <td class="num">${num(fee)}</td>
          <td class="online-actions"><div class="row-actions">
            ${dup ? `<span class="badge partial">Already imported</span> ${r.reg_type === 'scout'
              ? `<button class="btn sm" data-act="editOnlineScout" data-unit="${dup._unit.id}" data-id="${dup.id}">Edit</button>`
              : `<button class="btn sm" data-act="openAdult" data-id="${dup.id}">Edit</button>`}` : ''}
            ${r.reg_type === 'scout' && campEligible({ grade: r.grade_section }) ? `<label class="camp-toggle" title="${h(campName())} — ${h(campDateLabel())}"><input type="checkbox" data-camp-for="${r.id}" ${campChoice(r.id) ? 'checked' : ''}> + Camping (${num(campFee())})</label>` : ''}
            <button class="btn sm primary" data-act="onlinePay" data-id="${r.id}">Record payment & print</button>
            <button class="btn sm" data-act="onlineAdd" data-id="${r.id}" title="Include this person in the BSP registration form">Import & open form</button>
            ${dup
              ? `<button class="btn sm danger" data-act="deleteOnlinePaid" data-id="${dup.id}" data-unit="${r.reg_type === 'scout' ? dup._unit.id : ''}" title="Removes the imported record, not just the website submission">Delete</button>`
              : `<button class="btn sm danger" data-act="onlineReject" data-id="${r.id}">Reject</button>`}
          </div></td></tr>`;
      }).join('') : `<tr><td colspan="${online.kind === 'scout' ? 6 : 7}" class="empty">${online.loading ? 'Loading…' : online.rows ? (q ? 'No matches for this search.' : 'No pending registrations in this group.') : ''}</td></tr>`}</tbody>
    </table>
  </div>` : ''}
  ${isPaid ? `<div class="card table-wrap"><h2>Paid (from online)</h2><table class="list">
    <thead><tr><th>Receipt no.</th><th>Name</th><th>Grade / section</th><th>Date paid</th><th class="num">Amount</th><th>Camp</th><th></th></tr></thead>
    <tbody>${paidOnline.map(({ s, u, a }) => `<tr>
      <td>${h((s || a).payment.receiptNo)}</td><td>${h(fullName(s || a))}${websiteRefLabel(s || a)}</td>
      <td>${h(gradeSectionLabel(s?.grade) || '—')}</td>
      <td>${h(fmtShort((s || a).payment.datePaid) || '—')}</td><td class="num">${num(paidOf(s || a) + (s && campShared(s) ? campPaidOf(s) : 0))}</td>
      <td>${s ? campCell(s, `data-unit="${u.id}"`) : '<span class="muted">—</span>'}</td>
      <td><div class="row-actions">${s
        ? `<button class="btn sm" data-act="editOnlineScout" data-unit="${u.id}" data-id="${s.id}">Edit</button>
           <button class="btn sm" data-act="reprintScout" data-unit="${u.id}" data-id="${s.id}">Reprint receipt</button>`
        : `<button class="btn sm" data-act="openAdult" data-id="${a.id}">Edit</button>
           <button class="btn sm" data-act="receiptAdult" data-id="${a.id}">Reprint receipt</button>`}<button class="btn sm danger" data-act="deleteOnlinePaid" data-id="${(s || a).id}" data-unit="${s ? u.id : ''}">Delete</button></div></td></tr>`).join('')}</tbody>
  </table>${paidOnline.length ? '' : `<p class="empty">${q ? 'No matches for this search.' : 'No paid registrations in this group.'}</p>`}</div>` : ''}
  <p class="hint">Not seeing registrations you expect? Your Supabase e-mail must be listed in the <b>bsp_admins</b> table.</p>`;
}

// copy one online registration into the local records; returns { unit, scout } or { adult }
function importOnline(r, unitId) {
  if (r.reg_type === 'scout') {
    let u = unitId ? getUnit(unitId) : null;
    if (!u) {
      u = { id: uid(), sponsor: r.sponsor || db.settings.defaultSponsor, unitNo: r.unit_no || '', council: db.settings.council,
        unitType: r.unit_type || '', nature: 'School-Based', dateApplied: todayISO(), aurNo: '', leaders: {}, scouts: [], payment: {} };
      db.units.push(u);
    }
    const scout = { id: uid(), onlineId: r.id, surname: r.surname, given: r.given_name, mi: mi(r.middle_initial), position: 'MEMBER',
      status: r.reg_status || 'N', birthdate: r.birthdate || '', sex: r.sex || '', cardNo: r.card_no || '', rank: r.highest_rank || '',
      years: r.years_in_scouting ?? '', grade: r.grade_section || '', guardian: r.guardian_name || '', contact: r.contact_no || '', payment: { orNo: onlineRef(r) } };
    u.scouts.push(scout);
    return { unit: u, scout };
  }
  const adult = { id: uid(), onlineId: r.id, aarNo: '', surname: r.surname, first: r.given_name, mi: mi(r.middle_initial),
    sex: r.sex === 'F' ? 'Female' : r.sex === 'M' ? 'Male' : '', civil: r.civil_status || '', tenure: r.tenure || '', cardNo: r.card_no || '',
    expiration: r.card_expiration || '', role: r.role || '', unitNo: r.unit_no || '', sponsor: r.sponsor || db.settings.defaultSponsor,
    council: db.settings.council, birthdate: r.birthdate || '', birthplace: r.birthplace || '', religion: r.religion || '',
    occupation: r.occupation || '', position: r.position_title || '', contact: r.contact_no || '', email: r.email || '', payment: { orNo: onlineRef(r) } };
  db.adults.push(adult);
  return { adult };
}

// joins the camp when chosen; with payNow (registration just paid), the camp fee goes on the same receipt
function applyCampChoice(scout, join, payNow) {
  join = join && campEligible(scout);
  if (join && !campJoined(scout)) scout.camp = { ...(scout.camp || {}), joined: true };
  if (join && payNow && campFee() > 0 && !campPaidOf(scout)) payCamp(scout, scout.payment.receiptNo);
  if (scout.onlineId) delete db.campIntents[scout.onlineId];
}

async function setOnlineStatus(r, status) {
  const res = await window.bsp.sbRest(sbCfg(), 'PATCH', `bsp_registrations?id=eq.${r.id}`,
    { status, imported_at: status === 'imported' ? new Date().toISOString() : null,
      ...(r.reg_type === 'scout' ? { ar_no: (() => { const rec = localByOnlineId(r.id); return rec && paidOf(rec) > 0 ? rec.payment?.receiptNo || null : null; })() } : {}) });
  if (res.error) { alert('Could not update the website record: ' + res.error); return false; }
  if (!res.data || !res.data.length) { alert('The website record could not be updated (check that your e-mail is in bsp_admins).'); return false; }
  const local = localByOnlineId(r.id);
  if (status !== 'imported' || (local && paidOf(local) > 0)) online.rows = online.rows.filter(x => x.id !== r.id);
  return true;
}

async function onlineTake(id, paid) {
  const r = online.rows.find(x => x.id === id);
  if (!r) return;
  if (online.importing) return;
  online.importing = true;
  const snapshot = JSON.stringify(db);
  try {
  const existing = localByOnlineId(id);
  const res = existing
    ? (existing._unit ? { unit: existing._unit, scout: existing._unit.scouts.find(s => s.id === existing.id) } : { adult: existing })
    : importOnline(r, guessUnit(r));
  const rec = res.scout || res.adult;
  // Persist locally before acknowledging the website record, so a failed sync can be retried safely.
  const justPaid = paid && !paidOf(rec);
  if (justPaid) {
    rec.payment = { ...rec.payment, orNo: orNumber(rec), amountPaid: res.scout ? Number(R().scout) : adultFee(rec), datePaid: todayISO() };
    issueReceiptIfNeeded(rec);
  }
  if (res.scout) applyCampChoice(rec, campChoice(id), justPaid);
  if (!window.bsp.save(JSON.stringify(db))) {
    db = JSON.parse(snapshot);
    alert('Could not save registration to disk. No registration was imported. Please retry.');
    return;
  }
  let synced = false;
  try { synced = await setOnlineStatus(r, 'imported'); }
  catch (err) { alert('Saved locally, but website sync failed: ' + err.message); }
  if (paid) {
    route = { view: 'online' };
    render();
  } else if (res.scout) {
    route = { view: 'unit', id: res.unit.id };
    editingScoutId = res.scout.id;
    render();
    document.getElementById('roster').scrollIntoView();
  } else go('adult', res.adult.id);
  toast(`${fullName(rec)} is included in the BSP form${synced ? '' : ' ? website sync pending'}`);
  if (paid) res.scout ? printReceipts([scoutReceipt(res.unit, res.scout)]) : receiptForAdult(res.adult);
  } finally { online.importing = false; flushOnlineRefresh(); }
}

/* --------------------------------------------------------------- settings */

function viewSettings() {
  const s = db.settings, r = s.rates;
  return `
  <div class="page-head"><div><h1>Settings</h1><p class="sub">Fee rates, receipt details, and data backup.</p></div></div>
  <form class="card" id="settingsForm">
    <h2>General</h2>
    <div class="grid">
      ${field('Local council (default for new forms)', 'council', s.council, { span: 's6' })}
      ${field('Name on receipts', 'signName', s.signName, { span: 's6' })}
      <div class="f s6"><label>Position on receipts (one per line)</label><textarea name="signPosition" rows="2">${h(s.signPosition)}</textarea></div>
      ${field('Receipt no. prefix', 'receiptPrefix', s.receiptPrefix, { span: 's3' })}
      ${field('Next receipt no.', 'nextReceipt', s.nextReceipt, { type: 'number', span: 's3', extra: 'min="1"' })}
      ${field('School year', 'schoolYear', s.schoolYear, { span: 's3', extra: 'placeholder="e.g. 2026"' })}
    </div>
    <h2 style="margin-top:20px">Registration fees (₱)</h2>
    <p class="hint">Saving these fees also publishes them to the registration website when signed in on the Online tab. Payments and receipts stay in this app.</p>
    <div class="grid">
      ${field('Scouts', 'r_scout', r.scout, { type: 'number', span: 's4', extra: 'min="0" step="0.01"' })}
      ${field('Teachers (UL / AUL)', 'r_teacher', r.teacher, { type: 'number', span: 's4', extra: 'min="0" step="0.01"' })}
      ${field('School heads & BSP coordinators', 'r_lay', r.lay, { type: 'number', span: 's4', extra: 'min="0" step="0.01"' })}
    </div>
    <h2 style="margin-top:20px">Boy Scout camping (learners, optional)</h2>
    <div class="grid">
      ${field('Camp name', 'campName', s.campName, { span: 's4' })}
      ${field('Camp date (tentative, optional)', 'campDate', s.campDate, { span: 's4', extra: 'placeholder="Leave empty if not yet set"' })}
      ${field('Camping fee (₱)', 'r_camp', r.camp, { type: 'number', span: 's4', extra: 'min="0" step="0.01"' })}
      ${field('Venue (default: school name)', 'campVenue', s.campVenue, { span: 's12', extra: `placeholder="${h(s.defaultSponsor || 'School name')}"` })}
    </div>
    <p class="hint">The camp date prints on receipts marked “tentative”; leave it empty and receipts show “date to be announced”. An empty venue uses the school name. Camp fees are tracked separately from registration fees.</p>
    <div class="actions"><button class="btn primary" type="submit">Save settings</button></div>
    <p class="hint" role="status">${online.feeSyncError ? h(online.feeSyncError) : db.settings.websiteFeesPending
      ? (online.email ? 'Fee publication pending. Retry publishing if the connection was interrupted.' : 'Fees saved locally. Sign in on the Online tab to publish them to the website.')
      : db.settings.websiteFeesPublishedAt ? 'Fees published from this app. Save settings to publish any changes.' : 'Save settings or publish current fees to show them on the website.'}</p>
    <div class="actions"><button class="btn" type="button" data-act="publishWebsiteFees">Publish current fees to website</button></div>
  </form>

  <form class="card" id="onlineSettingsForm">
    <h2>Online registration (school website)</h2>
    <div class="grid">
      ${field('Supabase URL', 'supabaseUrl', s.supabaseUrl, { span: 's6' })}
      ${field('Supabase publishable (anon) key', 'supabaseKey', s.supabaseKey, { span: 's6' })}
      ${field('School name (sponsoring institution) for online registrations', 'defaultSponsor', s.defaultSponsor, { span: 's12' })}
    </div>
    <div class="actions"><button class="btn primary" type="submit">Save</button></div>
  </form>

  <div class="card">
    <h2>School year</h2>
    <p class="muted">Currently registering for <b>SY ${h(s.schoolYear)}</b>. Starting a new school year archives every unit, scout, and adult here, clears the active roster, and restarts the receipt counter at 1. Archived learners stay searchable — typing a returning learner's name while adding a scout offers to reuse their previous details.</p>
    ${Object.keys(db.archives).length ? `<p class="hint">Archived: ${Object.keys(db.archives).sort().reverse().map(y => `SY ${h(y)} (${db.archives[y].units.reduce((n, u) => n + u.scouts.length, 0)} scout(s), ${db.archives[y].adults.length} adult(s))`).join(', ')}</p>` : ''}
    <div class="actions"><button class="btn" data-act="startNewSchoolYear">Start new school year…</button></div>
  </div>

  <div class="card">
    <h2>Backup &amp; restore</h2>
    <p class="muted">Records are saved automatically on this computer<span id="dataPath"></span>. Export a backup regularly, and import it to move the data to another computer.</p>
    <div class="actions">
      <button class="btn primary" data-act="exportJSON">Export backup (.json)</button>
      <button class="btn" data-act="importJSON">Import backup…</button>
      <button class="btn danger" data-act="resetAll">Erase all data</button>
    </div>
    <p class="hint">${db.units.length} unit(s), ${db.units.reduce((n, u) => n + u.scouts.length, 0)} scout(s), ${db.adults.length} adult(s) stored.</p>
  </div>`;
}

/* ================================================================= PRINT */

function doPrint(html, options) {
  window.bspPreview.open(html, options);
}

const cb = on => `<span class="cb">${on ? '☑' : '☐'}</span>`;
const blankIf0 = v => (v === 0 || v === '0') ? '' : v;

function formHead(formNo, office) {
  return `<div class="p-head">
    <div class="l">BSP FORM No. ${formNo}<br>(Revised 22 Nov. 2024)</div>
    <div class="c"><b>BOY SCOUTS OF THE PHILIPPINES</b><div>181 Natividad Almeda-Lopez Street, Ermita, Manila 1000</div></div>
    <div class="r">${office}</div></div>`;
}

const PRIVACY = `<div class="p-small">The Boy Scouts of the Philippines adheres to the general rules and principles of RA 10173, also known as the Data Privacy Act of 2012. By filling-out and affixing your signature to this form, you consent to collecting and using data such as your photo, video, and personal information. Rest assured that your information will be treated with the utmost respect and confidentiality.</div>
<div class="p-small"><i>(Sumusunod ang Boy Scouts of the Philippines sa mga pangkalahatang tuntunin at prinsipyo ng RA 10173, na kilala rin bilang Data Privacy Act of 2012. Sa pagsagot at pagpirma sa form na ito, pumapayag kang makolekta at gumamit ang iyong data tulad ng iyong larawan, video, at personal na impormasyon. Makatitiyak na ang iyong impormasyon ay ituturing naming may lubos na paggalang at kumpidensyal.)</i></div>
<div class="p-small">If you disagree with using your data, you may contact us at our email (bsp@scouts.gov.ph) or number ((632) 8572 8317 to 19).</div>
<div class="p-small"><i>(Kapag ikaw ay hindi-sang-ayon na gamitin ang iyong data, ipagbigay alam sa amin sa pamamagitan ng email sa bsp@scouts.gov.ph o tumawag sa numero ng telopno sa (632) 8572 8317 to 19).</i></div>`;

function scoutRow(label, s, ref, cls = '') {
  return `<tr class="${cls}"><td>${label} ${s ? h(fullName(s)) : ''}</td><td class="c">${s ? h(s.status) : ''}</td><td class="c">${s ? ageOn(s.birthdate, ref) : ''}</td>
    <td class="c">${s ? h(s.sex) : ''}</td><td class="c">${s ? h(s.cardNo) : ''}</td><td class="c">${s ? h(s.rank) : ''}</td><td class="c">${s ? h(s.years) : ''}</td></tr>`;
}
const rosterHead = `<thead><tr><th style="width:38%">ROSTER OF SCOUT MEMBERSHIP<br>Surname, Given Name, M.I.</th><th>Registration<br>Status</th><th>Age</th><th>Sex</th><th>Membership<br>Card No.</th><th>Highest Rank<br>Earned</th><th>Number of years<br>in Scouting</th></tr></thead>`;

function printAUR(u) {
  const r = R(), ref = u.dateApplied || todayISO(), L = u.leaders || {}, p = u.payment || {};
  const officers = OFFICERS.map(o => ({ o, s: u.scouts.find(x => x.position === o.key) }));
  const members = sortedScouts(u).filter(x => !OFFICERS.some(o => o.key === x.position));
  const first = members.slice(0, MEMBERS_PER_FIRST_PAGE);
  const rest = members.slice(MEMBERS_PER_FIRST_PAGE);
  const scoutAmt = u.scouts.length * r.scout;

  let memberRows = '';
  for (let i = 0; i < MEMBERS_PER_FIRST_PAGE; i++) memberRows += scoutRow(`${(i % 8) + 1}.`, first[i], ref, i > 0 && i % 8 === 0 ? 'blk' : '');

  let html = `<div class="pg">
    ${formHead('6-01', 'NO/RO/LC/SI')}
    <div class="p-title" style="display:flex;justify-content:space-between"><span></span><span>APPLICATION FOR UNIT REGISTRATION (AUR)</span><span style="font-weight:400;font-size:9pt">AUR No. <u>&nbsp;${h(u.aurNo) || '&nbsp;'.repeat(16)}&nbsp;</u></span></div>
    <div class="p-line"><span class="lb">Sponsoring Institution:</span><span class="u" style="flex:2.6">${h(u.sponsor)}</span>
      <span class="lb">Unit No.:</span><span class="u" style="flex:.7">${h(u.unitNo)}</span>
      <span class="lb">Local Council:</span><span class="u" style="flex:2">${h(u.council)}</span></div>
    <div class="p-line"><span class="lb">Unit: ${UNIT_TYPES.map(t => `${cb(u.unitType === t)} ${t}`).join('&nbsp; ')}</span>
      <span style="flex:1"></span><span class="lb">Nature: ${NATURES.map(n => `${cb(u.nature === n)} ${n}`).join('&nbsp; ')}</span></div>
    <div class="p-line"><span class="lb">Date Applied:</span><span class="u" style="flex:0 0 2.6in">${fmtDate(u.dateApplied)}</span></div>

    <table class="grid-t" style="margin-top:6px">
      <thead><tr><th style="width:26%">Position</th><th style="width:36%">ADULT LEADERS<br>PRINT: Surname, Given Name, M.I.</th><th style="width:18%">Signature</th><th rowspan="5" style="font-weight:400;font-size:8pt;background:#fff">NOTE: All Adult Leaders must register using the Application for Adult Registration Form (AAR)</th></tr></thead>
      <tbody>
        <tr><td>Institutional Scouting Representative</td><td>${h(L.isr)}</td><td></td></tr>
        <tr><td>Unit Leader</td><td>${h(L.ul)}</td><td></td></tr>
        <tr><td>Asst. Unit Leader for Program</td><td>${h(L.aulProgram)}</td><td></td></tr>
        <tr><td>Asst. Unit Leader for Administration</td><td>${h(L.aulAdmin)}</td><td></td></tr>
      </tbody>
    </table>
    <div style="margin:4px 0;font-size:9pt"><b>Registration Status:</b> N – New &nbsp;&nbsp; RR – Reregistering</div>

    <table class="grid-t">${rosterHead}<tbody>
      ${officers.map(({ o, s }) => scoutRow(`${o.label.toUpperCase()}:`, s, ref)).join('')}
      ${memberRows.replace('<tr class="">', '<tr class="blk">')}
    </tbody></table>

    <div class="p-fees">
      <div class="box">
        <h4>REGISTRATION FEES</h4>
        <table style="font-size:9pt"><tr><td></td><td style="text-align:center"><b>RATE</b></td><td style="text-align:center"><b>AMOUNT</b></td></tr>
          <tr><td>Total Number of Scouts: <u>&nbsp;${u.scouts.length}&nbsp;</u></td><td style="text-align:center">${num(r.scout)}</td><td style="text-align:right"><u>${num(scoutAmt)}</u></td></tr>
        </table>
        <div style="margin-top:6px"><b>TOTAL Fees Remitted &nbsp;P <u>&nbsp;${num(scoutAmt)}&nbsp;</u></b></div>
        <div style="margin-top:6px">Paid Under OR. No.: <u>&nbsp;${h(unitOrNumber(u)) || '&nbsp;'.repeat(18)}&nbsp;</u> Date: <u>&nbsp;${fmtShort(p.datePaid) || '&nbsp;'.repeat(14)}&nbsp;</u></div>
        <div style="margin-top:6px">Expiration Date: <u>&nbsp;${fmtDate(u.expiration) || '&nbsp;'.repeat(30)}&nbsp;</u></div>
      </div>
      <div class="box" style="font-size:9pt">
        <h4>LOCAL COUNCIL OFFICE ACTION</h4>
        <div>Processed: ________________________ Date: __________</div>
        <div style="padding-left:80px;font-size:8pt">Registration Officer</div>
        <div style="margin-top:6px">Approved: ________________________ Date: __________</div>
        <div style="padding-left:80px;font-size:8pt">Council Scout Executive</div>
        <h4 style="margin-top:8px">REGIONAL OFFICE ACTION</h4>
        <div>Checked: _________________________ Date: __________</div>
        <div style="padding-left:80px;font-size:8pt">Registration Officer</div>
      </div>
    </div>
    ${PRIVACY}
  </div>`;

  for (let i = 0; i < rest.length; i += MEMBERS_PER_EXTRA_PAGE) {
    const chunk = rest.slice(i, i + MEMBERS_PER_EXTRA_PAGE);
    html += `<div class="pg">
      ${formHead('6-01', 'NO/RO/LC/SI')}
      <div class="p-title">APPLICATION FOR UNIT REGISTRATION (AUR) — ROSTER CONTINUATION</div>
      <div class="p-line"><span class="lb">Sponsoring Institution:</span><span class="u" style="flex:3">${h(u.sponsor)}</span>
        <span class="lb">${h(u.unitType || 'Unit')} No.:</span><span class="u">${h(u.unitNo)}</span></div>
      <table class="grid-t" style="margin-top:6px">${rosterHead}<tbody>
        ${chunk.map((s, j) => scoutRow(`${MEMBERS_PER_FIRST_PAGE + i + j + 1}.`, s, ref)).join('')}
      </tbody></table>
    </div>`;
  }
  doPrint(html);
}

function printAAR(a) {
  const r = R(), p = a.payment || {}, cat = adultCat(a);
  const rolesA = ADULT_ROLES.filter(x => x.group === 'A'), rolesB = ADULT_ROLES.filter(x => x.group === 'B');
  const lu = (val, label, flex = 1) => `<div class="lbl-under" style="flex:${flex}"><span class="u">${h(val)}</span><small>${label}</small></div>`;

  doPrint(`<div class="pg">
    ${formHead('6-03', 'RO/LC/SI')}
    <div class="p-title" style="display:flex;justify-content:space-between;align-items:center">
      <span style="width:1.4in"></span><span>APPLICATION FOR ADULT REGISTRATION</span>
      <span style="font-size:9pt;font-weight:400;width:1.4in;text-align:right">No. <u>&nbsp;${h(a.aarNo) || '&nbsp;'.repeat(14)}&nbsp;</u><br>AAR</span></div>

    <div class="p-line" style="margin-top:12px"><span class="lb">Name:</span>
      ${lu(a.surname, 'Surname', 2)}${lu([a.first, a.ext].filter(Boolean).join(' '), 'First Name', 2)}${lu(mi(a.mi) ? mi(a.mi) + '.' : '', 'M.I', .5)}
      <span class="lb">Sex:</span><span class="u" style="flex:.7">${h(a.sex)}</span>
      <span class="lb">Civil Status:</span><span class="u" style="flex:.9">${h(a.civil)}</span></div>
    <div class="p-line" style="margin-top:10px"><span class="lb">Tenure in Scouting:</span><span class="u">${h(a.tenure)}</span>
      <span class="lb">Membership Card No.:</span><span class="u">${h(a.cardNo)}</span>
      <span class="lb">Expiration Date:</span><span class="u">${fmtShort(a.expiration)}</span></div>

    <div style="margin-top:12px">To serve as (<i>Please check one</i>):</div>
    <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:6px">
      <div><b>A. Unit Leaders:</b>${rolesA.map(x => `<div style="padding:3px 0 3px 22px">${cb(a.role === x.key)} ${h(x.label)}</div>`).join('')}</div>
      <div><div style="display:flex;justify-content:space-between"><b>B. Lay Leaders:</b><span>Unit No. <u>&nbsp;${h(a.unitNo) || '&nbsp;'.repeat(12)}&nbsp;</u></span></div>
        ${rolesB.map(x => `<div style="padding:3px 0 3px 22px">${cb(a.role === x.key)} ${h(x.label)}</div>`).join('')}</div>
    </div>

    <div class="p-line" style="margin-top:12px">${lu(a.sponsor, 'Sponsoring Institution', 3)}${lu(a.council, 'Council', 1.4)}</div>
    <div class="p-line" style="margin-top:10px"><span class="lb">Date of Birth:</span><span class="u">${fmtDate(a.birthdate)}</span>
      <span class="lb">Place of Birth:</span><span class="u" style="flex:1.4">${h(a.birthplace)}</span>
      <span class="lb">Religion:</span><span class="u" style="flex:.8">${h(a.religion)}</span></div>
    <div class="p-line" style="margin-top:8px"><span class="lb">Profession/Occupation:</span><span class="u">${h(a.occupation)}</span>
      <span class="lb">Position/Title:</span><span class="u">${h(a.position)}</span></div>

    <div style="text-align:center;font-weight:700;margin-top:16px">SAFE FROM HARM</div>
    <div style="text-align:justify;font-size:9.5pt;margin-top:4px">World Scouting emphasizes that the achievement of Scouting’s Mission makes it essential for the Movement to provide young people with a “safe passage” based on respect for their integrity and their right to develop in a non- constraining environment. The Boy Scouts of the Philippines implements “Safe from Harm” on the conviction that all adults and children have a right NOT to be abused. This is a fundamental human right. Abuse can take the form of bullying, physical abuse, emotional abuse, neglect, sexual abuse and exploitation. It is important to note that young people can suffer from one or a combination of these forms of abuse. Abuse can take place at home, at school or anywhere young people spend time. In the great majority of cases, the abuser is someone the young person knows, such as a parent, teacher, relative, leader or friend. The main objective is to ensure that no one will be exposed to abuse. Good child protection practice means making sure that everyone is aware of signs of potential abuse. It is based upon the Declaration on the Rights of the Child and Human Rights.</div>
    <div style="text-align:justify;font-size:9.5pt;margin-top:8px">I hereby commit and fully subscribe to the existing Safe From Harm Policy of the Boy Scouts of the Philippines, and that I hereby absolve and free the BSP from any liability arising from any of my acts contrary to the policy. I hereby accept that the BSP may immediately revoke my registration as an adult leader upon violation of such policy.</div>
    <div class="sig" style="margin-top:30px"><div class="name">${h(fullNameFwd(a))}</div><div class="line" style="width:45%">Signature Over Printed Name</div></div>

    <div class="p-fees" style="margin-top:16px">
      <div class="box">
        <h4>REGISTRATION FEES</h4>
        <table style="font-size:9.5pt"><tr><td><i>Please check one:</i></td><td style="text-align:center"><b>RATE</b></td></tr>
          <tr><td>${cb(cat === 'teacher')} UL/AUL</td><td style="text-align:center">${num(r.teacher)}</td></tr>
          <tr><td>${cb(cat === 'lay')} Lay Leaders/Local Council Staff</td><td style="text-align:center">${num(r.lay)}</td></tr>
        </table>
        <div style="margin-top:8px"><b>AMOUNT PAID</b> &nbsp;<u>&nbsp;${paidOf(a) ? num(paidOf(a)) : '&nbsp;'.repeat(20)}&nbsp;</u></div>
        <div style="margin-top:8px">Paid Under OR. No. <u>&nbsp;${h(orNumber(a)) || '&nbsp;'.repeat(18)}&nbsp;</u> Date <u>&nbsp;${fmtShort(p.datePaid) || '&nbsp;'.repeat(14)}&nbsp;</u></div>
      </div>
      <div class="box" style="font-size:9pt">
        <h4>LOCAL COUNCIL OFFICE ACTION</h4>
        <div>Processed: ________________________ Date: __________</div>
        <div style="padding-left:80px;font-size:8pt">Registration Officer</div>
        <div style="margin-top:6px">Approved: ________________________ Date: __________</div>
        <div style="padding-left:80px;font-size:8pt">Council Scout Executive</div>
        <h4 style="margin-top:8px">REGIONAL OFFICE ACTION</h4>
        <div>Approved: ________________________ Date: __________</div>
        <div style="padding-left:80px;font-size:8pt">Youth Development Officer V</div>
      </div>
    </div>
    <div style="margin-top:10px">${PRIVACY}</div>
  </div>`);
}

const signBlock = () => `<div class="sig rsig"><div class="name">${h(db.settings.signName) || '&nbsp;'}</div>
  ${(db.settings.signPosition || '').split('\n').filter(Boolean).map(l => `<div class="pos">${h(l)}</div>`).join('')}</div>`;

// receipts: compact, 4 per long-bond page (the .rcpt box matches the pre-cut receipt paper; keep its size)
function printReceipts(list, options = {}) {
  // a receipt stamps the registration payment, the camp payment, or both when they share one receipt number
  const slots = rec => [rec.payment, rec.camp].filter(p => p && Number(p.amountPaid || 0) > 0 && p.receiptNo);
  const records = [...db.units.flatMap(unit => unit.scouts), ...db.adults].filter(rec =>
    slots(rec).length && list.some(receipt => receipt.paid > 0 && receipt.receiptNo &&
      (receipt.recordId ? receipt.recordId === rec.id : slots(rec).some(p => p.receiptNo === receipt.receiptNo))));
  const one = ({ receiptNo, date, from, address, items, paid, registrationRef, orNo, note }) => {
    const total = items.reduce((n, i) => n + i.qty * i.rate, 0);
    const refs = [orNo && `OR No.: <b>${h(orNo)}</b>`, registrationRef && `Website ref.: <b>${h(registrationRef)}</b>`, note && h(note)].filter(Boolean);
    return `<div class="rcpt">
      <div class="rtop">
        <div><b>BOY SCOUTS OF THE PHILIPPINES</b><div class="small">${h(db.settings.council || '181 Natividad Almeda-Lopez Street, Ermita, Manila 1000')}</div></div>
        <div class="rno">No. <b>${h(receiptNo)}</b><div class="small">${fmtDate(date)}</div></div>
      </div>
      <div class="t">ACKNOWLEDGMENT RECEIPT</div>
      ${refs.length ? `<div class="rrefs">${refs.join(' &nbsp;·&nbsp; ')}</div>` : ''}
      <div class="p-line"><span class="lb">Received from:</span><span class="u">${h(from)}</span></div>
      <div class="p-line"><span class="lb">School / Unit:</span><span class="u">${h(address)}</span></div>
      <table class="items">
        <thead><tr><th>Particulars</th><th class="n">Amount</th></tr></thead>
        <tbody>${items.map(i => `<tr><td>${h(i.desc)}${i.detail ? ` <span class="det">${h(i.detail)}</span>` : ''}</td><td class="n">${num(i.qty * i.rate)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>AMOUNT RECEIVED</td><td class="n">${peso(paid)}</td></tr>
          ${paid < total ? `<tr><td>Balance</td><td class="n">${peso(total - paid)}</td></tr>` : ''}</tfoot>
      </table>
      <div class="rbottom"><div class="words">${toWords(paid)}</div>${signBlock()}</div>
    </div>`;
  };
  let html = '';
  for (let i = 0; i < list.length; i += 4)
    html += `<div class="pg">${list.slice(i, i + 4).map(one).join('<div class="cut"></div>')}</div>`;
  doPrint(html, { onPrinted: () => {
    const now = new Date().toISOString();
    const changed = [];
    for (const rec of records) {
      for (const p of slots(rec)) {
        if (list.some(receipt => receipt.receiptNo === p.receiptNo || receipt.paymentReceiptNos?.includes(p.receiptNo)) && !p.receiptPrintedAt) {
          p.receiptPrintedAt = now;
          changed.push(p);
        }
      }
    }
    if (changed.length && !save()) {
      changed.forEach(p => { delete p.receiptPrintedAt; });
      throw new Error('Print submitted, but the printing time could not be saved. Check disk access before closing this preview.');
    }
    options.onPrinted?.();
  } });
}

const campItem = rate => ({ desc: `${campName()} fee`, detail: `(${[campDateLabel(), campVenue()].filter(Boolean).join(', ')})`, qty: 1, rate });
const scoutAddress = u => [u.sponsor, u.unitType || u.unitNo ? unitLabel(u) : ''].filter(Boolean).join(' — ');

// registration receipt; includes the camp fee when both were paid together on the same receipt
function scoutReceipt(u, s) {
  const p = s.payment || {}, withCamp = campShared(s);
  return { recordId: s.id, receiptNo: p.receiptNo, orNo: orNumber(s) || u.payment?.orNo || '', registrationRef: websiteRef(s), date: p.datePaid || todayISO(), from: fullNameFwd(s),
    address: scoutAddress(u),
    items: [{ desc: 'Scout registration fee', qty: 1, rate: R().scout }, ...(withCamp ? [campItem(campPaidOf(s))] : [])],
    paid: paidOf(s) + (withCamp ? campPaidOf(s) : 0) };
}

// camp-only receipt, for a camp fee paid separately from the registration
function campReceipt(u, s) {
  const c = s.camp || {};
  return { kind: 'camp', recordId: s.id, receiptNo: c.receiptNo, registrationRef: websiteRef(s), date: c.datePaid || todayISO(), from: fullNameFwd(s),
    address: scoutAddress(u),
    note: paidOf(s) > 0 && s.payment?.receiptNo ? `Registration paid under ${s.payment.receiptNo}` : 'Camping fee only',
    items: [campItem(campPaidOf(s))], paid: campPaidOf(s) };
}

// every receipt of a unit's learners, in receipt-number order
const unitReceipts = u => [
  ...paidScouts(u).map(s => scoutReceipt(u, s)),
  ...u.scouts.filter(s => campPaidOf(s) > 0 && !campShared(s)).map(s => campReceipt(u, s)),
].sort((a, b) => a.receiptNo.localeCompare(b.receiptNo));

const learnerReceipt = (u, s) => campShared(s) ? scoutReceipt(u, s) : campReceipt(u, s);
function reprintLearner(u, s) {
  const receipt = paidOf(s) > 0 ? scoutReceipt(u, s) : learnerReceipt(u, s);
  if (paidOf(s) > 0 && campPaidOf(s) > 0 && !campShared(s)) {
    receipt.items.push(campItem(campPaidOf(s)));
    receipt.paid += campPaidOf(s);
    receipt.note = `Camping fee paid under ${s.camp.receiptNo} (${fmtDate(s.camp.datePaid)})`;
    receipt.paymentReceiptNos = [s.payment.receiptNo, s.camp.receiptNo];
  }
  rerender();
  printReceipts([receipt]);
}

function receiptForAdult(a, options = {}) {
  const p = a.payment || {}, cat = adultCat(a);
  printReceipts([{ recordId: a.id, receiptNo: p.receiptNo, orNo: orNumber(a), registrationRef: websiteRef(a), date: p.datePaid || todayISO(), from: fullNameFwd(a),
    address: (a.sponsor || '') + (a.unitNo ? ` — Unit No. ${a.unitNo}` : ''),
    items: [{ desc: `Adult registration fee — ${cat === 'lay' ? 'Lay Leader' : 'UL/AUL'}`, qty: 1, rate: adultFee(a) }], paid: paidOf(a) }], options);
}

function markScoutPaid(s, withCamp = false) {
  s.payment = { ...(s.payment || {}), orNo: orNumber(s), amountPaid: Number(R().scout), datePaid: todayISO() };
  issueReceiptIfNeeded(s);
  if (withCamp && !campPaidOf(s)) payCamp(s, s.payment.receiptNo);
}

// a learner on the open roster, or on the unit named by data-unit (Online tab)
function findScout(d) {
  const u = getUnit(d.unit || route.id);
  return { u, s: u?.scouts.find(x => x.id === d.id) };
}
const rerender = () => { render(); if (route.view === 'unit') document.getElementById('roster')?.scrollIntoView(); };

/* ---------------------------------------------- learner lists by section */
/* Registration and camp lists, grouped by BSP scout section (KID, Kab, Boy Scout) and grade level. */

const SECTION_ORDER = ['KID Scouts', 'Kab Scouts', 'Boy Scouts', 'SNED', 'Other'];
const sectionOf = level => ({ 'KID Scout': 'KID Scouts', 'Kab Scout': 'Kab Scouts', 'Boy Scout': 'Boy Scouts' }[scoutSection(level)] || (level === 'SNED' ? 'SNED' : 'Other'));
const sectionGrades = { 'KID Scouts': 'Kinder', 'Kab Scouts': 'Grades 1–3', 'Boy Scouts': 'Grades 4–6' };

const LIST_KINDS = {
  registration: {
    title: () => 'List of Registered Learners', pick: () => true,
    paid: s => paidOf(s), receipt: s => s.payment?.receiptNo || '', feeLabel: 'Reg. fee',
  },
  camp: {
    title: () => `List of Learners Registered for the ${campName()}`, pick: campIn,
    paid: s => campPaidOf(s), receipt: s => s.camp?.receiptNo || '', feeLabel: 'Camp fee',
  },
};

// [{ section, grades: [{ grade, list: [{ s, u, section }], paidCount, paid }] }] in section → grade → class section → name order
function learnersBySection(kind) {
  const K = LIST_KINDS[kind], byGrade = {};
  for (const u of db.units) for (const s of u.scouts.filter(K.pick)) {
    const g = gradeParts(s.grade);
    (byGrade[g.level] ||= []).push({ s, u, section: g.section });
  }
  const grades = Object.entries(byGrade).sort(([a], [b]) => gradeRank(a) - gradeRank(b) || a.localeCompare(b)).map(([grade, list]) => ({
    grade, list: list.sort((a, b) => a.section.localeCompare(b.section) || fullName(a.s).localeCompare(fullName(b.s))),
    paidCount: list.filter(x => K.paid(x.s) > 0).length, paid: list.reduce((n, x) => n + K.paid(x.s), 0),
  }));
  return SECTION_ORDER.map(section => ({ section, grades: grades.filter(g => sectionOf(g.grade) === section) })).filter(x => x.grades.length);
}
const sectionLearners = sec => sec.grades.flatMap(g => g.list);

// per-section counts for the summary cards: [{ section, total, paidCount, paid }]
const sectionCounts = kind => learnersBySection(kind).map(sec => {
  const list = sectionLearners(sec), K = LIST_KINDS[kind];
  return { section: sec.section, total: list.length, paidCount: list.filter(x => K.paid(x.s) > 0).length, paid: list.reduce((n, x) => n + K.paid(x.s), 0) };
});

function printLearnerList(kind) {
  const K = LIST_KINDS[kind], sections = learnersBySection(kind), all = sections.flatMap(sectionLearners);
  const sexCount = (list, sx) => list.filter(x => x.s.sex === sx).length;
  const paidCount = list => list.filter(x => K.paid(x.s) > 0).length, paidSum = list => list.reduce((n, x) => n + K.paid(x.s), 0);
  const countCells = (list, money = num) => `<td class="n">${sexCount(list, 'M')}</td><td class="n">${sexCount(list, 'F')}</td><td class="n">${list.length}</td><td class="n">${paidCount(list)}</td><td class="n">${list.length - paidCount(list)}</td><td class="n">${money(paidSum(list))}</td>`;
  const sub = kind === 'camp' ? `Date: ${h(campDateLabel())}${campVenue() ? ` · Venue: ${h(campVenue())}` : ''}` : h(db.settings.defaultSponsor);
  doPrint(`<div class="pg">
    <div class="p-head" style="grid-template-columns:1fr 3fr 1fr"><div></div>
      <div class="c"><b>BOY SCOUTS OF THE PHILIPPINES</b><div>${h(db.settings.council || db.settings.defaultSponsor)}</div></div><div class="r">As of ${fmtDate(todayISO())}</div></div>
    <div class="p-title" style="margin-bottom:2px">${h(K.title().toUpperCase())}</div>
    <div style="text-align:center;font-size:9pt;margin-bottom:10px">${sub}</div>
    <table class="sum-t" style="margin-bottom:12px">
      <thead><tr><th>Scout section</th><th>Grade level</th><th>Male</th><th>Female</th><th>Total</th><th>Paid</th><th>Unpaid</th><th>Collected</th></tr></thead>
      <tbody>${sections.map(sec => sec.grades.map((g, i) => `<tr>${i ? '' : `<td rowspan="${sec.grades.length + 1}"><b>${h(sec.section)}</b></td>`}<td>${h(g.grade)}</td>${countCells(g.list)}</tr>`).join('')
        + `<tr class="sub"><td><b>Subtotal</b></td>${countCells(sectionLearners(sec))}</tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">TOTAL</td>${countCells(all, peso)}</tr></tfoot>
    </table>
    ${sections.map(sec => `<div class="list-section">${h(sec.section.toUpperCase())}${sectionGrades[sec.section] ? ` <span>(${sectionGrades[sec.section]})</span>` : ''} <span>· ${sectionLearners(sec).length} learner${sectionLearners(sec).length === 1 ? '' : 's'}</span></div>
      ${sec.grades.map(g => `<table class="sum-t camp-t">${[4, 27, 6, 6, 12, 18, 12, 15].map(w => `<col style="width:${w}%">`).join('')}
      <thead><tr><th colspan="8" class="camp-grade">${h(g.grade.toUpperCase())} <span>(${g.list.length})</span></th></tr>
        <tr><th>#</th><th>Name (Surname, Given Name, M.I.)</th><th>Sex</th><th>Age</th><th>Section</th><th>Parent / guardian</th><th>Contact no.</th><th>${K.feeLabel}</th></tr></thead>
      <tbody>${g.list.map(({ s, section }, i) => `<tr><td class="n">${i + 1}</td><td>${h(fullName(s))}</td><td style="text-align:center">${h(s.sex)}</td><td class="n">${ageOn(s.birthdate)}</td>
        <td>${h(section)}</td><td>${h(s.guardian)}</td><td>${h(s.contact)}</td>
        <td>${K.paid(s) > 0 ? `Paid · ${h(K.receipt(s))}` : 'Unpaid'}</td></tr>`).join('')}</tbody>
    </table>`).join('')}`).join('')}
    <div style="display:flex;justify-content:space-between;margin-top:40px;break-inside:avoid">
      <div style="width:2.8in"><div style="font-size:9pt">Prepared by:</div>${signBlock()}</div>
      <div style="width:2.8in"><div style="font-size:9pt">Noted by:</div><div class="sig rsig"><div class="name">&nbsp;</div><div class="pos">&nbsp;</div></div></div>
    </div>
  </div>`);
}

// workbook: a summary sheet, then one sheet per scout section (Kab Scouts, Boy Scouts, ...) listing each grade level
function xlsxLearnerList(kind) {
  const K = LIST_KINDS[kind], sections = learnersBySection(kind), all = sections.flatMap(sectionLearners);
  const title = K.title(), subtitle = `${kind === 'camp' ? `Date: ${campDateLabel()}${campVenue() ? ` · Venue: ${campVenue()}` : ''}` : db.settings.defaultSponsor} · As of ${fmtDate(todayISO())}`;
  const head = ['Grade Level', '#', 'Surname', 'Given Name', 'M.I.', 'Sex', 'Age', 'Section', 'Status', 'Sponsoring Institution', 'Unit', 'Parent / Guardian', 'Contact No.',
    `${K.feeLabel} Paid`, `${K.feeLabel} Status`, 'Receipt No.', kind === 'camp' ? 'Registration Receipt No.' : 'Joined Camp'];
  const widths = [11, 5, 18, 22, 6, 6, 6, 14, 8, 34, 14, 26, 15, 12, 14, 14, 20];
  const line = (g, { s, u, section }, i) => [g.grade, i + 1, s.surname, fullNameFwd({ given: s.given, ext: s.ext }), mi(s.mi), s.sex, ageOn(s.birthdate), section, s.status === 'RR' ? 'RR' : 'N', u.sponsor, unitLabel(u), s.guardian, s.contact,
    K.paid(s) || '', K.paid(s) > 0 ? 'Paid' : 'Unpaid', K.receipt(s), kind === 'camp' ? (paidOf(s) > 0 ? s.payment.receiptNo : '') : (campJoined(s) && campEligible(s) ? 'Yes' : '')];
  const counts = (list, a, b) => [a, b, list.filter(x => x.s.sex === 'M').length, list.filter(x => x.s.sex === 'F').length, list.length,
    list.filter(x => K.paid(x.s) > 0).length, list.filter(x => !K.paid(x.s)).length, list.reduce((n, x) => n + K.paid(x.s), 0)];
  downloadXlsx(`bsp-${kind}-list-${todayISO()}.xlsx`, [
    { name: 'Summary', title, subtitle, widths: [14, 14, 8, 8, 8, 8, 8, 12], money: [7],
      rows: [['Scout Section', 'Grade Level', 'Male', 'Female', 'Total', 'Paid', 'Unpaid', 'Collected'],
        ...sections.flatMap(sec => [...sec.grades.map(g => counts(g.list, sec.section, g.grade)), counts(sectionLearners(sec), sec.section, 'Subtotal')]),
        counts(all, 'TOTAL', '')] },
    ...sections.map(sec => ({ name: sec.section, title: `${title} — ${sec.section}${sectionGrades[sec.section] ? ` (${sectionGrades[sec.section]})` : ''}`, subtitle, widths, money: [13],
      rows: [head, ...sec.grades.flatMap(g => g.list.map((x, i) => line(g, x, i)))] })),
  ]);
}

function printSummary() {
  const r = R(), { rows, t, camp } = computeSummary();
  doPrint(`<div class="pg">
    <div class="p-head" style="grid-template-columns:1fr 3fr 1fr"><div></div>
      <div class="c"><b>BOY SCOUTS OF THE PHILIPPINES</b><div>${h(db.settings.council)}</div></div><div class="r">As of ${fmtDate(todayISO())}</div></div>
    <div class="p-title">SUMMARY OF REGISTRATION FEES</div>
    <table class="sum-t" style="margin-bottom:14px">
      <thead><tr><th>Category</th><th>Count</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>${FEE_LABELS.scout}</td><td class="n">${t.scouts}</td><td class="n">${num(r.scout)}</td><td class="n">${num(t.scoutAmt)}</td></tr>
        <tr><td>${FEE_LABELS.teacher}</td><td class="n">${t.teachers}</td><td class="n">${num(r.teacher)}</td><td class="n">${num(t.teacherAmt)}</td></tr>
        <tr><td>${FEE_LABELS.lay}</td><td class="n">${t.lay}</td><td class="n">${num(r.lay)}</td><td class="n">${num(t.layAmt)}</td></tr>
      </tbody>
      <tfoot><tr><td>TOTAL</td><td class="n">${t.scouts + t.teachers + t.lay}</td><td></td><td class="n">${peso(t.total)}</td></tr>
        <tr><td colspan="3">Collected</td><td class="n">${peso(t.paid)}</td></tr>
        <tr><td colspan="3">Balance</td><td class="n">${peso(t.total - t.paid)}</td></tr></tfoot>
    </table>
    <table class="sum-t">
      <thead><tr><th>#</th><th>Sponsoring Institution</th><th>Units</th><th>Scouts</th><th>Teachers</th><th>Heads/Coord.</th><th>Total Due</th><th>Paid</th><th>Balance</th></tr></thead>
      <tbody>${rows.map((s, i) => `<tr><td>${i + 1}</td><td>${h(s.name)}</td><td class="n">${s.units}</td><td class="n">${s.scouts}</td><td class="n">${s.teachers}</td><td class="n">${s.lay}</td><td class="n">${num(s.total)}</td><td class="n">${num(s.paid)}</td><td class="n">${num(s.total - s.paid)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td>TOTAL</td><td class="n">${t.units}</td><td class="n">${t.scouts}</td><td class="n">${t.teachers}</td><td class="n">${t.lay}</td><td class="n">${num(t.total)}</td><td class="n">${num(t.paid)}</td><td class="n">${num(t.total - t.paid)}</td></tr></tfoot>
    </table>
    ${camp.joined ? `<table class="sum-t" style="margin-top:14px">
      <thead><tr><th>${h(campName())} — ${h(campDateLabel())}</th><th>Learners</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody><tr><td>Joined the camp</td><td class="n">${camp.joined}</td><td class="n">${num(campFee())}</td><td class="n">${num(camp.due)}</td></tr></tbody>
      <tfoot><tr><td colspan="3">Collected (${camp.paidCount})</td><td class="n">${peso(camp.paid)}</td></tr>
        <tr><td colspan="3">Balance</td><td class="n">${peso(camp.due - camp.paid)}</td></tr></tfoot>
    </table>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:50px">
      <div style="width:2.8in"><div style="font-size:9pt">Prepared by:</div>${signBlock()}</div>
      <div style="width:2.8in"><div style="font-size:9pt">Noted by:</div><div class="sig rsig"><div class="name">&nbsp;</div><div class="pos">&nbsp;</div></div></div>
    </div>
  </div>`);
}

/* ------------------------------------------------------------------- CSV */

async function download(name, text, type = 'text/csv') {
  const filters = type === 'text/csv' ? [{ name: 'CSV (Excel)', extensions: ['csv'] }] : [{ name: 'Backup', extensions: ['json'] }];
  const saved = await window.bsp.saveFile(name, type === 'text/csv' ? '﻿' + text : text, filters);
  if (saved) toast('Saved to ' + saved);
}
const csv = rows => rows.map(r => r.map(v => { v = String(v ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')).join('\r\n');

/* Minimal .xlsx writer (no dependencies): sheets = [{ name, rows, widths?, title? }].
   The first row of each sheet (after the optional title) is a bold header; numbers stay numeric. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF], u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)];
    const local = new Uint8Array([...u32(0x04034B50), ...common, ...nameBytes]);
    parts.push(local, data);
    central.push(new Uint8Array([...u32(0x02014B50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes]));
    offset += local.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0), count = central.length;
  const end = new Uint8Array([...u32(0x06054B50), ...u16(0), ...u16(0), ...u16(count), ...u16(count), ...u32(size), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

function xlsx(sheets) {
  const x = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const col = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const cell = (v, ref, style) => typeof v === 'number' && Number.isFinite(v)
    ? `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`
    : `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  const used = new Set();
  const names = sheets.map(s => { // Excel sheet names: max 31 chars, no []:*?/\ and unique
    let n = s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet', base = n, i = 2;
    while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} (${i++})`;
    used.add(n.toLowerCase()); return n;
  });
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${x(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    // style 1 = bold header with fill and border, style 2 = bold title, style 3 = peso amount
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDE8D5"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  };
  sheets.forEach((s, i) => {
    const pre = s.title ? [[s.title], ...(s.subtitle ? [[s.subtitle]] : []), []] : [];
    const header = pre.length, rows = [...pre, ...s.rows], money = new Set(s.money || []);
    const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => v === '' || v == null ? '' :
      cell(v, col(ci) + (ri + 1), ri === header ? 1 : s.title && ri === 0 ? 2 : ri > header && money.has(ci) && typeof v === 'number' ? 3 : 0)).join('')}</row>`).join('');
    const widths = (s.widths || []).map((w, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${w}" customWidth="1"/>`).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${header + 1}" topLeftCell="A${header + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${widths ? `<cols>${widths}</cols>` : ''}<sheetData>${body}</sheetData>${s.rows.length > 1 ? `<autoFilter ref="A${header + 1}:${col(s.rows[0].length - 1)}${rows.length}"/>` : ''}<pageSetup orientation="landscape"/></worksheet>`;
  });
  return zipStore(files);
}

async function downloadXlsx(name, sheets) {
  const bytes = xlsx(sheets);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const saved = await window.bsp.saveFile(name, btoa(bin), [{ name: 'Excel workbook', extensions: ['xlsx'] }], 'base64');
  if (saved) toast('Saved to ' + saved);
}

/* ================================================================ EVENTS */

const deletingOnlinePaid = new Set();

const actions = {
  toggleUnpaidCampers: () => { showUnpaidCampers = !showUnpaidCampers; render({ preserveScroll: true }); },
  publishWebsiteFees: () => {
    try { websiteFeePayload(); } catch (err) { alert(err.message); return; }
    const wasPending = db.settings.websiteFeesPending;
    db.settings.websiteFeesPending = true;
    if (!save()) { db.settings.websiteFeesPending = wasPending; return; }
    render({ preserveScroll: true });
    toast(online.email ? 'Publishing current fees to website' : 'Fees ready to publish. Sign in on the Online tab.');
  },
  nav: d => { listFilter = ''; go(d.view); },
  newUnit: () => go('unit'),
  openUnit: d => go('unit', d.id),
  delUnit: d => {
    const u = getUnit(d.id);
    if (!confirm(`Delete ${unitLabel(u)}${u.sponsor ? ` (${u.sponsor})` : ''} and its ${u.scouts.length} scout(s)?`)) return;
    db.units = db.units.filter(x => x.id !== d.id); save(); render(); toast('Unit deleted');
  },
  printAUR: d => {
    const u = getUnit(d.id), miss = unitMissing(u);
    if (miss.length && !confirm(`This unit is still missing: ${miss.join(', ')}.

Print the AUR form anyway?`)) return;
    printAUR(u);
  },
  receiptsUnit: d => printReceipts(unitReceipts(getUnit(d.id))),
  payScout: d => {
    const s = getUnit(route.id).scouts.find(x => x.id === d.id);
    if (d.camp && !campFee()) return alert('Set the camping fee in Settings first.');
    if (d.camp && !campEligible(s)) return alert('SNED learners are not included in the camp.');
    markScoutPaid(s, !!d.camp); save(); render(); document.getElementById('roster').scrollIntoView();
    toast(`${fullName(s)} paid${d.camp ? ' registration + camp' : ''} · Receipt ${s.payment.receiptNo}`);
  },
  unpayScout: d => {
    const s = getUnit(route.id).scouts.find(x => x.id === d.id), shared = campShared(s);
    if (!confirm(`Undo the payment of ${fullName(s)}? (Receipt ${s.payment.receiptNo} will be voided${shared ? ', including the camping fee on it' : ''}.)`)) return;
    if (shared) delete s.camp; // the camp fee on this receipt is reverted too
    s.payment = { orNo: orNumber(s) }; save(); render(); document.getElementById('roster').scrollIntoView(); toast('Payment undone');
  },
  campJoin: d => {
    const { s } = findScout(d);
    if (!campEligible(s)) return alert('SNED learners are not included in the camp.');
    s.camp = { ...(s.camp || {}), joined: true }; save(); rerender(); toast(`${fullName(s)} joined the ${campName()}`);
  },
  campLeave: d => {
    const { s } = findScout(d);
    if (!confirm(`Remove ${fullName(s)} from the ${campName()}?`)) return;
    delete s.camp; save(); rerender(); toast('Removed from camp');
  },
  // records the camp fee on its own receipt and prints a camp-only receipt
  campPay: d => {
    const { u, s } = findScout(d);
    if (!campEligible(s)) return alert('SNED learners are not included in the camp.');
    if (!campFee()) return alert('Set the camping fee in Settings first.');
    if (campPaidOf(s) > 0) return rerender();
    // The payment is recorded only after the receipt is sent to the printer; cancelling the preview records nothing.
    const before = s.camp, counter = db.settings.nextReceipt;
    payCamp(s);
    const pending = s.camp, receipt = campReceipt(u, s);
    s.camp = before;
    const reservationKey = `${db.settings.schoolYear}:${s.id}`;
    let reservation;
    if (window.bsp.cloudStart) {
      db.receiptReservations = db.receiptReservations || {};
      const existing = db.receiptReservations[reservationKey];
      if (existing) { pending.receiptNo = existing.receiptNo; receipt.receiptNo = existing.receiptNo; db.settings.nextReceipt = counter; }
      reservation = { receiptNo: pending.receiptNo, schoolYear: db.settings.schoolYear };
      db.receiptReservations[reservationKey] = reservation;
      // Reserve before printing so another app cannot issue this number while the preview is open.
      if (!save()) { if (!existing) delete db.receiptReservations[reservationKey]; db.settings.nextReceipt = counter; return; }
    } else db.settings.nextReceipt = counter;
    printReceipts([receipt], { onPrinted: () => {
      const taken = [...db.units.flatMap(x => x.scouts), ...db.adults].some(r => r.payment?.receiptNo === pending.receiptNo || r.camp?.receiptNo === pending.receiptNo);
      if (campPaidOf(s) > 0) return rerender(); // already paid from another screen
      if (taken) throw new Error(`Receipt ${pending.receiptNo} was used by another payment. Close this preview and click Pay camp again.`);
      const prev = s.camp, prevCounter = db.settings.nextReceipt;
      s.camp = { ...pending, receiptPrintedAt: new Date().toISOString() };
      if (reservation) delete db.receiptReservations[reservationKey];
      db.settings.nextReceipt = Math.max(Number(prevCounter) || 1, Number(pending.receiptNo.slice(db.settings.receiptPrefix.length)) + 1 || 1);
      if (!save()) { s.camp = prev; db.settings.nextReceipt = prevCounter; if (reservation) db.receiptReservations[reservationKey] = reservation; throw new Error('Printed, but the camp payment could not be confirmed. Load the latest Supabase records before retrying.'); }
      rerender(); toast(`Camp fee paid · Receipt ${pending.receiptNo}`);
    } });
  },
  campUnpay: d => {
    const { s } = findScout(d);
    if (campShared(s)) {
      if (!confirm(`Remove the camping fee from receipt ${s.camp.receiptNo} of ${fullName(s)}? The registration stays paid; reprint the receipt for a corrected copy.`)) return;
      const prev = s.camp; delete s.camp;
      if (!save()) { s.camp = prev; return alert('The camp payment could not be undone because the data could not be saved.'); }
      return rerender(), toast('Camping fee removed from the receipt');
    }
    const { receiptNo, receiptPrintedAt } = s.camp;
    if (!confirm(`Undo the camping fee of ${fullName(s)}? (Receipt ${receiptNo} will be voided and the learner removed from the camp.)`)) return;
    delete s.camp;
    // a never-printed receipt that was the latest number is given back, so the numbering has no gap
    const n = Number(receiptNo.slice(db.settings.receiptPrefix.length));
    const reused = !receiptPrintedAt && receiptNo.startsWith(db.settings.receiptPrefix) && n + 1 === Number(db.settings.nextReceipt);
    if (reused) db.settings.nextReceipt = n;
    save(); rerender(); toast(`Camp payment reverted${reused ? ` · ${receiptNo} will be reused` : ''}`);
  },
  campReceipt: d => { const { u, s } = findScout(d); printReceipts([learnerReceipt(u, s)]); },
  receiptScout: d => { const u = getUnit(route.id); reprintLearner(u, u.scouts.find(x => x.id === d.id)); },
  payAllScouts: () => {
    const u = getUnit(route.id), unpaid = sortedScouts(u).filter(s => !paidOf(s));
    if (!confirm(`Mark ${unpaid.length} scout(s) as paid today (${peso(unpaid.length * R().scout)})? Each gets its own receipt number.`)) return;
    unpaid.forEach(s => markScoutPaid(s)); save(); render(); toast(`${unpaid.length} scout(s) marked paid`);
  },
  editScout: d => { editingScoutId = d.id; render(); document.getElementById('roster').scrollIntoView(); },
  // jumps here from the Online tab, where the scout's unit isn't the current route yet
  editOnlineScout: d => { route = { view: 'unit', id: d.unit }; editingScoutId = d.id; render(); document.getElementById('roster').scrollIntoView(); },
  useArchivedScout: d => {
    const archived = archivedScout(d.year, d.id), form = document.getElementById('scoutForm');
    if (!archived || !form) return;
    if (archived.mi) form.elements.mi.value = archived.mi;
    if (archived.ext) form.elements.ext.value = archived.ext;
    if (archived.sex) form.elements.sex.value = archived.sex;
    if (archived.cardNo) form.elements.cardNo.value = archived.cardNo;
    if (archived.rank) form.elements.rank.value = archived.rank;
    if (archived.years !== '' && archived.years != null) form.elements.years.value = archived.years;
    if (archived.guardian) form.elements.guardian.value = archived.guardian;
    if (archived.contact) form.elements.contact.value = archived.contact;
    form.elements.status.value = 'RR';
    document.getElementById('onlineMatchHint').hidden = true;
    toast(`Filled in ${fullNameFwd(archived)}'s previous details`);
  },
  cancelScout: () => { editingScoutId = null; render(); document.getElementById('roster').scrollIntoView(); },
  delScout: d => {
    const u = getUnit(route.id), s = u.scouts.find(x => x.id === d.id);
    if (!confirm(`Remove ${fullName(s)} from the roster?`)) return;
    u.scouts = u.scouts.filter(x => x.id !== d.id);
    if (editingScoutId === d.id) editingScoutId = null;
    save(); render(); document.getElementById('roster').scrollIntoView(); toast('Scout removed');
  },
  newAdult: () => go('adult'),
  openAdult: d => go('adult', d.id),
  delAdult: d => {
    const a = getAdult(d.id);
    if (!confirm(`Delete ${fullName(a)}?`)) return;
    db.adults = db.adults.filter(x => x.id !== d.id); save(); render(); toast('Adult deleted');
  },
  printAAR: d => printAAR(getAdult(d.id)),
  receiptAdult: d => receiptForAdult(getAdult(d.id)),
  fillFullAdult: () => {
    const f = document.getElementById('adultForm'), role = (f.querySelector('[name=role]:checked') || {}).value;
    if (!role) return toast('Choose what this adult will serve as first');
    f.elements.amountPaid.value = adultFee({ role }); if (!f.elements.datePaid.value) f.elements.datePaid.value = todayISO();
  },
  printSummary: () => printSummary(),
  printList: d => printLearnerList(d.kind),
  xlsxList: d => xlsxLearnerList(d.kind),
  onlineRefresh: () => onlineRefresh(),
  onlineSignOut: async () => { await window.bsp.sbSignOut(); onlineRefreshPending = false; online = { ...online, email: null, rows: null, loading: false, error: '', liveError: '', syncError: '' }; render(); },
  onlineKind: d => { online.kind = d.kind; render(); },
  onlinePaymentStatus: d => { online.paymentStatus = d.status; render(); },
  onlinePay: d => onlineTake(d.id, true),
  onlineAdd: d => onlineTake(d.id, false),
  onlineReject: async d => {
    const r = online.rows.find(x => x.id === d.id);
    if (!confirm(`Reject the registration of ${r.given_name} ${r.surname}? It will be removed from this list.`)) return;
    if (await setOnlineStatus(r, 'rejected')) {
      if (db.campIntents[r.id]) { delete db.campIntents[r.id]; save(); }
      render(); toast('Registration rejected');
    }
  },
  deleteOnlinePaid: async d => {
    if (deletingOnlinePaid.has(d.id)) return;
    const unit = d.unit ? getUnit(d.unit) : null;
    const rec = unit ? unit.scouts.find(scout => scout.id === d.id) : getAdult(d.id);
    if (!rec || !confirm(`Delete ${fullName(rec)}${rec.payment?.receiptNo ? ` and payment ${rec.payment.receiptNo}` : ''}? This removes the registration from the local roster and rejects the online submission.`)) return;
    deletingOnlinePaid.add(d.id);
    try {
      const snapshot = JSON.stringify(db);
      if (unit) unit.scouts = unit.scouts.filter(scout => scout.id !== rec.id);
      else db.adults = db.adults.filter(adult => adult.id !== rec.id);
      if (!window.bsp.save(JSON.stringify(db))) {
        db = JSON.parse(snapshot); alert('Could not save deletion. The registration was kept.'); return;
      }
      try {
        const response = await window.bsp.sbRest(sbCfg(), 'PATCH', `bsp_registrations?id=eq.${encodeURIComponent(rec.onlineId)}`,
          { status: 'rejected', imported_at: null, ...(unit ? { ar_no: null, receipt_printed_at: null } : {}) });
        if (response.error || !response.data?.length) throw new Error(response.error || 'Online record was not updated.');
      } catch (err) {
        // Preserve other edits made while the website request was in flight.
        if (unit) {
          const currentUnit = getUnit(unit.id);
          if (currentUnit && !currentUnit.scouts.some(scout => scout.id === rec.id)) currentUnit.scouts.push(rec);
        } else if (!getAdult(rec.id)) db.adults.push(rec);
        if (!window.bsp.save(JSON.stringify(db))) alert('Could not restore the local registration to disk.');
        alert(`Deletion failed: ${err.message}`); render(); return;
      }
      online.rows = (online.rows || []).filter(row => row.id !== rec.onlineId);
      render(); toast(rec.payment?.receiptNo ? 'Registration and payment deleted' : 'Registration deleted');
    } finally { deletingOnlinePaid.delete(d.id); }
  },
  reprintScout: d => { const u = getUnit(d.unit); reprintLearner(u, u.scouts.find(x => x.id === d.id)); },
  csvSummary: () => {
    const { rows, t } = computeSummary();
    download(`bsp-summary-${todayISO()}.csv`, csv([
      ['Sponsoring Institution', 'Units', 'Scouts', 'Teachers', 'Heads/Coordinators', 'Total Due', 'Paid', 'Balance'],
      ...rows.map(s => [s.name, s.units, s.scouts, s.teachers, s.lay, s.total, s.paid, s.total - s.paid]),
      ['TOTAL', t.units, t.scouts, t.teachers, t.lay, t.total, t.paid, t.total - t.paid],
    ]));
  },
  csvMaster: () => {
    const rows = [['Type', 'Sponsoring Institution', 'Unit', 'Unit No.', 'Surname', 'Given Name', 'M.I.', 'Position / Role', 'Status', 'Birthdate', 'Age', 'Sex', 'Membership Card No.', 'Highest Rank', 'Years in Scouting', 'Fee', 'Receipt No.', 'OR No.', 'Website Reference', 'Registration Source', 'Camp', 'Camp Fee Paid', 'Camp Receipt No.']];
    for (const u of db.units) for (const s of sortedScouts(u)) rows.push(['Scout', u.sponsor, u.unitType, u.unitNo, s.surname, [s.given, s.ext].filter(Boolean).join(' '), s.mi,
      (OFFICERS.find(o => o.key === s.position) || { label: 'Member' }).label, s.status, s.birthdate, ageOn(s.birthdate, u.dateApplied), s.sex, s.cardNo, s.rank, s.years, R().scout, s.payment?.receiptNo, orNumber(s) || u.payment?.orNo, websiteRef(s), registrationSource(s),
      campJoined(s) ? 'Yes' : '', campPaidOf(s) || '', s.camp?.receiptNo || '']);
    for (const a of db.adults) rows.push([adultCat(a) === 'lay' ? 'Head/Coordinator' : 'Teacher', a.sponsor, '', a.unitNo, a.surname, [a.first, a.ext].filter(Boolean).join(' '), a.mi,
      roleOf(a.role)?.label, '', a.birthdate, ageOn(a.birthdate), a.sex, a.cardNo, '', a.tenure, adultFee(a), a.payment?.receiptNo, orNumber(a), websiteRef(a), registrationSource(a)]);
    download(`bsp-masterlist-${todayISO()}.csv`, csv(rows));
  },
  importJSON: async () => {
    const text = await window.bsp.openFile([{ name: 'Backup', extensions: ['json'] }]);
    if (!text) return;
    try {
      const d = JSON.parse(text);
      if (!d || !Array.isArray(d.units) || !Array.isArray(d.adults)
        || d.units.some(u => !u || !Array.isArray(u.scouts) || u.scouts.some(s => !s || typeof s !== 'object' || Array.isArray(s)))
        || d.adults.some(a => !a || typeof a !== 'object' || Array.isArray(a))
        || (d.settings != null && (typeof d.settings !== 'object' || Array.isArray(d.settings)))) throw new Error('Not a BSP backup file');
      if (!confirm(`Replace current data with this backup (${d.units.length} units, ${d.adults.length} adults)?`)) return;
      if (!window.bsp.save(JSON.stringify(d))) throw new Error('Could not save backup to disk. Current data was kept.');
      db = load(); syncedLearnerReceipts.clear(); render(); void syncLearnerReceipts(); toast('Backup imported');
    } catch (err) { alert('Could not import: ' + err.message); }
  },
  exportJSON: () => download(`bsp-backup-${todayISO()}.json`, JSON.stringify(db, null, 2), 'application/json'),
  startNewSchoolYear: () => {
    const current = db.settings.schoolYear || String(new Date().getFullYear());
    const scoutCount = db.units.reduce((n, u) => n + u.scouts.length, 0);
    const suggested = String((Number(current) || new Date().getFullYear()) + 1);
    const next = prompt(`Archive SY ${current} (${db.units.length} unit(s), ${scoutCount} scout(s), ${db.adults.length} adult(s)) and start a new school year?\n\nThe active roster will be cleared and the receipt counter restarts at 1. Archived learners stay searchable for reregistration.\n\nEnter the new school year:`, suggested);
    if (!next || !next.trim() || next.trim() === current) return;
    const year = next.trim();
    const snapshot = JSON.stringify(db);
    db.archives[current] = { units: db.units, adults: db.adults, archivedAt: new Date().toISOString() };
    db.units = []; db.adults = []; db.campIntents = {};
    db.settings.schoolYear = year; db.settings.nextReceipt = 1; db.settings.websiteFeesPending = true;
    if (!save()) { db = JSON.parse(snapshot); alert('Could not save. The school year was not changed.'); return; }
    render(); toast(`SY ${current} archived. Now registering for SY ${year}.`);
  },
  resetAll: () => {
    if (!confirm('Erase ALL units, scouts, adults and payments from this browser? Export a backup first if unsure.')) return;
    if (prompt('Type ERASE to confirm') !== 'ERASE') return;
    db = JSON.parse(JSON.stringify(DEFAULTS)); save(); render(); toast('All data erased');
  },
};

const forms = {
  unitForm(f) {
    const v = Object.fromEntries(new FormData(f));
    let u = route.id ? getUnit(route.id) : null;
    const isNew = !u;
    if (isNew) { u = { id: uid(), scouts: [], payment: {} }; db.units.push(u); }
    Object.assign(u, {
      sponsor: v.sponsor.trim(), unitNo: v.unitNo.trim(), council: v.council.trim(), unitType: v.unitType || '', nature: v.nature || '',
      dateApplied: v.dateApplied, aurNo: v.aurNo.trim(),
      leaders: { isr: v.l_isr.trim(), ul: v.l_ul.trim(), aulProgram: v.l_aulProgram.trim(), aulAdmin: v.l_aulAdmin.trim() },
    });
    save();
    if (isNew) { route.id = u.id; render(); document.getElementById('roster').scrollIntoView(); toast('Unit saved. Now add the scouts.'); }
    else { render(); toast('Unit details saved'); }
  },
  scoutForm(f) {
    const v = Object.fromEntries(new FormData(f));
    if (!v.sex) return toast('Please select the sex');
    const u = getUnit(route.id);
    const data = { surname: v.surname.trim(), given: v.given.trim(), ext: nameExt(v.ext), mi: mi(v.mi), position: v.position, status: v.status || 'N',
      birthdate: v.birthdate, sex: v.sex, cardNo: v.cardNo.trim(), rank: v.rank.trim(), years: v.years, grade: v.grade.trim(), guardian: v.guardian.trim(), contact: v.contact.trim() };
    if (!editingScoutId) {
      const match = matchingOnlineScout(data.surname, data.given);
      if (match && !localByOnlineId(match.id)
        && !confirm(`${fullName(data)} already submitted an online registration awaiting payment. Add as a separate local scout anyway? (Importing it from the Online tab instead keeps the website payment linked.)`)) return;
    }
    const dup = u.scouts.find(x => x.id !== editingScoutId && fullName(x).toLowerCase() === fullName(data).toLowerCase());
    if (dup && !confirm(`${fullName(data)} is already on this roster. Add anyway?`)) return;
    if (editingScoutId) { Object.assign(u.scouts.find(x => x.id === editingScoutId), data); toast('Scout updated'); }
    else {
      const sc = { id: uid(), ...data, payment: {} };
      const joinCamp = !!v.joinCamp && campEligible(sc);
      if (v.joinCamp && !joinCamp) alert('SNED learners are not included in the camp. The learner was added without camp.');
      if (joinCamp) sc.camp = { joined: true };
      if (v.paidNow) markScoutPaid(sc, !!(joinCamp && v.campPaidNow && campFee()));
      u.scouts.push(sc); toast(`${fullName(data)} added${joinCamp ? ' + camp' : ''}${v.paidNow ? ` · Receipt ${sc.payment.receiptNo}` : ''}`);
    }
    editingScoutId = null; save(); render();
    document.getElementById('roster').scrollIntoView();
    document.querySelector('#scoutForm [name=surname]').focus();
  },
  unitPayForm(f) {
    const v = Object.fromEntries(new FormData(f)), u = getUnit(route.id);
    const submittedOr = v.orNo.trim();
    const orNo = !u.payment?.orNo && submittedOr === unitOrNumber(u) ? '' : submittedOr;
    u.payment = { ...u.payment, datePaid: v.datePaid, orNo };
    u.expiration = v.expiration;
    save(); render(); toast('Saved');
  },
  adultForm(f) {
    const v = Object.fromEntries(new FormData(f));
    if (!v.role) return toast('Please choose what this adult will serve as (A or B)');
    let a = route.id ? getAdult(route.id) : null;
    if (!a) { a = { id: uid(), payment: {} }; db.adults.push(a); route.id = a.id; }
    Object.assign(a, {
      surname: v.surname.trim(), first: v.first.trim(), ext: nameExt(v.ext), mi: mi(v.mi), sex: v.sex || '', civil: v.civil, religion: v.religion.trim(),
      birthdate: v.birthdate, birthplace: v.birthplace.trim(), occupation: v.occupation.trim(), position: v.position.trim(),
      tenure: v.tenure.trim(), cardNo: v.cardNo.trim(), expiration: v.expiration, role: v.role, unitNo: v.unitNo.trim(),
      sponsor: v.sponsor.trim(), council: v.council.trim(), aarNo: v.aarNo.trim(),
      contact: v.contact.trim(), email: v.email.trim(),
    });
    a.payment = { ...a.payment, amountPaid: v.amountPaid === '' ? '' : Number(v.amountPaid), datePaid: v.datePaid, orNo: v.orNo.trim() };
    issueReceiptIfNeeded(a); save(); render(); toast('Adult saved');
  },
  async onlineSignIn(f) {
    const v = Object.fromEntries(new FormData(f));
    online.error = ''; online.loading = true; render();
    const res = await window.bsp.sbSignIn(sbCfg(), v.email.trim(), v.password);
    online.loading = false;
    if (res.error) { online.error = res.error; render(); return; }
    online.email = res.email;
    await connectSharedWorkspace();
    startOnlineLive(); onlineRefresh();
  },
  onlineSettingsForm(f) {
    const v = Object.fromEntries(new FormData(f));
    Object.assign(db.settings, { supabaseUrl: v.supabaseUrl.trim(), supabaseKey: v.supabaseKey.trim(), defaultSponsor: v.defaultSponsor.trim() });
    if (online.email) startOnlineLive();
    save(); render(); toast('Saved');
  },
  settingsForm(f) {
    const v = Object.fromEntries(new FormData(f)), s = db.settings;
    const previousSettings = JSON.stringify(s);
    const rates = { scout: Number(v.r_scout), teacher: Number(v.r_teacher), lay: Number(v.r_lay), camp: Number(v.r_camp) };
    try { websiteFeePayload({ ...s, rates }); } catch (err) { alert(err.message); return; }
    Object.assign(s, { council: v.council.trim(), signName: v.signName.trim(), signPosition: v.signPosition.trim(), receiptPrefix: v.receiptPrefix, nextReceipt: Math.max(1, parseInt(v.nextReceipt) || 1),
      schoolYear: v.schoolYear.trim() || s.schoolYear,
      campName: v.campName.trim() || 'Boy Scout Camping', campDate: v.campDate.trim(), campVenue: v.campVenue.trim() });
    s.rates = rates;
    s.websiteFeesPending = true;
    if (!save()) { db.settings = JSON.parse(previousSettings); render(); return; }
    render(); toast('Settings saved');
  },
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled && actions[b.dataset.act]) { e.preventDefault(); actions[b.dataset.act](b.dataset, e); }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  if (forms[e.target.id]) forms[e.target.id](e.target);
});

// Ctrl+F jumps to the page's search box (Electron has no built-in find bar)
document.addEventListener('keydown', e => {
  const box = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && document.querySelector('[data-filter]');
  if (box) { e.preventDefault(); box.focus(); box.select(); }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('[data-filter]')) {
    listFilter = t.value; render({ preserveScroll: true });
  }
  if (t.name === 'birthdate') {
    const ref = route.view === 'unit' ? (getUnit(route.id)?.dateApplied || todayISO()) : null;
    const a = ageOn(t.value, ref);
    const pill = document.getElementById('agePill');
    if (pill) pill.textContent = a === '' ? '—' : a;
  }
  if (t.name === 'surname' || t.name === 'given') {
    const form = t.closest('#scoutForm'), hint = document.getElementById('onlineMatchHint');
    if (form && hint) {
      const match = matchingOnlineScout(form.elements.surname.value, form.elements.given.value);
      if (match) {
        const name = fullNameFwd({ surname: match.surname, given: match.given_name, mi: match.middle_initial });
        const imported = localByOnlineId(match.id);
        hint.hidden = false;
        hint.innerHTML = imported
          ? `<b>${h(name)}</b> is already registered via the website and imported${imported._unit ? ` into ${h(unitLabel(imported._unit))}` : ''}. <button class="btn sm" type="button" data-act="editOnlineScout" data-unit="${imported._unit?.id || ''}" data-id="${imported.id}">Open their record</button> instead of adding a duplicate.`
          : `<b>${h(name)}</b> already submitted an online registration awaiting payment. <button class="btn sm" type="button" data-act="nav" data-view="online">Open Online tab</button> to record payment instead of adding manually.`;
      } else {
        const archived = matchingArchivedScout(form.elements.surname.value, form.elements.given.value);
        hint.hidden = !archived;
        hint.innerHTML = !archived ? '' : `<b>${h(fullNameFwd(archived.scout))}</b> was registered in SY ${h(archived.year)}. <button class="btn sm" type="button" data-act="useArchivedScout" data-year="${h(archived.year)}" data-id="${h(archived.scout.id)}">Use their previous details</button>`;
      }
    }
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-camp-for]')) {
    online.campChoices = online.campChoices || {};
    online.campChoices[t.dataset.campFor] = t.checked;
  }
  // "include camp fee" is offered only when the learner joins the camp and pays now
  const campForm = t.closest('#scoutForm');
  if (campForm && ['joinCamp', 'paidNow'].includes(t.name)) {
    const pay = campForm.querySelector('[data-camp-pay]'), show = campForm.elements.joinCamp.checked && campForm.elements.paidNow.checked;
    pay.hidden = !show; campForm.elements.campPaidNow.disabled = !show;
    if (show && !campForm.elements.campPaidNow.dataset.touched) campForm.elements.campPaidNow.checked = true;
  }
  if (t.name === 'campPaidNow') t.dataset.touched = '1';
  if (t.name === 'role' && route.view === 'adult') {
    const cat = adultCat({ role: t.value });
    document.getElementById('adultFee').textContent = `${peso(R()[cat])} — ${cat === 'lay' ? 'Lay Leaders / Local Council Staff' : 'UL/AUL'}`;
  }
});

render();
onlineInit();
document.getElementById('appVersion').textContent = 'v' + window.bsp.appVersion();
