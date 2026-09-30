/*
  Fictional demo data: "Riverside House" (Alex, Jordan, Sam).
  No real names, providers or numbers. Every bill is computed the way the app
  does it: split by days lived there, percentages for rent, instalments for
  council rates, accrual by month for the charts.
*/
(function () {
  const HU = (window.HU = window.HU || {});
  const TODAY = '2026-09-29';

  /* ---------- dates ---------- */
  const D = (s) => new Date(s + 'T00:00:00Z');
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => {
    const d = D(s);
    d.setUTCDate(d.getUTCDate() + n);
    return iso(d);
  };
  const diff = (a, b) => Math.round((D(b) - D(a)) / 86400000);
  const monthEnd = (y, m) => iso(new Date(Date.UTC(y, m, 0)));
  const mm = (n) => String(n).padStart(2, '0');

  /* ---------- formatting (en-AU, AUD) ---------- */
  const cur = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
  const curWhole = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  });
  const num = new Intl.NumberFormat('en-AU');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const fmt = {
    money: (minor, whole) => (whole ? curWhole : cur).format(Math.round(minor) / 100),
    moneyParts(minor) {
      const s = cur.format(Math.round(minor) / 100);
      const i = s.lastIndexOf('.');
      return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i)];
    },
    num: (n) => num.format(n),
    date(s, withYear) {
      const d = D(s);
      const y = d.getUTCFullYear();
      const show = withYear === true || (withYear !== false && y !== 2026);
      return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${show ? ' ' + y : ''}`;
    },
    day: (s) => DAY[D(s).getUTCDay()],
    mon: (s) => MON[D(s).getUTCMonth()],
    month: (s) => MONTH[D(s).getUTCMonth()],
    monthYear: (s) => `${MONTH[D(s).getUTCMonth()]} ${D(s).getUTCFullYear()}`,
    range(from, to) {
      const a = D(from);
      const b = D(to);
      const wholeMonths = a.getUTCDate() === 1 && to === monthEnd(b.getUTCFullYear(), b.getUTCMonth() + 1);
      const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
      if (wholeMonths) {
        const ay = sameYear ? '' : ' ' + a.getUTCFullYear();
        const by = b.getUTCFullYear() === 2026 && sameYear ? '' : ' ' + b.getUTCFullYear();
        if (a.getUTCMonth() === b.getUTCMonth() && sameYear) return MONTH[a.getUTCMonth()] + by;
        return `${MON[a.getUTCMonth()]}${ay} – ${MON[b.getUTCMonth()]}${by}`;
      }
      return `${fmt.date(from, !sameYear)} – ${fmt.date(to, !sameYear ? true : undefined)}`;
    },
    rel(s) {
      const n = diff(TODAY, s);
      if (n === 0) return 'Today';
      if (n === 1) return 'Tomorrow';
      if (n === -1) return 'Yesterday';
      if (n > 1 && n < 14) return `In ${n} days`;
      if (n < -1 && n > -30) return `${-n} days ago`;
      return fmt.date(s);
    },
    days: (from, to) => diff(from, to) + 1,
    pct: (x) => `${Math.round(Math.abs(x) * 100)}%`,
  };

  /* ---------- household states the studio can show ---------- */
  HU.scenarios = [
    { id: 'demo', name: 'Riverside House', note: 'The full demo: three people and a year of bills.', flags: {} },
    { id: 'fresh', name: 'Brand new', note: 'Just set up: no bills yet, Jordan and Sam invited but not joined.', flags: { fresh: true } },
    { id: 'single', name: 'Doesn’t split', note: 'Three people, but nothing is split, like the Smith Household.', flags: { split: false } },
    { id: 'nopostcode', name: 'No postcode', note: 'As the demo, but without a postcode, so no weather.', flags: { postcode: false } },
    { id: 'solo', name: 'Just me', note: 'One person on their own.', flags: { solo: true, split: false } },
    { id: 'busy', name: 'Lots of services', note: 'Thirteen services, long provider names.', flags: { busy: true } },
  ];

  function build(sc) {
  const split = sc.split !== false;

  /* ---------- people ---------- */
  const members = [
    { id: 'alex', name: 'Alex', role: 'Admin', you: true, from: '2025-02-01', colour: ['#2a78d6', '#3987e5'], pay: [['PayID', 'alex@example.com']] },
    { id: 'jordan', name: 'Jordan', role: 'Member', from: '2025-02-01', colour: ['#1baf7a', '#199e70'], pay: [['PayID', '0400 000 000']] },
    { id: 'sam', name: 'Sam', role: 'Member', from: '2026-08-01', colour: ['#e87ba4', '#d55181'], pay: [['BSB / account', '000-000 · 1234 5678']] },
  ];
  if (sc.solo) members.splice(1);
  if (sc.fresh) members.slice(1).forEach((m) => (m.invited = true));
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));

  /* ---------- services ---------- */
  const services = [
    { id: 'rent', name: 'Rent', type: 'Rent', icon: 'home', provider: 'Harbour Lane Realty', short: 'Harbour Lane', cadence: 'Monthly', colour: ['#4a3aa7', '#9085e9'], payer: 'alex', split: { mode: 'percent', pct: { alex: 40, jordan: 30, sam: 30 } } },
    { id: 'power', name: 'Electricity', type: 'Electricity', icon: 'bolt', provider: 'Northwind Energy', short: 'Northwind', cadence: 'Quarterly', colour: ['#eda100', '#c98500'], payer: 'jordan', split: { mode: 'even' }, unit: 'kWh', limit: 600, seasonal: true },
    { id: 'gas', name: 'Gas', type: 'Gas', icon: 'flame', provider: 'Hearthline Gas', short: 'Hearthline', cadence: 'Every 2 months', colour: ['#eb6834', '#d95926'], payer: 'jordan', split: { mode: 'even' }, unit: 'MJ', seasonal: true },
    { id: 'water', name: 'Water', type: 'Water', icon: 'drop', provider: 'Riverbend Water', short: 'Riverbend', cadence: 'Quarterly', colour: ['#1baf7a', '#199e70'], payer: 'alex', split: { mode: 'even' }, unit: 'kL' },
    { id: 'net', name: 'Internet', type: 'Internet', icon: 'wifi', provider: 'Brightline Broadband', short: 'Brightline', cadence: 'Monthly', colour: ['#2a78d6', '#3987e5'], payer: 'alex', split: { mode: 'even' } },
    { id: 'rates', name: 'Council rates', type: 'Council rates', icon: 'landmark', provider: 'City of Riverside', short: 'the council', cadence: 'Yearly', colour: ['#4f8a3a', '#6fae57'], payer: 'alex', split: { mode: 'even' } },
    { id: 'rego', name: 'Car rego', type: 'Vehicle registration', icon: 'car', provider: 'Transport Registry', short: 'Transport Registry', cadence: 'Yearly', colour: ['#e87ba4', '#d55181'], payer: 'alex', owner: 'alex', split: { mode: 'even' } },
  ];
  if (sc.busy) {
    const longer = { power: 'Northwind Energy Retail Services', gas: 'Hearthline Gas & Energy Solutions', water: 'Riverbend Regional Water Corporation', net: 'Brightline Broadband & Home Phone', rent: 'Harbour Lane Realty Property Management', rates: 'City of Riverside Rates & Valuations' };
    services.forEach((s) => longer[s.id] && (s.provider = longer[s.id]));
    const pal = [['#2a78d6', '#3987e5'], ['#eb6834', '#d95926'], ['#1baf7a', '#199e70'], ['#eda100', '#c98500'], ['#e87ba4', '#d55181'], ['#008300', '#2f9e44'], ['#4a3aa7', '#9085e9'], ['#e34948', '#e66767']];
    [
      ['phone', 'Mobile phones', 'Phone', 'phone', 'Southern Cross Mobile & Home Phone Services', 'Southern Cross', 'Monthly', 'jordan'],
      ['health', 'Health insurance', 'Health insurance', 'shield', 'Coastline Health Insurance Fund Limited', 'Coastline', 'Monthly', 'alex'],
      ['contents', 'Contents insurance', 'Contents insurance', 'shield', 'Keystone Home & Contents Insurance', 'Keystone', 'Yearly', 'alex'],
      ['ambulance', 'Ambulance cover', 'Ambulance cover', 'alert', 'State Ambulance Membership Scheme', 'State Ambulance', 'Yearly', 'alex'],
      ['garden', 'Gardening', 'Gardening', 'sun', 'Evergreen Garden & Lawn Care Company', 'Evergreen', 'Monthly', 'jordan'],
      ['cleaning', 'Cleaning', 'Cleaning', 'home', 'Tidy Nest Home Cleaning Services', 'Tidy Nest', 'Every 2 weeks', 'sam'],
    ].forEach(([id, name, type, icon, provider, short, cadence, payer], i) =>
      services.push({ id, name, type, icon, provider, short, cadence, colour: pal[(i + 1) % 8], payer, split: { mode: 'even' } }),
    );
  }
  if (sc.fresh) services.length = 0;
  if (sc.solo) services.forEach((s) => (s.payer = 'alex'));
  const serviceById = Object.fromEntries(services.map((s) => [s.id, s]));

  /* ---------- bills ---------- */
  const bills = [];
  const B = (o) => {
    bills.push(o);
    return o;
  };

  // Rent and internet: monthly, Oct 2025 → Oct 2026.
  for (let i = 0; i < 13; i++) {
    const y = 2025 + Math.floor((9 + i) / 12);
    const m = ((9 + i) % 12) + 1;
    const from = `${y}-${mm(m)}-01`;
    const to = monthEnd(y, m);
    B({
      id: `rent-${y}-${mm(m)}`, service: 'rent', from, to, issued: addDays(from, -7), due: from,
      amount: 229667, invoice: `HL-RIV-${y}${mm(m)}`, paid: from < TODAY ? addDays(from, -1) : null,
      entry: 'manual',
    });
    const netDue = `${y}-${mm(m)}-04`;
    B({
      id: `net-${y}-${mm(m)}`, service: 'net', from, to, issued: addDays(from, -4), due: netDue,
      amount: from >= '2026-07-01' ? 8900 : 8500, invoice: `BB-88213-${y}${mm(m)}`,
      paid: netDue < TODAY ? addDays(netDue, -1) : null,
    });
  }

  // Electricity: quarterly.
  [
    ['2025-q3', '2025-06-01', '2025-08-31', '2025-09-06', '2025-09-26', 46290, 1602],
    ['2025-q4', '2025-09-01', '2025-11-30', '2025-12-06', '2025-12-28', 41255, 1455],
    ['2026-q1', '2025-12-01', '2026-02-28', '2026-03-07', '2026-03-27', 39812, 1398],
    ['2026-q2', '2026-03-01', '2026-05-31', '2026-06-06', '2026-06-26', 44170, 1512],
    ['2026-q3', '2026-06-01', '2026-08-31', '2026-09-08', '2026-09-30', 48621, 1684],
  ].forEach(([k, from, to, issued, due, amount, usage]) =>
    B({
      id: `power-${k}`, service: 'power', from, to, issued, due, amount, usage,
      invoice: `NW-4471-${issued.slice(0, 7).replace('-', '')}`,
      paid: due < TODAY ? addDays(due, -4) : null,
    }),
  );

  // Gas: every two months.
  [
    ['2025-07', '2025-07-01', '2025-08-31', '2025-09-04', '2025-09-25', 24120, 7760],
    ['2025-09', '2025-09-01', '2025-10-31', '2025-11-04', '2025-11-25', 14280, 4120],
    ['2025-11', '2025-11-01', '2025-12-31', '2026-01-06', '2026-01-27', 9640, 2310],
    ['2026-01', '2026-01-01', '2026-02-28', '2026-03-04', '2026-03-25', 8820, 1980],
    ['2026-03', '2026-03-01', '2026-04-30', '2026-05-05', '2026-05-26', 12135, 3050],
    ['2026-05', '2026-05-01', '2026-06-30', '2026-07-03', '2026-07-24', 25410, 7860],
    ['2026-07', '2026-07-01', '2026-08-31', '2026-09-03', '2026-09-24', 31844, 10240],
  ].forEach(([k, from, to, issued, due, amount, usage]) =>
    B({
      id: `gas-${k}`, service: 'gas', from, to, issued, due, amount, usage,
      invoice: `HG-20-5531-${issued.slice(2, 7).replace('-', '')}`,
      paid: k === '2026-07' ? '2026-09-20' : due < TODAY ? addDays(due, -3) : null,
    }),
  );

  // Water: quarterly.
  [
    ['2025-q3', '2025-07-01', '2025-09-30', '2025-10-12', '2025-11-03', 26810, 35],
    ['2025-q4', '2025-10-01', '2025-12-31', '2026-01-12', '2026-02-02', 27940, 38],
    ['2026-q1', '2026-01-01', '2026-03-31', '2026-04-12', '2026-05-04', 30112, 44],
    ['2026-q2', '2026-04-01', '2026-06-30', '2026-07-12', '2026-08-03', 28735, 36],
  ].forEach(([k, from, to, issued, due, amount, usage]) =>
    B({
      id: `water-${k}`, service: 'water', from, to, issued, due, amount, usage,
      invoice: `RW-100482-${issued.slice(0, 7).replace('-', '')}`, paid: addDays(due, -6),
    }),
  );

  // Council rates: yearly notices paid by instalments.
  B({
    id: 'rates-2025', service: 'rates', from: '2025-07-01', to: '2026-06-30', issued: '2025-08-12',
    due: '2026-05-31', amount: 209600, invoice: 'Assessment 30114-0', paid: '2026-05-28',
    plan: {
      mode: 'instalments', fullAmount: 209600, fullDue: '2025-09-30',
      instalments: [
        { n: 1, due: '2025-09-30', amount: 52400, paid: '2025-09-26' },
        { n: 2, due: '2025-11-30', amount: 52400, paid: '2025-11-27' },
        { n: 3, due: '2026-02-28', amount: 52400, paid: '2026-02-25' },
        { n: 4, due: '2026-05-31', amount: 52400, paid: '2026-05-28' },
      ],
    },
  });
  B({
    id: 'rates-2026', service: 'rates', from: '2026-07-01', to: '2027-06-30', issued: '2026-08-14',
    due: '2026-09-30', amount: 218400, invoice: 'Assessment 30114-0', paid: null,
    plan: {
      mode: 'instalments', fullAmount: 218400, fullDue: '2026-09-30',
      instalments: [
        { n: 1, due: '2026-09-30', amount: 54600, paid: null },
        { n: 2, due: '2026-11-30', amount: 54600, paid: null },
        { n: 3, due: '2027-02-28', amount: 54600, paid: null },
        { n: 4, due: '2027-05-31', amount: 54600, paid: null },
      ],
    },
  });

  // Alex's own car rego (personal: only Alex sees it).
  B({ id: 'rego-2025', service: 'rego', from: '2025-10-18', to: '2026-10-17', issued: '2025-09-20', due: '2025-10-18', amount: 88410, invoice: 'REG 1KX-4PL', paid: '2025-10-10' });
  B({ id: 'rego-2026', service: 'rego', from: '2026-10-18', to: '2027-10-17', issued: '2026-09-19', due: '2026-10-18', amount: 91240, invoice: 'REG 1KX-4PL', paid: null });

  if (sc.busy) {
    const monthly = { phone: 13200, health: 31240, garden: 14000, cleaning: 18000 };
    Object.entries(monthly).forEach(([sid, amount]) => {
      for (let i = 0; i < 12; i++) {
        const y = 2025 + Math.floor((9 + i) / 12);
        const m = ((9 + i) % 12) + 1;
        const from = `${y}-${mm(m)}-01`;
        const due = `${y}-${mm(m)}-15`;
        B({ id: `${sid}-${y}-${mm(m)}`, service: sid, from, to: monthEnd(y, m), issued: addDays(from, -3), due, amount, invoice: `${sid.toUpperCase()}-${y}${mm(m)}`, paid: due < TODAY ? addDays(due, -2) : null });
      }
    });
    B({ id: 'contents-2026', service: 'contents', from: '2026-03-01', to: '2027-02-28', issued: '2026-02-10', due: '2026-03-01', amount: 68400, invoice: 'KHC-771203', paid: '2026-02-26' });
    B({ id: 'ambulance-2026', service: 'ambulance', from: '2026-07-01', to: '2027-06-30', issued: '2026-06-05', due: '2026-07-01', amount: 11200, invoice: 'SAM-4410982', paid: '2026-06-28' });
  }
  if (sc.fresh) bills.length = 0;

  /* Figures printed on the two newest energy bills. */
  const figs = {
    'power-2026-q3': [
      { label: 'Total usage', value: '1,684 kWh', change: 0.11, note: 'per day vs last bill' },
      { label: 'Peak', value: '1,012 kWh × 29.53 c', amount: 29884, change: 0.09 },
      { label: 'Off-peak', value: '672 kWh × 18.70 c', amount: 12566, change: 0.14 },
      { label: 'Supply charge', value: '92 days × $1.1210', amount: 10313, change: 0 },
      { label: 'Solar feed-in', value: '212 kWh × 5.0 c', amount: -1060, change: -0.31 },
      { label: 'Pay-on-time discount', value: '', amount: -3082 },
      { label: 'Similar households', value: '1,540 kWh', comparison: true },
    ],
    'gas-2026-07': [
      { label: 'Total usage', value: '10,240 MJ', change: 0.3, note: 'per day vs last bill' },
      { label: 'Usage charge', value: '10,240 MJ × 2.571 c', amount: 26326, change: 0.29 },
      { label: 'Supply charge', value: '62 days × $0.8900', amount: 5518, change: 0 },
      { label: 'Similar households', value: '8,900 MJ', comparison: true },
    ],
  };

  /* ---------- splitting (per day, among people living there) ---------- */
  const presentOn = (m, day) => day >= m.from && (!m.to || day <= m.to);
  function splitFractions(svc, from, to) {
    if (svc.owner) return { [svc.owner]: 1 };
    const acc = {};
    const n = fmt.days(from, to);
    for (let i = 0; i < n; i++) {
      const day = addDays(from, i);
      const here = members.filter((m) => presentOn(m, day));
      const w = here.map((m) => (svc.split.mode === 'percent' ? svc.split.pct[m.id] || 0 : 1));
      const tot = w.reduce((a, b) => a + b, 0) || 1;
      here.forEach((m, j) => (acc[m.id] = (acc[m.id] || 0) + w[j] / tot / n));
    }
    return acc;
  }
  function splitAmount(fr, amount, payer) {
    const out = Object.entries(fr).map(([id, f]) => ({ member: id, amount: Math.round(amount * f) }));
    const diffC = amount - out.reduce((a, s) => a + s.amount, 0);
    const fix = out.find((s) => s.member === payer) || out[0];
    fix.amount += diffC;
    return out;
  }

  // Which housemate shares are already paid back to the payer.
  const shareOverrides = {
    'power-2026-q3': { alex: null, sam: null },
    'gas-2026-07': { alex: '2026-09-21', sam: null },
    'rates-2026#1': { jordan: '2026-09-25', sam: null },
  };
  function sharePaid(key, due, member) {
    const o = shareOverrides[key];
    if (o && member in o) return o[member];
    return due < '2026-09-20' ? addDays(due, -2) : null;
  }

  bills.forEach((b) => {
    const svc = serviceById[b.service];
    b.days = fmt.days(b.from, b.to);
    b.fractions = splitFractions(svc, b.from, b.to);
    b.personal = !!svc.owner;
    b.figures = figs[b.id] || null;
    const mk = (amount, due, key) =>
      splitAmount(b.fractions, amount, svc.payer).map((s) => ({
        ...s,
        payer: s.member === svc.payer,
        paid: s.member === svc.payer || b.personal ? null : sharePaid(key, due, s.member),
      }));
    if (b.plan && b.plan.mode === 'instalments') {
      b.plan.instalments.forEach((ins) => (ins.shares = mk(ins.amount, ins.due, `${b.id}#${ins.n}`)));
      b.shares = splitAmount(b.fractions, b.amount, svc.payer).map((s) => ({ ...s, payer: s.member === svc.payer }));
    } else {
      b.shares = mk(b.amount, b.due, b.id);
    }
  });

  if (!split)
    bills.forEach((b) => {
      b.shares = [];
      if (b.plan) b.plan.instalments.forEach((i) => (i.shares = []));
    });

  // Anomaly flags (same season last year, as the app's rule does).
  const gasNow = bills.find((b) => b.id === 'gas-2026-07');
  if (gasNow) gasNow.unusual = { pct: 0.32, basis: 'the same time last year' };
  const powerNow = bills.find((b) => b.id === 'power-2026-q3');
  if (powerNow) powerNow.vsLastYear = 0.05;

  const billById = Object.fromEntries(bills.map((b) => [b.id, b]));
  const billsFor = (sid) => bills.filter((b) => b.service === sid).sort((a, b) => (a.from < b.from ? 1 : -1));

  /* ---------- status ---------- */
  function nextInstalment(b) {
    return b.plan ? b.plan.instalments.find((i) => !i.paid) || null : null;
  }
  function billStatus(b) {
    const ins = nextInstalment(b);
    const due = ins ? ins.due : b.due;
    const paid = b.plan ? !ins : !!b.paid;
    if (paid) return { key: 'paid', label: 'Paid', tone: 'ok', due };
    const n = diff(TODAY, due);
    if (n < 0) return { key: 'overdue', label: `${-n} days overdue`, tone: 'bad', due };
    if (n === 0) return { key: 'soon', label: 'Due today', tone: 'warn', due };
    if (n === 1) return { key: 'soon', label: 'Due tomorrow', tone: 'warn', due };
    if (n <= 7) return { key: 'soon', label: `Due in ${n} days`, tone: 'warn', due };
    return { key: 'upcoming', label: `Due ${fmt.date(due)}`, tone: 'neutral', due };
  }

  /* ---------- documents (all "Analysed") ---------- */
  const docs = [];
  const howFor = (b) => {
    if (b.entry === 'manual') return null;
    if (b.service === 'rates' || b.service === 'rego') return { how: 'Uploaded by Alex', type: 'scan' };
    if (b.service === 'power') return { how: 'Forwarded by Jordan', type: 'pdf' };
    return { how: 'Emailed in', type: 'pdf' };
  };
  const domains = { power: 'northwind.energy', gas: 'hearthline.com.au', water: 'riverbend.water', net: 'brightline.net.au' };
  bills.forEach((b) => {
    const h = howFor(b);
    if (!h) return;
    const svc = serviceById[b.service];
    docs.push({
      id: `doc-${b.id}`, kind: 'bill', type: h.type, bill: b.id, service: b.service,
      title: `${svc.provider} ${b.plan ? 'rates notice' : b.service === 'rego' ? 'renewal notice' : 'bill'}`,
      file: `${svc.provider.split(' ')[0]} ${fmt.mon(b.issued)} ${b.issued.slice(0, 4)}.pdf`,
      pages: b.figures ? 3 : b.plan ? 2 : 1,
      arrived: b.issued, how: h.how,
      from: domains[b.service] ? `accounts@${domains[b.service]}` : null,
      verified: domains[b.service] || null,
      subject: domains[b.service] ? `Your ${svc.name.toLowerCase()} bill is ready` : null,
      personal: !!svc.owner,
    });
    if (b.id === 'gas-2026-07') {
      docs.push({
        id: 'doc-gas-receipt', kind: 'receipt', type: 'email', bill: b.id, service: 'gas',
        title: 'Hearthline Gas payment receipt', file: 'Payment received.eml', arrived: '2026-09-20',
        how: 'Forwarded by Jordan', from: 'noreply@hearthline.com.au', verified: 'hearthline.com.au',
        subject: 'Thanks, we received your payment',
      });
    }
  });
  if (!sc.fresh) {
  docs.push({
    id: 'doc-waiting', kind: 'bill', type: 'pdf', bill: null, service: 'water', status: 'waiting',
    title: 'Riverbend Water bill', file: 'Riverbend Sep 2026.pdf', pages: 2, arrived: TODAY,
    how: 'Emailed in', from: 'accounts@riverbend.water', verified: 'riverbend.water', subject: 'Your water bill is ready',
  });
  docs.push({
    id: 'doc-failed', kind: 'bill', type: 'photo', bill: null, service: 'gas', status: 'failed',
    title: 'Photo of a bill', file: 'IMG_2231.jpg', arrived: '2026-09-28', how: 'Uploaded by Jordan',
  });
  docs.push({
    id: 'doc-rent-statement', kind: 'bill', type: 'pdf', bill: null, service: 'rent', needs: '1 detail to confirm',
    title: 'Harbour Lane Realty statement', file: 'Statement Sep 2026.pdf', pages: 1, arrived: '2026-09-26',
    how: 'Uploaded by Alex',
  });
  docs.push({
    id: 'doc-water-portal', kind: 'other', type: 'email', bill: null, service: 'water',
    title: 'Riverbend Water account update', file: 'Account update.eml', arrived: '2026-09-15',
    how: 'Emailed in', from: 'hello@riverbend.water', verified: 'riverbend.water', subject: 'Your online account has a new look',
  });
  }
  docs.sort((a, b) => (a.arrived < b.arrived ? 1 : -1));
  const docsForBill = (id) => docs.filter((d) => d.bill === id);

  /* ---------- month accrual (for charts and "this month") ---------- */
  // Per-day estimates for days no bill covers yet (the next bill hasn't arrived).
  const estimatePerDay = { power: 480, gas: 390, water: 322 };
  const household = services.filter((s) => !s.owner);
  function lastEnd(sid) {
    return billsFor(sid).reduce((a, b) => (b.to > a ? b.to : a), '0000');
  }
  function accrue(y, m, who) {
    const from = `${y}-${mm(m)}-01`;
    const to = monthEnd(y, m);
    let known = 0;
    let est = 0;
    const bySvc = {};
    household.forEach((svc) => {
      let v = 0;
      billsFor(svc.id).forEach((b) => {
        const a = b.from > from ? b.from : from;
        const z = b.to < to ? b.to : to;
        if (a > z) return;
        const share = who ? b.fractions[who] || 0 : 1;
        v += (b.amount * fmt.days(a, z)) / b.days * share;
      });
      known += v;
      let e = 0;
      if (estimatePerDay[svc.id]) {
        const end = lastEnd(svc.id);
        const a = end >= from ? addDays(end, 1) : from;
        if (a <= to) {
          const share = who ? (svc.split.mode === 'percent' ? svc.split.pct[who] / 100 : 1 / 3) : 1;
          e = estimatePerDay[svc.id] * fmt.days(a, to) * share;
        }
      }
      est += e;
      bySvc[svc.id] = v + e;
    });
    return { key: `${y}-${mm(m)}`, label: MON[m - 1], total: known + est, known, est, bySvc };
  }
  const monthly = [];
  for (let i = 0; i < 12; i++) {
    const y = 2025 + Math.floor((9 + i) / 12);
    const m = ((9 + i) % 12) + 1;
    monthly.push(accrue(y, m));
  }
  const thisMonth = monthly[11];
  const lastMonth = monthly[10];
  const yourMonth = accrue(2026, 9, 'alex');

  // Six months ahead: seasonal per-day costs for the metered services.
  const seasonal = {
    power: [460, 450, 510, 560, 540, 480],
    gas: [320, 210, 160, 140, 150, 200],
    water: [322, 322, 330, 340, 340, 330],
  };
  const forecast = [10, 11, 12, 1, 2, 3].map((m, i) => {
    const y = m >= 10 ? 2026 : 2027;
    const days = fmt.days(`${y}-${mm(m)}-01`, monthEnd(y, m));
    const fixed = 229667 + 8900 + Math.round((218400 / 365) * days);
    const total = fixed + (seasonal.power[i] + seasonal.gas[i] + seasonal.water[i]) * days;
    return { label: MON[m - 1], total };
  });

  /* ---------- money between housemates (recomputed when a share is marked paid) ---------- */
  const money = { debts: [], youOwe: [], owedToYou: [], people: [], sharesThisMonth: [] };
  const sum = (l) => l.reduce((a, d) => a + d.amount, 0);
  function recomputeMoney() {
    const debts = []; // unpaid shares: { from, to, amount, bill, instalment, due }
    bills.forEach((b) => {
      if (b.personal) return;
      const payer = serviceById[b.service].payer;
      const lists = b.plan
        ? b.plan.instalments.filter((i) => !i.paid).slice(0, 1).map((i) => [i.shares, i.due, i.n])
        : [[b.shares, b.due, null]];
      lists.forEach(([shares, due, n]) =>
        shares.forEach((s) => {
          if (s.payer || s.paid) return;
          if (due < '2026-09-20' && !b.plan) return;
          debts.push({ from: s.member, to: payer, amount: s.amount, bill: b.id, instalment: n, due });
        }),
      );
    });
    debts.sort((a, b) => (a.due < b.due ? -1 : 1));
    money.debts = debts;
    money.youOwe = debts.filter((d) => d.from === 'alex');
    money.owedToYou = debts.filter((d) => d.to === 'alex');
    money.people = members
      .filter((m) => !m.you)
      .map((m) => ({
        member: m.id,
        owesYou: sum(money.owedToYou.filter((d) => d.from === m.id)),
        youOwe: sum(money.youOwe.filter((d) => d.to === m.id)),
      }))
      .map((p) => ({ ...p, net: p.owesYou - p.youOwe }));
    // Shares due this month (for the settled ring).
    const due = [];
    bills.forEach((b) => {
      if (b.personal) return;
      const sets = b.plan ? b.plan.instalments.map((i) => [i.shares, i.due]) : [[b.shares, b.due]];
      sets.forEach(([shares, d]) => {
        if (d.slice(0, 7) !== '2026-09') return;
        shares.forEach((s) => !s.payer && due.push(s));
      });
    });
    money.sharesThisMonth = due;
  }
  recomputeMoney();

  /* ---------- weather, notices ---------- */
  const weather = {
    place: 'Riverside',
    now: { t: 14, hi: 17, lo: 8, sky: 'Partly cloudy', icon: 'cloud-sun', need: 'heat' },
    days: [
      { d: 'Wed', hi: 15, lo: 7, icon: 'cloud-rain', need: 'heat' },
      { d: 'Thu', hi: 13, lo: 6, icon: 'cloud-rain', need: 'heat' },
      { d: 'Fri', hi: 16, lo: 9, icon: 'cloud', need: 'heat' },
      { d: 'Sat', hi: 19, lo: 10, icon: 'cloud-sun', need: null },
      { d: 'Sun', hi: 22, lo: 11, icon: 'sun', need: null },
      { d: 'Mon', hi: 18, lo: 9, icon: 'cloud-sun', need: null },
    ],
    line: 'Heating this week: about $9 more than a normal week',
  };
  const notices = sc.fresh ? [] : [
    { id: 'n-gas', tone: 'warn', icon: 'trend-up', title: 'Gas is 32% higher', body: 'Jul – Aug came in 32% above the same time last year.', go: 'bill:gas-2026-07' },
    { id: 'n-season', tone: 'info', icon: 'sun', title: 'Summer starts 1 Dec', body: 'Last summer electricity ran 18% higher, about $27 a month more.', go: 'service:power' },
    { id: 'n-check', tone: 'neutral', icon: 'inbox', title: 'A statement to confirm', body: 'Harbour Lane Realty statement · 1 detail to confirm.', go: 'screen:inbox' },
  ];

  return {
    TODAY,
    household: { name: 'Riverside House', address: 'riverside.k7p2m@brjlabs.com', fy: 'FY 2026–27', split, postcode: sc.postcode !== false, fresh: !!sc.fresh, solo: !!sc.solo, busy: !!sc.busy },
    you: 'alex',
    members,
    memberById,
    services,
    serviceById,
    bills,
    billById,
    billsFor,
    billStatus,
    nextInstalment,
    docs,
    docsForBill,
    monthly,
    thisMonth,
    lastMonth,
    yourMonth,
    forecast,
    money,
    recomputeMoney,
    weather: sc.postcode === false ? null : weather,
    notices,
    sum,
    diff,
    addDays,
  };
  }

  HU.data = {};
  /** Rebuild the demo for a household state. Keeps the same object so every module sees it. */
  HU.setScenario = function (id) {
    const s = HU.scenarios.find((x) => x.id === id) || HU.scenarios[0];
    const d = build(s.flags);
    Object.keys(HU.data).forEach((k) => delete HU.data[k]);
    Object.assign(HU.data, d, { scenario: s.id });
  };
  HU.setScenario('demo');
  HU.fmt = fmt;
})();
