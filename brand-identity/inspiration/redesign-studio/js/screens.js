/*
  The five directions. Each one arranges the same parts in its own structure:
  Home (widget grid), Services, Service, Bills, Bill, Inbox, Money.
  Within a direction a bill always opens the same page, wherever it's opened from.
*/
(function () {
  const HU = (window.HU = window.HU || {});
  const { data, fmt, icon, C, ch } = HU;
  const esc = C.esc;
  const S = (HU.S = {});

  /* ---------- shared helpers ---------- */
  S.head = (title, sub, right, cls) =>
    `<div class="scr-head${cls ? ' ' + cls : ''}"><div class="scr-head-t"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="scr-head-r">${right}</div>` : ''}</div>`;
  S.back = (ctx) =>
    ctx.backLabel ? `<button class="back" data-go="back">${icon('chevron-left', 18)}<span>${esc(ctx.backLabel)}</span></button>` : '';
  const visibleServices = (ctx) => {
    const sc = ctx.state.svcScope || 'all';
    return data.services.filter((s) => (sc === 'mine' ? s.owner === data.you : sc === 'household' ? !s.owner : true));
  };
  S.scopeSeg = (ctx) =>
    C.seg([['all', 'All'], ['household', 'Household'], ['mine', 'Mine']], ctx.state.svcScope || 'all', 'svcScope', 'seg-sm');
  const svc = (id) => data.serviceById[id];
  const latestOf = (sid) => data.billsFor(sid)[0];
  const monthKey = (b) => b.issued.slice(0, 7);

  S.billFilter = (ctx) =>
    C.seg([['all', 'All'], ['topay', 'To pay'], ['paid', 'Paid'], ['unusual', 'Unusual']], ctx.state.billFilter || 'all', 'billFilter', 'seg-sm');
  S.billGroups = (ctx) => {
    const f = ctx.state.billFilter || 'all';
    const list = data.bills
      .filter((b) => {
        const st = data.billStatus(b);
        if (f === 'topay') return st.key !== 'paid';
        if (f === 'paid') return st.key === 'paid';
        if (f === 'unusual') return !!b.unusual;
        return true;
      })
      .sort((a, b) => (a.issued < b.issued ? 1 : -1));
    const groups = [];
    list.forEach((b) => {
      const k = monthKey(b);
      let g = groups.find((x) => x.key === k);
      if (!g) groups.push((g = { key: k, label: fmt.monthYear(k + '-01'), bills: [] }));
      g.bills.push(b);
    });
    groups.forEach((g) => (g.total = g.bills.reduce((a, b) => a + (b.personal ? 0 : b.amount), 0)));
    return groups;
  };
  const groupHead = (g) =>
    `<div class="grp-h"><span>${esc(g.label)}</span><span class="muted">${g.bills.length} ${g.bills.length === 1 ? 'bill' : 'bills'} · ${fmt.money(g.total, true)}</span></div>`;

  S.inboxGroups = (ctx) => {
    const f = ctx.state.inboxFilter || 'all';
    const list = data.docs.filter((d) =>
      f === 'confirm' ? !!d.needs : f === 'bills' ? d.kind === 'bill' && !d.needs : f === 'receipts' ? d.kind === 'receipt' : f === 'other' ? d.kind === 'other' : true,
    );
    const groups = [];
    list.forEach((d) => {
      const k = d.arrived.slice(0, 7);
      let g = groups.find((x) => x.key === k);
      if (!g) groups.push((g = { key: k, label: fmt.monthYear(k + '-01'), docs: [] }));
      g.docs.push(d);
    });
    return groups.slice(0, 6);
  };
  S.inboxFilter = (ctx) =>
    C.seg([['all', 'All'], ['confirm', 'To confirm'], ['bills', 'Bills'], ['receipts', 'Receipts'], ['other', 'Other']], ctx.state.inboxFilter || 'all', 'inboxFilter', 'seg-sm');

  S.debtRow = (d, ctx, dir) => {
    const b = data.billById[d.bill];
    const s = svc(b.service);
    const other = dir === 'out' ? d.to : d.from;
    const m = data.memberById[other];
    return `<div class="debt-row">
      <button class="debt-main" data-go="bill:${b.id}">${C.disc(s, ctx, 'sm')}<span><b>${esc(s.name)}${d.instalment ? ` · instalment ${d.instalment}` : ''}</b><span class="muted">${dir === 'out' ? 'to' : 'from'} ${esc(m.name)} · ${esc(fmt.rel(d.due))}</span></span></button>
      <span class="debt-amt">${fmt.money(d.amount)}</span>
      ${dir === 'out' ? C.btn('Mark paid', { kind: 'primary', size: 'sm', act: 'markpaid', attrs: `data-bill="${b.id}" data-ins="${d.instalment || ''}"` }) : C.btn('Paid', { kind: 'glass', size: 'sm', icon: 'check', act: 'markpaid', attrs: `data-bill="${b.id}" data-ins="${d.instalment || ''}" data-member="${d.from}"` })}
    </div>`;
  };
  S.moneyParts = (ctx) => {
    const M = data.money;
    const net = M.people.reduce((a, p) => a + p.net, 0);
    const owe = data.sum(M.youOwe);
    const parts = {};
    parts.hero = `<div class="mh">
      <div class="eyebrow">Settle up</div>
      <div class="mh-fig">${C.money(net, 'hero-fig')}</div>
      <p class="mh-line">Owed to you, after the ${fmt.money(owe)} you owe Jordan.</p>
      <div class="mh-acts">${C.btn('Remind everyone', { kind: 'glass', icon: 'bell', act: 'toast', attrs: 'data-msg="Reminders emailed to Jordan and Sam"' })}${C.btn('Record a payment', { kind: 'primary', icon: 'plus', go: 'sheet:pay' })}</div>
    </div>`;
    parts.people = M.people
      .map((p) => {
        const m = data.memberById[p.member];
        const all = data.bills.filter((b) => !b.personal).flatMap((b) => (b.plan ? b.plan.instalments.flatMap((i) => i.shares) : b.shares)).filter((s) => s.member === m.id && !s.payer);
        const paid = all.filter((s) => s.paid).length;
        return `<div class="person" style="--m:${C.col(ctx, m)}">
          <div class="person-top">${C.avatar(m, ctx, 'lg')}<div><b>${esc(m.name)}</b><span class="muted small">${esc(m.role)} · since ${fmt.monthYear(m.from)}</span></div></div>
          <div class="person-body">${ch.ring(paid / (all.length || 1), { size: 70, colour: C.col(ctx, m), inner: `<b>${Math.round((paid / (all.length || 1)) * 100)}%</b>` })}
          <div class="person-t"><span class="person-net ${p.net >= 0 ? 'pos' : 'neg'}">${p.net >= 0 ? 'Owes you' : 'You owe'} ${fmt.money(Math.abs(p.net))}</span><span class="muted small">${paid} of ${all.length} shares paid back this year</span></div></div>
          <div class="person-pay">${m.pay.map(([k, v]) => `<span class="muted small">${esc(k)}</span><span class="mono small">${esc(v)}</span>`).join('')}</div>
        </div>`;
      })
      .join('');
    parts.out = `${C.sectionHead('You owe', `<span class="muted">${fmt.money(owe)}</span>`)}<div class="debts">${M.youOwe.map((d) => S.debtRow(d, ctx, 'out')).join('') || '<p class="muted">You’re square with everyone.</p>'}</div>`;
    parts.in = `${C.sectionHead('Owed to you', `<span class="muted">${fmt.money(data.sum(M.owedToYou))}</span>`)}<div class="debts">${M.owedToYou.map((d) => S.debtRow(d, ctx, 'in')).join('')}</div>`;
    parts.between = (() => {
      const o = M.debts.filter((d) => d.from !== data.you && d.to !== data.you);
      return o.length
        ? `${C.sectionHead('Between housemates')}<div class="debts">${o
            .map((d) => {
              const b = data.billById[d.bill];
              return `<button class="between" data-go="bill:${b.id}">${C.avatar(data.memberById[d.from], ctx, 'sm')}<span>${esc(data.memberById[d.from].name)} owes ${esc(data.memberById[d.to].name)} · ${esc(svc(b.service).name)}</span><b>${fmt.money(d.amount)}</b>${d.due < data.TODAY ? C.chip('Overdue', 'bad', 'alert') : ''}</button>`;
            })
            .join('')}</div>`
        : '';
    })();
    return parts;
  };
  S.inboxList = (ctx, o = {}) =>
    S.inboxGroups(ctx)
      .map((g) => `<section class="${o.glass === false ? '' : 'g '}inbox-grp"><div class="grp-h"><span>${esc(g.label)}</span><span class="muted">${g.docs.length}</span></div><div class="rows">${g.docs.map((d) => C.docRow(d, ctx, { withBill: o.withBill })).join('')}</div></section>`)
      .join('') || `<p class="muted">Nothing here yet. Forwarded bills appear as soon as they’re analysed.</p>`;
  const inboxHead = (ctx) =>
    S.head('Inbox', 'Every bill, receipt and email that reaches the household, analysed as it arrives.', C.btn('Upload', { kind: 'glass', icon: 'upload', act: 'toast', attrs: 'data-msg="Choose a PDF or a photo of a bill"' }));


  /* ---------- Settings (same in every direction; each pack styles it) ---------- */
  S.settings = (ctx) => {
    const cur = ctx.state.palette;
    const presets = HU.palettes.filter((p) => p.app);
    const card = (p) => {
      const t = p[ctx.mode] || p.light;
      const on = p.id === cur;
      return `<button class="preset${on ? ' on' : ''}" data-act="setPalette" data-v="${p.id}" aria-pressed="${on}" style="--pg:linear-gradient(160deg, ${t.ground.join(', ')});--pb1:${t.blobs[0]};--pb2:${t.blobs[1]};--pb3:${t.blobs[2]};--pa:${t.accent};--pa2:${t.accent2};--pfg:${t.fg}">
        <span class="preset-prev" aria-hidden="true"><i class="pp-b1"></i><i class="pp-b2"></i><i class="pp-b3"></i><span class="pp-card"><i class="pp-ring"></i><span class="pp-lines"><i></i><i></i></span><i class="pp-btn"></i></span></span>
        <span class="preset-t"><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span></span>
        <span class="preset-check" aria-hidden="true">${icon('check', 13)}</span>
      </button>`;
    };
    const toggleRow = (title, sub, on) => `<div class="tg-row"><span><b>${esc(title)}</b><span class="muted small">${esc(sub)}</span></span>${C.toggle(on, title, 'flip')}</div>`;
    const editorial = ctx.dir.key === 'almanac' || ctx.dir.key === 'almanac2';
    const head = editorial
      ? `<header class="d3-title"><h1>Settings</h1><p>How the app looks for you, what it emails you, and your household.</p></header>`
      : S.head('Settings', 'How the app looks for you, what it emails you, and your household.');
    return `<div class="scr settings">${head}
      <div class="set-grid">
        <section class="g set-appear">
          ${C.sectionHead('Appearance', '<span class="muted">Just for you</span>')}
          <p class="muted set-lede">Pick the colours you like. Only you see your choice; everyone in Riverside House picks their own.</p>
          <div class="presets">${presets.map(card).join('')}</div>
          <div class="set-row"><span><b>Light or dark</b><span class="muted small">Automatic follows your phone or computer.</span></span>${C.seg([['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['auto', 'Automatic', 'devices']], ctx.state.theme, 'setTheme', 'seg-sm')}</div>
        </section>
        <div class="set-col">
          <section class="g">${C.sectionHead('Your account')}${C.kv([['Name', 'Alex'], ['Email', '<span class="mono">alex@example.com</span>'], ['Signs in with', 'Google'], ['PIN', 'Set · asked again every 7 days']])}<div class="set-acts">${C.btn('Change PIN', { kind: 'glass', size: 'sm', icon: 'lock', act: 'toast', attrs: 'data-msg="Enter your current PIN, then a new one"' })}</div></section>
          <section class="g">${C.sectionHead('Emails')}${toggleRow('New bills', 'When a bill for the household is analysed', true)}${toggleRow('Reminders', 'Three days before your share is due', true)}${toggleRow('Payments', 'When a housemate pays you back', false)}</section>
          <section class="g">${C.sectionHead('Household', C.btn('Members', { kind: 'plain', size: 'sm', go: 'screen:members' }))}
            <div class="set-hh">${C.avatars(data.members.map((m) => m.id), ctx, 'md')}<span><b>Riverside House</b><span class="muted small">${esc(data.household.solo ? 'Just you · you’re the admin' : data.household.fresh ? 'Alex · Jordan and Sam invited · you’re an admin' : 'Alex, Jordan and Sam · you’re an admin')}${data.household.split ? '' : ' · bills aren’t split'}</span></span></div>
            ${C.addressCard()}
            ${toggleRow('Everyone can download the household’s bills', 'Otherwise only admins can', true)}
          </section>
        </div>
      </div>
    </div>`;
  };

  /* Window of months for the matrix and ribbons: Oct 2025 → Oct 2026. */
  const W0 = Date.parse('2025-10-01');
  const W1 = Date.parse('2026-11-01');
  const wx = (s) => Math.max(0, Math.min(100, ((Date.parse(s) - W0) / (W1 - W0)) * 100));
  const winMonths = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  S.timeBlocks = (sid, ctx, cls) =>
    data
      .billsFor(sid)
      .filter((b) => Date.parse(b.to) >= W0 && Date.parse(b.from) < W1)
      .map((b) => {
        const st = data.billStatus(b);
        const l = wx(b.from);
        const r = wx(data.addDays(b.to, 1));
        const clipped = Date.parse(b.from) < W0;
        return `<button class="${cls} s-${st.key}${clipped ? ' clip' : ''}${b.unusual ? ' flag' : ''}" data-go="bill:${b.id}" style="left:calc(${l}% + 1px);width:calc(${r - l}% - 2px)" data-tip="${esc(`${fmt.range(b.from, b.to)} · ${fmt.money(b.amount)} · ${st.label}`)}" aria-label="${esc(`${svc(sid).name} ${fmt.range(b.from, b.to)} ${fmt.money(b.amount)}`)}"><span>${r - l > 12 ? fmt.money(b.amount, true) : ''}</span></button>`;
      })
      .join('');
  S.todayLine = () => `<i class="today-line" style="left:${wx(data.TODAY)}%"><span>Today</span></i>`;

  const greeting = (ctx) => {
    const tm = data.thisMonth;
    const chg = (tm.total - data.lastMonth.total) / data.lastMonth.total;
    const due = HU.widgets.upcoming().filter((u) => u.n <= 7).length;
    return { hi: 'Hey, Alex.', line: `September is tracking ${fmt.pct(chg)} under August. ${due} payments due this week.` };
  };

  /* A D2-style table of bills (Console), one row per bill. */
  C.billTable = (bills, ctx, o = {}) =>
    `<div class="btable" role="table">
      <div class="bt-r bt-h" role="row">${o.inService ? '' : '<span>Service</span>'}<span>Period</span><span class="hide-s">Issued</span><span>Due</span><span class="hide-s">Usage</span><span class="num">Amount</span><span>Status</span></div>
      ${bills
        .map((b) => {
          const s = svc(b.service);
          const st = data.billStatus(b);
          return `<button class="bt-r" role="row" data-go="bill:${b.id}" style="--svc:${C.col(ctx, s)}">${o.inService ? '' : `<span class="bt-svc"><i class="bt-dot"></i>${esc(s.name)}</span>`}<span>${esc(fmt.range(b.from, b.to))}${b.plan ? C.instDots(b) : ''}</span><span class="hide-s mono">${fmt.date(b.issued)}</span><span class="mono">${fmt.date(st.due)}</span><span class="hide-s mono">${b.usage && s.unit ? fmt.num(b.usage) + ' ' + s.unit : '—'}</span><span class="num mono">${fmt.money(C.billAmount(b))}</span><span>${C.statusChip(st)}</span></button>`;
        })
        .join('')}
    </div>`;

  /* ======================================================================
     1 · SPRINGBOARD — liquid glass widgets straight on the scene
     ====================================================================== */
  const d1 = {
    homeHead(ctx) {
      const g = greeting(ctx);
      return `<div class="hh d1-hh"><div><h1>${g.hi}</h1><p>${esc(g.line)}</p></div><div class="d1-date"><span>Tuesday</span><b>29 September</b></div></div>`;
    },
    services(ctx) {
      const list = visibleServices(ctx);
      const card = (s) => {
        const bl = data.billsFor(s.id);
        const b0 = bl[0];
        return `<article class="g d1-svc" style="--svc:${C.col(ctx, s)}">
          <button class="d1-svc-head" data-go="service:${s.id}">${C.disc(s, ctx, 'md')}<span class="d1-svc-t"><b>${esc(s.name)}</b><span class="muted">${esc(s.provider)} · ${esc(s.cadence)}</span></span>${icon('chevron-right', 18, 'chev')}</button>
          <div class="d1-svc-fig">${C.money(C.billAmount(b0), 'fig-md')}${C.statusChip(data.billStatus(b0))}</div>
          <div class="d1-svc-bills rows">${bl.slice(0, 3).map((b) => C.billRow(b, ctx, { inService: true, noDisc: true })).join('')}</div>
          <button class="d1-all" data-go="service:${s.id}"><span>All ${bl.length} bills</span>${icon('chevron-right', 16)}</button>
        </article>`;
      };
      const house = list.filter((s) => !s.owner);
      const mine = list.filter((s) => s.owner);
      return `<div class="scr d1-services">
        ${S.head('Services', `${data.services.filter((s) => !s.owner).length} for the household · 1 just yours`, S.scopeSeg(ctx))}
        ${house.length ? `<div class="d1-sgrid">${house.map(card).join('')}</div>` : ''}
        ${mine.length ? `<h2 class="sub-h">${icon('user', 16)} Just yours</h2><div class="d1-sgrid">${mine.map(card).join('')}</div>` : ''}
      </div>`;
    },
    service(ctx) {
      const s = svc(ctx.state.serviceId);
      const p = C.serviceParts(s, ctx);
      return `<div class="scr d1-service">${S.back(ctx)}
        <section class="g d1-hero" style="--svc:${C.col(ctx, s)}">${p.head}${p.chips}${p.statsHtml}</section>
        <div class="d1-cols">
          <section class="g d1-bills">${C.sectionHead('Bills', `<span class="muted">${p.billsCount} bills · newest first</span>`)}${p.bills}</section>
          <div class="d1-side">
            <section class="g">${C.sectionHead(p.chartTitle)}${p.chart}</section>
            ${p.notice}
            <section class="g">${C.sectionHead('Compared with')}${p.compare}</section>
            ${p.split ? `${p.split ? `<section class="g">${p.split}</section>` : ''}` : ''}
            ${p.coming ? `<section class="g">${C.sectionHead('Coming up', '<span class="muted">Estimates</span>')}${p.coming}</section>` : ''}
          </div>
        </div>
      </div>`;
    },
    bills(ctx) {
      return `<div class="scr d1-billsl">
        ${S.head('Bills', 'Filed by the month each bill belongs to.', S.billFilter(ctx))}
        ${S.billGroups(ctx).map((g) => `<section class="g d1-grp">${groupHead(g)}<div class="rows">${g.bills.map((b) => C.billRow(b, ctx, { share: true })).join('')}</div></section>`).join('')}
      </div>`;
    },
    bill(ctx) {
      const b = data.billById[ctx.state.billId];
      const p = C.billParts(b, ctx);
      return `<div class="scr d1-bill">${S.back(ctx)}
        <section class="g d1-bill-hero" style="--svc:${C.col(ctx, svc(b.service))}">${p.hero}${p.actions}</section>
        ${p.notice}
        <div class="d1-bill-grid">
          <section class="g">${C.sectionHead('Details')}${p.details}</section>
          ${p.split ? `<section class="g">${p.split}</section>` : ''}
          ${p.plan ? `<section class="g">${p.plan}</section>` : ''}
          <section class="g">${p.files}</section>
          ${p.figures ? `<section class="g">${p.figures}</section>` : ''}
        </div>
      </div>`;
    },
    inbox(ctx) {
      return `<div class="scr d1-inbox">${inboxHead(ctx)}<section class="g d1-addr">${C.addressCard()}</section><div class="filters">${S.inboxFilter(ctx)}</div>${S.inboxList(ctx)}</div>`;
    },
    money(ctx) {
      const p = S.moneyParts(ctx);
      return `<div class="scr d1-money">${S.head('Money', 'What housemates owe each other. The app tracks it; money moves however you like.')}
        <div class="d1-money-top"><section class="g d1-mh">${p.hero}</section>${p.people.replace(/class="person"/g, 'class="g person"')}</div>
        <div class="d1-money-cols"><section class="g">${p.out}</section><section class="g">${p.in}</section>${p.between ? `<section class="g">${p.between}</section>` : ''}</div>
      </div>`;
    },
  };

  /* ======================================================================
     2 · CONSOLE — one frosted window, dense instruments, a bill matrix
     ====================================================================== */
  const d2 = {
    homeHead(ctx) {
      const g = greeting(ctx);
      return `<div class="hh d2-hh"><div><div class="eyebrow">Overview · Tue 29 Sep</div><h1>${g.hi}</h1></div><p>${esc(g.line)}</p></div>`;
    },
    services(ctx) {
      const list = visibleServices(ctx);
      const rows = list
        .map((s) => {
          const bl = data.billsFor(s.id);
          const yr = bl.filter((b) => b.issued >= '2025-10-01').reduce((a, b) => a + b.amount, 0);
          return `<div class="mx-row" style="--svc:${C.col(ctx, s)}">
            <button class="mx-svc" data-go="service:${s.id}">${C.disc(s, ctx, 'sm')}<span><b>${esc(s.name)}</b><span class="muted">${esc(s.provider)}</span></span></button>
            <div class="mx-track">${S.timeBlocks(s.id, ctx, 'mx-b')}</div>
            <div class="mx-total"><b>${fmt.money(yr, true)}</b>${ch.spark(s.owner ? bl.slice().reverse().map((b) => b.amount) : data.monthly.map((m) => m.bySvc[s.id]), { colour: C.col(ctx, s) })}</div>
          </div>`;
        })
        .join('');
      const kpis = [
        ['Services', String(list.length), `${list.filter((s) => s.owner).length} just yours`],
        ['Bills this year', String(data.bills.filter((b) => b.issued >= '2025-10-01').length), 'Oct 2025 – Sep 2026'],
        ['To pay', fmt.money(HU.widgets.upcoming().reduce((a, u) => a + u.amount, 0), true), 'next 30 days'],
        ['Unusual', '1', 'Gas, Jul – Aug'],
      ];
      return `<div class="scr d2-services">
        ${S.head('Services', 'Every bill each service has sent, month by month. Click any bill to open it.', S.scopeSeg(ctx))}
        <div class="kpis">${kpis.map(([l, v, s]) => `<div class="g kpi"><span class="eyebrow">${l}</span><b>${v}</b><span class="muted small">${s}</span></div>`).join('')}</div>
        <section class="g mx">
          <div class="mx-row mx-head"><span class="mx-svc-h eyebrow">Service</span><div class="mx-track">${winMonths.map((m, i) => `<span style="left:${(i / 13) * 100}%;width:${100 / 13}%">${m}</span>`).join('')}${S.todayLine()}</div><span class="mx-total eyebrow">12 months</span></div>
          <div class="mx-body"><div class="mx-grid">${winMonths.map((_, i) => `<i style="left:${(i / 13) * 100}%"></i>`).join('')}${S.todayLine()}</div>${rows}</div>
          <div class="mx-legend">${C.chip('Paid', 'ok', 'check')}${C.chip('Due soon', 'warn', 'clock')}${C.chip('Upcoming', 'neutral', 'calendar')}<span class="muted small">Blocks span the period each bill covers.</span></div>
        </section>
      </div>`;
    },
    service(ctx) {
      const s = svc(ctx.state.serviceId);
      const p = C.serviceParts(s, ctx);
      const latest = p.latest;
      const fyFrac = 0.62;
      const gauges = `<div class="d2-gauges">
        <div class="g gauge">${ch.ring(fyFrac, { size: 92, colour: C.col(ctx, s), inner: `<b>${p.stats[0].value}</b>` })}<span class="eyebrow">Last FY</span></div>
        ${s.unit ? `<div class="g gauge">${ch.arc(latest.usage / latest.days / (s.limit ? (s.limit * 12) / 365 / 0.8 : (latest.usage / latest.days) * 1.4), { colour: C.col(ctx, s), mark: s.limit ? 0.8 : null, inner: `<b>${(latest.usage / latest.days).toFixed(1)}</b><span>${s.unit}/day</span>` })}<span class="eyebrow">Latest usage</span></div>` : ''}
        ${p.stats.slice(1).map((x) => `<div class="g gauge stat-g"><span class="eyebrow">${esc(x.label)}</span><b>${x.value}</b><span class="muted small">${esc(x.sub)}</span></div>`).join('')}
      </div>`;
      return `<div class="scr d2-service">${S.back(ctx)}
        <div class="d2-svc-top"><section class="g d2-id" style="--svc:${C.col(ctx, s)}">${p.head}${p.chips}</section>${gauges}</div>
        <div class="d2-mid"><section class="g d2-chart">${C.sectionHead(p.chartTitle, '<span class="muted">Click a bar to open the bill</span>')}${p.chart}</section><section class="g">${C.sectionHead('Compared with')}${p.compare}${p.notice ? `<div class="d2-note">${p.notice}</div>` : ''}</section></div>
        <section class="g d2-tbl">${C.sectionHead(`Bills · ${p.billsCount}`, '<span class="muted">Newest first</span>')}${C.billTable(data.billsFor(s.id), ctx, { inService: true })}</section>
        <div class="d2-low">${p.split ? `${p.split ? `<section class="g">${p.split}</section>` : ''}` : ''}${p.coming ? `<section class="g">${C.sectionHead('Coming up', '<span class="muted">Estimates</span>')}${p.coming}</section>` : ''}</div>
      </div>`;
    },
    bills(ctx) {
      return `<div class="scr d2-billsl">
        ${S.head('Bills', 'Every bill, newest first, filed by the month it belongs to.', `${S.billFilter(ctx)}${C.search('Search bills', { cls: 'search-sm' })}`)}
        ${S.billGroups(ctx).map((g) => `<section class="g d2-grp">${groupHead(g)}${C.billTable(g.bills, ctx)}</section>`).join('')}
      </div>`;
    },
    bill(ctx) {
      const b = data.billById[ctx.state.billId];
      const p = C.billParts(b, ctx);
      const ins = data.nextInstalment(b);
      const list = (ins ? ins.shares : b.shares).filter((s) => !s.payer);
      const paid = list.filter((s) => s.paid).length;
      const st = data.billStatus(b);
      const days = data.diff(data.TODAY, st.due);
      const inst = `<div class="d2-inst">
        <div class="g gauge">${ch.ring(list.length ? paid / list.length : 1, { size: 88, inner: `<b>${paid}<small>/${list.length}</small></b>` })}<span class="eyebrow">Shares back</span></div>
        <div class="g gauge">${ch.arc(st.key === 'paid' ? 1 : Math.max(0.04, 1 - days / 30), { colour: st.tone === 'bad' ? 'var(--bad)' : undefined, inner: `<b>${st.key === 'paid' ? '✓' : days < 0 ? -days : days}</b><span>${st.key === 'paid' ? 'paid' : days < 0 ? 'days late' : days === 1 ? 'day left' : 'days left'}</span>` })}<span class="eyebrow">${st.key === 'paid' ? 'Settled' : 'Until due'}</span></div>
      </div>`;
      return `<div class="scr d2-bill">${S.back(ctx)}
        <div class="d2-bill-top"><section class="g d2-bill-main" style="--svc:${C.col(ctx, svc(b.service))}">${p.hero}${p.actions}</section>${inst}</div>
        ${p.notice}
        <div class="d2-bill-grid">
          <section class="g">${C.sectionHead('Details')}${p.details}</section>
          ${p.split ? `<section class="g">${p.split}</section>` : ''}
          ${p.plan ? `<section class="g">${p.plan}</section>` : ''}
          ${p.figures ? `<section class="g">${p.figures}</section>` : ''}
          <section class="g">${p.files}</section>
        </div>
      </div>`;
    },
    inbox(ctx) {
      const counts = { all: data.docs.length, confirm: data.docs.filter((d) => d.needs).length };
      return `<div class="scr d2-inbox">${inboxHead(ctx)}
        <div class="kpis"><div class="g kpi"><span class="eyebrow">Analysed</span><b>${counts.all}</b><span class="muted small">since Sep 2025</span></div><div class="g kpi"><span class="eyebrow">To confirm</span><b>${counts.confirm}</b><span class="muted small">1 detail each</span></div><div class="g kpi wide">${C.addressCard()}</div></div>
        <div class="filters">${S.inboxFilter(ctx)}</div>${S.inboxList(ctx, { withBill: true })}</div>`;
    },
    money(ctx) {
      const p = S.moneyParts(ctx);
      return `<div class="scr d2-money">${S.head('Money', 'Balances between housemates. Tracked here, paid however you like.')}
        <div class="d2-money-top"><section class="g d2-mh">${p.hero}</section>${p.people.replace(/class="person"/g, 'class="g person"')}</div>
        <div class="d2-money-cols"><section class="g">${p.out}</section><section class="g">${p.in}</section>${p.between ? `<section class="g">${p.between}</section>` : ''}</div>
      </div>`;
    },
  };

  /* ======================================================================
     3 · ALMANAC — calm, editorial, big type; services as year ribbons
     ====================================================================== */
  const d3 = {
    homeHead(ctx) {
      const g = greeting(ctx);
      return `<div class="hh d3-hh"><h1>${g.hi}</h1><p>${esc(g.line)}</p></div>`;
    },
    services(ctx) {
      const list = visibleServices(ctx);
      const rib = (s) => {
        const bl = data.billsFor(s.id);
        const b0 = bl[0];
        const yr = bl.filter((b) => b.issued >= '2025-10-01').reduce((a, b) => a + b.amount, 0);
        const sentence =
          s.id === 'power' ? 'Latest bill 5% above the same time last year.' : s.id === 'gas' ? 'Latest bill 32% above last winter. Flagged as unusual.' : s.id === 'rates' ? 'Paying by instalments, 1 of 4 due tomorrow.' : s.id === 'rego' ? 'Just yours. Renewal due 18 October.' : s.id === 'net' ? 'Up $4 a month since July.' : s.id === 'rent' ? 'Split 40 / 30 / 30. Alex has the main bedroom.' : 'Next bill expected mid October.';
        return `<section class="g d3-svc" style="--svc:${C.col(ctx, s)}">
          <button class="d3-svc-l" data-go="service:${s.id}">${C.disc(s, ctx, 'md')}<span><b>${esc(s.name)}</b><span class="muted">${esc(s.provider)}</span></span></button>
          <div class="d3-svc-fig"><span class="fig-md">${fmt.money(yr, true)}</span><span class="muted small">last 12 months · ${bl.filter((b) => b.issued >= '2025-10-01').length} bills</span></div>
          <div class="d3-rib"><div class="d3-rib-track">${S.timeBlocks(s.id, ctx, 'rb')}${S.todayLine()}</div><div class="d3-rib-axis">${winMonths.map((m, i) => `<span style="left:${(i / 13) * 100}%">${i % 3 === 0 ? m : ''}</span>`).join('')}</div></div>
          <p class="d3-svc-sum">${esc(sentence)} Last bill ${fmt.money(C.billAmount(b0))}, ${esc(data.billStatus(b0).label.toLowerCase())}.</p>
        </section>`;
      };
      return `<div class="scr d3-services">
        <header class="d3-title"><h1>Services</h1><p>${['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen'][list.length] || list.length} ${list.length === 1 ? 'service keeps' : 'services keep'} Riverside House running. Each line is a year of its bills, one block per bill; the thin line marks today.</p><div class="d3-title-r">${S.scopeSeg(ctx)}</div></header>
        ${list.map(rib).join('')}
      </div>`;
    },
    service(ctx) {
      const s = svc(ctx.state.serviceId);
      const p = C.serviceParts(s, ctx);
      const lede =
        s.id === 'power'
          ? `${esc(s.provider)}. ${p.stats[0].value} last financial year, about ${p.stats[1].value} a month. The latest bill used 5% more than the same time last year, and still sits 7% under the limit you set.`
          : `${esc(s.provider)}, ${esc(s.cadence.toLowerCase())}. ${p.stats[0].value} last financial year, about ${p.stats[1].value} a month. ${s.owner ? 'Only you see this service.' : `${esc(data.memberById[s.payer].name)} pays it and the household splits it.`}`;
      return `<div class="scr d3-service">${S.back(ctx)}
        <header class="d3-title"><div class="eyebrow">${esc(s.type)} · ${esc(s.cadence)}</div><h1>${esc(s.name)}</h1><p class="lede">${lede}</p>${p.chips}</header>
        <div class="d3-cols">
          <div class="d3-main">
            <section class="g">${C.sectionHead(p.chartTitle)}${p.chart}</section>
            <section class="g d3-every">${C.sectionHead('Every bill', `<span class="muted">${p.billsCount} bills</span>`)}<div class="d3-tl">${p.bills}</div></section>
          </div>
          <aside class="d3-aside">
            <section class="g d3-nums">${p.stats.map((x) => `<div><span class="muted small">${esc(x.label)}</span><b>${x.value}</b><span class="muted small">${esc(x.sub)}</span></div>`).join('')}</section>
            ${p.notice}
            <section class="g">${C.sectionHead('Compared with')}${p.compare}</section>
            ${p.split ? `${p.split ? `<section class="g">${p.split}</section>` : ''}` : ''}
            ${p.coming ? `<section class="g">${C.sectionHead('Coming up', '<span class="muted">Estimates</span>')}${p.coming}</section>` : ''}
          </aside>
        </div>
      </div>`;
    },
    bills(ctx) {
      return `<div class="scr d3-billsl">
        <header class="d3-title"><h1>Bills</h1><p>Filed by the month each bill belongs to, not the day it arrived.</p><div class="d3-title-r">${S.billFilter(ctx)}</div></header>
        ${S.billGroups(ctx).map((g) => `<section class="d3-month"><div class="d3-month-h"><h2>${esc(fmt.month(g.key + '-01'))}</h2><span class="muted">${g.key.slice(0, 4)} · ${g.bills.length} ${g.bills.length === 1 ? 'bill' : 'bills'} · ${fmt.money(g.total, true)}</span></div><div class="g rows">${g.bills.map((b) => C.billRow(b, ctx, { share: true })).join('')}</div></section>`).join('')}
      </div>`;
    },
    bill(ctx) {
      const b = data.billById[ctx.state.billId];
      const p = C.billParts(b, ctx);
      return `<div class="scr d3-bill">${S.back(ctx)}
        <div class="d3-bill-grid">
          <div class="d3-doc">${C.paper(b, ctx)}<section class="g">${p.files}</section></div>
          <div class="d3-bill-body">
            <section class="g d3-bill-hero">${p.hero}${p.actions}</section>
            ${p.notice}
            <section class="g">${C.sectionHead('Details')}${p.details}</section>
            ${p.split ? `<section class="g">${p.split}</section>` : ''}
            ${p.plan ? `<section class="g">${p.plan}</section>` : ''}
            ${p.figures ? `<section class="g">${p.figures}</section>` : ''}
          </div>
        </div>
      </div>`;
    },
    inbox(ctx) {
      return `<div class="scr d3-inbox"><header class="d3-title"><h1>Inbox</h1><p>Forward a bill from your own email and it’s analysed and filed within a minute.</p></header>
        <section class="g d3-addr">${C.addressCard()}</section><div class="filters">${S.inboxFilter(ctx)}</div>${S.inboxList(ctx, { withBill: true })}</div>`;
    },
    money(ctx) {
      const p = S.moneyParts(ctx);
      return `<div class="scr d3-money"><header class="d3-title"><h1>Money</h1><p>Who owes whom in the house. The app keeps count; the money moves however you like.</p></header>
        <div class="d3-money-hero g">${p.hero}</div>
        <div class="d3-people">${p.people.replace(/class="person"/g, 'class="g person"')}</div>
        <div class="d3-money-cols"><section class="g">${p.out}</section><section class="g">${p.in}</section>${p.between ? `<section class="g">${p.between}</section>` : ''}</div>
      </div>`;
    },
  };

  /* ======================================================================
     4 · WALLET — services as a stack of tinted cards, bills as passes
     ====================================================================== */
  const pass = (b, ctx, o = {}) => {
    const s = svc(b.service);
    const st = data.billStatus(b);
    return `<button class="pass${o.open ? ' open' : ''}" data-go="bill:${b.id}" style="--svc:${C.col(ctx, s)}">
      <span class="pass-top"><span class="pass-t">${o.withService ? `${icon(s.icon, 16)} ${esc(s.name)}` : esc(fmt.range(b.from, b.to))}</span><span class="pass-amt">${fmt.money(C.billAmount(b))}</span></span>
      <span class="pass-bot"><span class="muted small">${esc(o.withService ? fmt.range(b.from, b.to) : C.billSubIn(b))}</span>${C.statusChip(st)}</span>
      ${b.plan ? `<span class="pass-dots">${C.instDots(b)}</span>` : ''}
    </button>`;
  };
  const d4 = {
    homeHead(ctx) {
      const g = greeting(ctx);
      return `<div class="hh d4-hh"><div><p class="eyebrow">Tuesday 29 September</p><h1>Home</h1></div><p>${esc(g.line)}</p></div>`;
    },
    services(ctx) {
      const list = visibleServices(ctx);
      const sel = list.find((s) => s.id === ctx.state.serviceId) || list[0];
      const cards = list
        .map((s, i) => {
          const b0 = latestOf(s.id);
          return `<button class="wcard${s === sel ? ' sel' : ''}" data-act="pickService" data-v="${s.id}" style="--svc:${C.col(ctx, s)};--i:${i}">
            <span class="wcard-top">${icon(s.icon, 20)}<b>${esc(s.name)}</b><span class="wcard-amt">${fmt.money(C.billAmount(b0))}</span></span>
            <span class="wcard-mid"><span>${esc(s.provider)}</span><span>${esc(s.cadence)}</span></span>
            <span class="wcard-bot"><span>${data.billsFor(s.id).length} bills</span>${s.owner ? '<span class="wcard-tag">Yours</span>' : `<span>${esc(data.memberById[s.payer].name)} pays</span>`}</span>
          </button>`;
        })
        .join('');
      const bl = data.billsFor(sel.id);
      return `<div class="scr d4-services">
        ${S.head('Services', 'Tap a card to see its bills.', S.scopeSeg(ctx), 'large')}
        <div class="d4-wallet">
          <div class="wstack" style="--n:${list.length}">${cards}</div>
          <section class="g d4-open" style="--svc:${C.col(ctx, sel)}">
            <div class="d4-open-h">${C.disc(sel, ctx, 'md')}<div><b>${esc(sel.name)}</b><span class="muted">${esc(sel.provider)} · ${bl.length} bills</span></div>${C.btn('Open', { kind: 'primary', size: 'sm', icon: 'chevron-right', go: `service:${sel.id}` })}</div>
            <div class="passes">${bl.slice(0, 6).map((b, i) => pass(b, ctx, { open: i === 0 })).join('')}</div>
            ${bl.length > 6 ? `<button class="d1-all" data-go="service:${sel.id}"><span>All ${bl.length} bills</span>${icon('chevron-right', 16)}</button>` : ''}
          </section>
        </div>
      </div>`;
    },
    service(ctx) {
      const s = svc(ctx.state.serviceId);
      const p = C.serviceParts(s, ctx);
      const b0 = p.latest;
      const bl = data.billsFor(s.id);
      return `<div class="scr d4-service">${S.back(ctx)}
        <div class="d4-svc-top">
          <div class="wcard big sel" style="--svc:${C.col(ctx, s)}">
            <span class="wcard-top">${icon(s.icon, 26)}<b>${esc(s.name)}</b><span class="wcard-amt">${fmt.money(C.billAmount(b0))}</span></span>
            <span class="wcard-mid"><span>${esc(s.provider)}</span><span>${esc(s.cadence)}</span></span>
            <span class="wcard-bot"><span>${esc(data.billStatus(b0).label)}</span>${s.owner ? '<span class="wcard-tag">Yours</span>' : `<span>${esc(data.memberById[s.payer].name)} pays</span>`}</span>
          </div>
          <div class="d4-stats">${p.stats.map((x) => `<div class="g tstat" style="--svc:${C.col(ctx, s)}"><span class="muted small">${esc(x.label)}</span><b>${x.value}</b><span class="muted small">${esc(x.sub)}</span></div>`).join('')}</div>
        </div>
        <div class="d4-cols">
          <section class="g d4-bills" style="--svc:${C.col(ctx, s)}">${C.sectionHead('Bills', `<span class="muted">${bl.length} bills</span>`)}<div class="passes">${bl.map((b, i) => pass(b, ctx, { open: i === 0 })).join('')}</div></section>
          <div class="d4-side">
            <section class="g">${C.sectionHead(p.chartTitle)}${p.chart}</section>
            ${p.notice}
            <section class="g">${C.sectionHead('Compared with')}${p.compare}</section>
            ${p.split ? `${p.split ? `<section class="g">${p.split}</section>` : ''}` : ''}
            ${p.coming ? `<section class="g">${C.sectionHead('Coming up', '<span class="muted">Estimates</span>')}${p.coming}</section>` : ''}
          </div>
        </div>
      </div>`;
    },
    bills(ctx) {
      return `<div class="scr d4-billsl">
        ${S.head('Bills', 'Filed by the month each bill belongs to.', S.billFilter(ctx), 'large')}
        ${S.billGroups(ctx).map((g) => `<section class="d4-grp">${groupHead(g)}<div class="passes grid">${g.bills.map((b) => pass(b, ctx, { withService: true })).join('')}</div></section>`).join('')}
      </div>`;
    },
    bill(ctx) {
      const b = data.billById[ctx.state.billId];
      const s = svc(b.service);
      const p = C.billParts(b, ctx);
      const st = data.billStatus(b);
      const ins = data.nextInstalment(b);
      const list = b.personal ? [] : ins ? ins.shares : b.shares;
      const ref = `RIV-${s.name.slice(0, 4).toUpperCase()}-${fmt.mon(b.issued).toUpperCase()}`;
      return `<div class="scr d4-bill">${S.back(ctx)}
        <div class="d4-bill-grid">
          <article class="billpass" style="--svc:${C.col(ctx, s)}">
            <div class="bpp-top">${p.id}${C.statusChip(st)}</div>
            <div class="bpp-amt">${p.amount}${p.line}</div>
            <div class="bpp-kv">
              <div><span>Period</span><b>${esc(fmt.range(b.from, b.to))}</b></div>
              <div><span>${ins ? 'Instalment due' : 'Due'}</span><b>${fmt.date(st.due, true)}</b></div>
              <div><span>Issued</span><b>${fmt.date(b.issued, true)}</b></div>
              <div><span>Invoice</span><b class="mono">${esc(b.invoice)}</b></div>
            </div>
            <div class="perf"></div>
            ${list.length ? `<div class="stubs">${list.map((sh) => `<div class="stub${sh.paid ? ' paid' : ''}${sh.payer ? ' payer' : ''}" style="--m:${C.col(ctx, data.memberById[sh.member])}">${C.avatar(data.memberById[sh.member], ctx, 'sm')}<b>${fmt.money(sh.amount)}</b><span>${sh.payer ? 'Pays the bill' : sh.paid ? 'Paid back' : 'To pay back'}</span></div>`).join('')}</div>` : '<div class="stubs"><div class="stub"><span>Just yours · not split</span></div></div>'}
            <div class="bpp-ref"><span class="muted small">Payment reference</span><b class="mono">${ref}</b><i class="barcode"></i></div>
          </article>
          <div class="d4-bill-side">
            <section class="g">${p.actions}</section>
            ${p.notice}
            ${p.plan ? `<section class="g">${p.plan}</section>` : ''}
            ${p.split ? `<section class="g">${p.split}</section>` : ''}
            <section class="g">${p.files}</section>
            ${p.figures ? `<section class="g">${p.figures}</section>` : ''}
            <section class="g">${C.sectionHead('Details')}${p.details}</section>
          </div>
        </div>
      </div>`;
    },
    inbox(ctx) {
      return `<div class="scr d4-inbox">${S.head('Inbox', 'Bills, receipts and emails, analysed as they arrive.', C.btn('Upload', { kind: 'primary', icon: 'upload', act: 'toast', attrs: 'data-msg="Choose a PDF or a photo of a bill"' }), 'large')}
        <section class="g d4-addr">${C.addressCard()}</section><div class="filters">${S.inboxFilter(ctx)}</div>${S.inboxList(ctx)}</div>`;
    },
    money(ctx) {
      const p = S.moneyParts(ctx);
      return `<div class="scr d4-money">${S.head('Money', 'Balances between housemates.', '', 'large')}
        <div class="d4-money-top"><section class="g d4-mh">${p.hero}</section><div class="d4-people">${p.people.replace(/class="person"/g, 'class="g person"')}</div></div>
        <div class="d4-money-cols"><section class="g">${p.out}</section><section class="g">${p.in}</section>${p.between ? `<section class="g">${p.between}</section>` : ''}</div>
      </div>`;
    },
  };

  /* ======================================================================
     5 · DESK — macOS / iPadOS split view: lists, panes, an inspector
     ====================================================================== */
  const srow = (s, ctx, on) => {
    const b0 = latestOf(s.id);
    return `<button class="lrow${on ? ' on' : ''}" data-go="service:${s.id}">${C.disc(s, ctx, 'sm')}<span class="lrow-t"><b>${esc(s.name)}</b><span class="muted">${esc(s.provider)}</span></span><span class="lrow-e"><b>${fmt.money(C.billAmount(b0), true)}</b><span class="dot t-${data.billStatus(b0).tone}"></span></span></button>`;
  };
  const d5BillPage = (b, ctx) => {
    const p = C.billParts(b, ctx);
    return `<div class="insp">
      <div class="insp-hero" style="--svc:${C.col(ctx, svc(b.service))}">${p.hero}${p.actions}</div>
      ${p.notice}
      <div class="insp-sec">${C.sectionHead('Details')}${p.details}</div>
      ${p.split ? `<div class="insp-sec">${p.split}</div>` : ''}
      ${p.plan ? `<div class="insp-sec">${p.plan}</div>` : ''}
      <div class="insp-sec">${p.files}</div>
      ${p.figures ? `<div class="insp-sec">${p.figures}</div>` : ''}
    </div>`;
  };
  const d5ServicePane = (s, ctx, selBill) => {
    const p = C.serviceParts(s, ctx);
    const bl = data.billsFor(s.id);
    return `<div class="svc-pane">
      <div class="svc-pane-h" style="--svc:${C.col(ctx, s)}">${p.head}${p.chips}</div>
      ${p.statsHtml}
      <div class="insp-sec">${C.sectionHead(p.chartTitle)}${p.chart}</div>
      <div class="insp-sec">${C.sectionHead(`Bills · ${bl.length}`)}<div class="rows tight">${bl.map((b) => C.billRow(b, ctx, { inService: true, noDisc: true, cls: selBill && selBill.id === b.id ? 'on' : '' })).join('')}</div></div>
      <div class="insp-sec">${C.sectionHead('Compared with')}${p.compare}</div>
      ${p.split ? `${p.split ? `<div class="insp-sec">${p.split}</div>` : ''}` : ''}
      ${p.coming ? `<div class="insp-sec">${C.sectionHead('Coming up', '<span class="muted">Estimates</span>')}${p.coming}</div>` : ''}
    </div>`;
  };
  const d5 = {
    sidebar: true,
    homeHead(ctx) {
      const g = greeting(ctx);
      return `<div class="hh d5-hh"><div><h1>${g.hi}</h1><p>${esc(g.line)}</p></div></div>`;
    },
    services(ctx, focusService) {
      const list = visibleServices(ctx);
      const sel = svc(ctx.state.serviceId) && list.includes(svc(ctx.state.serviceId)) ? svc(ctx.state.serviceId) : list[0];
      const selBill = data.billById[ctx.state.billId] && data.billById[ctx.state.billId].service === sel.id ? data.billById[ctx.state.billId] : latestOf(sel.id);
      const listPane = `<section class="g pane pane-list">
        <div class="pane-h"><b>Services</b>${S.scopeSeg(ctx)}</div>
        <div class="lrows">${list.filter((s) => !s.owner).map((s) => srow(s, ctx, s === sel)).join('')}${list.some((s) => s.owner) ? `<div class="lgroup">Just yours</div>${list.filter((s) => s.owner).map((s) => srow(s, ctx, s === sel)).join('')}` : ''}</div>
      </section>`;
      if (ctx.device === 'phone') return focusService ? `<div class="scr d5-phone">${S.back(ctx)}<section class="g pane">${d5ServicePane(sel, ctx)}</section></div>` : `<div class="scr d5-phone">${S.head('Services', '')}${listPane}</div>`;
      return `<div class="scr d5-split three">${listPane}<section class="g pane pane-main">${d5ServicePane(sel, ctx, selBill)}</section><section class="g pane pane-insp">${d5BillPage(selBill, ctx)}</section></div>`;
    },
    service(ctx) {
      return d5.services(ctx, true);
    },
    bills(ctx, focusBill) {
      const groups = S.billGroups(ctx);
      const sel = data.billById[ctx.state.billId] || groups[0].bills[0];
      const listPane = `<section class="g pane pane-list wide">
        <div class="pane-h"><b>Bills</b>${S.billFilter(ctx)}</div>
        <div class="lrows">${groups.map((g) => `<div class="lgroup">${esc(g.label)} <span class="muted">${fmt.money(g.total, true)}</span></div>${g.bills.map((b) => C.billRow(b, ctx, { cls: b === sel ? 'on' : '' })).join('')}`).join('')}</div>
      </section>`;
      if (ctx.device === 'phone') return focusBill ? `<div class="scr d5-phone">${S.back(ctx)}<section class="g pane">${d5BillPage(sel, ctx)}</section></div>` : `<div class="scr d5-phone">${listPane}</div>`;
      return `<div class="scr d5-split two">${listPane}<section class="g pane pane-insp grow">${d5BillPage(sel, ctx)}</section></div>`;
    },
    bill(ctx) {
      return d5.bills(ctx, true);
    },
    inbox(ctx) {
      const groups = S.inboxGroups(ctx);
      const sel = data.docs.find((d) => d.id === ctx.state.docId) || groups[0].docs[0];
      const b = sel && sel.bill ? data.billById[sel.bill] : null;
      const listPane = `<section class="g pane pane-list wide">
        <div class="pane-h"><b>Inbox</b>${S.inboxFilter(ctx)}</div>
        <div class="lrows">${groups.map((g) => `<div class="lgroup">${esc(g.label)}</div>${g.docs.map((d) => C.docRow(d, ctx).replace('class="doc-row', `data-act="pickDoc" data-v="${d.id}" class="doc-row${d === sel ? ' on' : ''}`).replace(/data-go="[^"]*"/, '')).join('')}`).join('')}</div>
        <div class="pane-foot">${C.addressCard()}</div>
      </section>`;
      const preview = sel
        ? `<section class="g pane pane-insp grow"><div class="insp">
            <div class="doc-prev-h"><div><div class="eyebrow">${esc({ bill: 'Bill', receipt: 'Receipt', other: 'Email' }[sel.kind])} · ${esc(sel.how)}</div><h2>${esc(sel.title)}</h2></div>${C.analysed()}</div>
            <div class="doc-prev">${b ? C.paper(b, ctx) : `<div class="paper mail"><div class="paper-top"><b>${esc(sel.from || sel.file)}</b></div><div class="paper-lines">${'<i></i>'.repeat(7)}</div></div>`}</div>
            ${b ? `<div class="insp-sec">${C.sectionHead('Filed as')}${C.billRow(b, ctx)}</div>` : sel.needs ? `<div class="insp-sec">${C.sectionHead('Confirm one detail')}${C.docSheet(sel, ctx).replace(/<div class="sheet-head">[\s\S]*?<\/div><div class="sheet-row">/, '<div class="sheet-row">')}</div>` : `<div class="insp-sec"><p class="muted">Not a bill. ${C.btn('It’s a bill', { kind: 'glass', size: 'sm', act: 'toast', attrs: 'data-msg="Analysing it again as a bill"' })}</p></div>`}
          </div></section>`
        : '';
      if (ctx.device === 'phone') return `<div class="scr d5-phone">${listPane}</div>`;
      return `<div class="scr d5-split two">${listPane}${preview}</div>`;
    },
    money(ctx) {
      const p = S.moneyParts(ctx);
      return `<div class="scr d5-money">${S.head('Money', 'Balances between housemates.')}
        <div class="d5-money-grid"><section class="g d5-mh">${p.hero}</section>${p.people.replace(/class="person"/g, 'class="g person"')}</div>
        <div class="d5-money-cols"><section class="g">${p.out}</section><section class="g">${p.in}</section>${p.between ? `<section class="g">${p.between}</section>` : ''}</div>
      </div>`;
    },
  };

  /* ---------- the directions ---------- */
  HU.directions = [
    {
      id: 1,
      key: 'springboard',
      name: 'Springboard',
      pack: 'liquid',
      chrome: 'float',
      tagline: 'Liquid glass widgets floating straight on the scene, like an iPhone home screen.',
      idea: 'The most Apple of the five. No frame around the app: widgets, capsules and sheets float on the colour scene. Services are cards that hold their three latest bills; a bill opens as one tall glass sheet.',
      good: ['Feels native on iPhone and iPad', 'Widgets are the whole Home', 'Fewest borders and boxes'],
      watch: ['Text sits closer to the scene, so contrast needs care', 'Less dense on a big desktop'],
      ...d1,
      home: {
        density: 'standard',
        desktop: [
          [['month', 5, 1], ['weather', 2, 1], ['owes', 1, 1], ['nextdue', 2, 2], ['trend', 2, 1], ['settled', 1, 1]],
          [['services', 3, 2], ['notices', 2, 1], ['usage', 1, 1], ['inbox', 1, 1], ['forecast', 3, 1], ['plan', 1, 1], ['mine', 1, 1]],
        ],
        phone: [
          [['month', 2, 1], ['nextdue', 2, 2], ['weather', 1, 1], ['owes', 1, 1]],
          [['trend', 2, 1], ['services', 2, 2], ['settled', 1, 1], ['usage', 1, 1]],
          [['notices', 2, 1], ['inbox', 2, 1], ['plan', 1, 1], ['mine', 1, 1], ['forecast', 2, 1]],
        ],
      },
    },
    {
      id: 2,
      key: 'console',
      name: 'Console',
      pack: 'instrument',
      chrome: 'window',
      tagline: 'One big frosted window of dense instruments. Services become a month-by-month bill matrix.',
      idea: 'The evolution of today’s app: a single frosted window, instrument tiles everywhere, tables where they help. The Services page is a matrix: every service is a row and every bill a block across the months it covers.',
      good: ['Most information per screen', 'See every bill of every service at once', 'Closest to today, so the least relearning'],
      watch: ['Busiest of the five', 'The matrix scrolls sideways on a phone'],
      ...d2,
      home: {
        density: { desktop: 'dense', tabletL: 'dense', tabletP: 'dense', phone: 'standard' },
        desktop: [
          [['month', 3, 2], ['trend', 3, 2], ['nextdue', 2, 2], ['owes', 2, 1], ['usage', 1, 1], ['settled', 1, 1], ['weather', 2, 1], ['forecast', 2, 1]],
          [['services', 3, 2], ['notices', 3, 1], ['inbox', 2, 2], ['setaside', 1, 1], ['plan', 2, 1], ['mine', 1, 1]],
        ],
        phone: [
          [['month', 2, 1], ['nextdue', 2, 2], ['usage', 1, 1], ['settled', 1, 1], ['owes', 2, 1]],
          [['trend', 2, 2], ['weather', 2, 1], ['forecast', 2, 1], ['plan', 1, 1], ['mine', 1, 1]],
          [['services', 2, 2], ['notices', 2, 1], ['inbox', 2, 2]],
        ],
      },
    },
    {
      id: 3,
      key: 'almanac',
      name: 'Almanac',
      pack: 'frost',
      chrome: 'plain',
      tagline: 'Calm and editorial. Big type, full sentences, services as a year of bills on one line.',
      idea: 'Reads like a well-set household almanac. Fewer, larger widgets; headings that say what’s happening in a sentence; services as ribbons of bills across the year; a bill page laid out like the document itself.',
      good: ['Easiest for non-technical housemates', 'Sentences explain the numbers', 'Calmest on a wall display'],
      watch: ['Fewer widgets fit per page', 'Longer pages to scroll'],
      ...d3,
      home: {
        density: 'comfy',
        desktop: [
          [['month', 2, 2], ['weather', 2, 1], ['nextdue', 2, 1], ['owes', 2, 1], ['notices', 2, 1]],
          [['trend', 4, 2], ['forecast', 2, 1], ['settled', 1, 1], ['usage', 1, 1]],
          [['services', 2, 2], ['inbox', 2, 2], ['plan', 2, 1], ['mine', 2, 1]],
        ],
        phone: [
          [['month', 2, 2], ['nextdue', 2, 1]],
          [['weather', 2, 1], ['owes', 2, 1], ['notices', 2, 1]],
          [['trend', 2, 2], ['settled', 1, 1], ['usage', 1, 1]],
          [['services', 2, 2], ['plan', 1, 1], ['mine', 1, 1]],
        ],
      },
    },
    {
      id: 4,
      key: 'wallet',
      name: 'Wallet',
      pack: 'tint',
      chrome: 'large',
      tagline: 'Services as a stack of tinted cards. Every bill is a pass you can open.',
      idea: 'Borrowed from Apple Wallet. Each service is a card in its own colour; pick one and its bills fan out as passes. The bill page is a pass with tear-off stubs for each person’s share and the payment reference.',
      good: ['Services literally hold their bills', 'Instantly recognisable colours per service', 'Playful without being childish'],
      watch: ['Colour-heavy, so the combos matter more', 'Card stack takes space on desktop'],
      ...d4,
      home: {
        density: 'standard',
        desktop: [
          [['services', 3, 2], ['month', 2, 1], ['nextdue', 2, 1], ['owes', 2, 1], ['weather', 2, 1], ['settled', 1, 1]],
          [['trend', 3, 2], ['plan', 2, 1], ['mine', 2, 1], ['notices', 2, 1], ['usage', 1, 1], ['inbox', 2, 1]],
        ],
        phone: [
          [['services', 2, 2], ['month', 2, 1], ['nextdue', 1, 1], ['owes', 1, 1]],
          [['weather', 2, 1], ['trend', 2, 2], ['settled', 1, 1], ['plan', 1, 1]],
          [['notices', 2, 1], ['mine', 1, 1], ['usage', 1, 1], ['inbox', 2, 1]],
        ],
      },
    },
    {
      id: 5,
      key: 'desk',
      name: 'Desk',
      pack: 'vibrancy',
      chrome: 'desk',
      tagline: 'A Mac and iPad app: sidebar, lists and an inspector, side by side.',
      idea: 'Built like Mail or Finder. Services, their bills and the open bill sit side by side in panes on a big screen, and collapse to one pane at a time on a phone. The bill page is the inspector pane, identical wherever it opens.',
      good: ['Fastest for whoever manages the bills', 'Nothing opens on top of anything', 'Great with a keyboard and trackpad'],
      watch: ['Most “software-like” of the five', 'Needs the width of a tablet or bigger'],
      ...d5,
      home: {
        density: 'standard',
        desktop: [
          [['month', 3, 1], ['owes', 2, 1], ['nextdue', 2, 2], ['trend', 3, 2]],
          [['services', 3, 2], ['inbox', 2, 2], ['notices', 3, 1], ['settled', 1, 1], ['plan', 1, 1]],
          [['weather', 2, 1], ['forecast', 3, 1], ['usage', 1, 1], ['mine', 1, 1], ['setaside', 2, 1]],
        ],
        phone: [
          [['month', 2, 1], ['owes', 2, 1], ['nextdue', 2, 2]],
          [['trend', 2, 2], ['settled', 1, 1], ['plan', 1, 1], ['inbox', 2, 1]],
          [['services', 2, 2], ['notices', 2, 1], ['weather', 1, 1], ['mine', 1, 1]],
        ],
      },
    },
    {
      id: 6,
      key: 'almanac2',
      name: 'Almanac 2',
      pack: 'frostglass',
      chrome: 'column',
      navStyle: 'column',
      navDefault: 'left',
      paletteDefault: 'harbour',
      tagline: 'Almanac’s calm type with clearer glass, a floating nav column and a fuller widget Home.',
      idea: 'Almanac taken further: its sentences, year ribbons and document-style bill page, in Frost type on clearer, Apple-style glass. The nav is a floating column down the left, and Home is a denser 6 × 4 grid with a due-dates calendar, a tile per service, recent activity and a few sentences on the week. Opens in Harbour with the column on the left.',
      good: ['Calm to read, with a full Home', 'Nav always in reach, never over content', 'Keeps the Almanac pages you liked'],
      watch: ['The column becomes a slim rail on iPad', 'On iPhone the nav moves to a bottom bar'],
      ...d3,
      homeHead() {
        const wx = data.weather;
        return `<div class="hh d6-hh"><div><h1>Hey, Alex.</h1><p>Tuesday 29 September${wx ? ` · ${esc(wx.place)}, ${wx.now.t}° and ${esc(wx.now.sky.toLowerCase())}` : ''}</p></div></div>`;
      },
      homeRev: 2,
      home: {
        density: { desktop: 'standard', tabletL: 'standard', tabletP: 'comfy', phone: 'standard' },
        desktop: [
          [['month', 2, 2], ['week', 3, 1], ['nextdue', 2, 1], ['weather', 1, 1], ['owes', 2, 1], ['services', 3, 1]],
          [['calendar', 2, 2], ['activity', 3, 2], ['forecast', 3, 1], ['season', 2, 1]],
        ],
        tabletP: [
          [['month', 2, 2], ['weather', 1, 1], ['nextdue', 1, 1], ['week', 3, 1], ['owes', 2, 1], ['settled', 1, 1]],
          [['services', 3, 1], ['calendar', 2, 2], ['actions', 1, 1], ['season', 1, 1], ['activity', 3, 1]],
        ],
        phone: [
          [['month', 2, 2], ['week', 2, 1], ['nextdue', 2, 1]],
          [['owes', 2, 1], ['services', 2, 2], ['weather', 1, 1], ['actions', 1, 1]],
          [['calendar', 2, 2], ['activity', 2, 2]],
        ],
      },
    },
  ];
  HU.directions.forEach((d) => (d.settings = d.settings || ((ctx) => S.settings(ctx))));
  HU.directionById = Object.fromEntries(HU.directions.map((d) => [d.id, d]));
})();
