/*
  Shared components. Markup is the same in every component pack; a pack only
  changes tokens and finishes. That is what makes packs swappable across the
  five directions.

  Rules baked in here:
  - A document's only processing word is "Analysed".
  - A bill has one row (billRow) and one page (billParts) everywhere.
  - Instalments live inside their bill; a bill is never listed twice.
*/
(function () {
  const HU = (window.HU = window.HU || {});
  const { data, fmt, icon } = HU;
  const C = (HU.C = {});
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  C.esc = esc;

  const dark = (ctx) => ctx && ctx.mode === 'dark';
  C.col = (ctx, e) => e.colour[dark(ctx) ? 1 : 0];
  const svcOf = (b) => data.serviceById[b.service];
  const who = (id) => (id === data.you ? 'You' : data.memberById[id].name);
  C.who = who;
  C.whoLow = (id) => (id === data.you ? 'you' : data.memberById[id].name);

  /* ---------- atoms ---------- */
  C.disc = (svc, ctx, size) =>
    `<span class="disc disc-${size || 'md'}" style="--svc:${C.col(ctx, svc)}">${icon(svc.icon, size === 'lg' ? 28 : size === 'sm' ? 17 : 21)}</span>`;
  C.avatar = (m, ctx, size) =>
    `<span class="av av-${size || 'md'}" style="--m:${C.col(ctx, m)}" title="${esc(m.name)}">${esc(m.name[0])}</span>`;
  C.avatars = (ids, ctx, size) =>
    `<span class="avs">${ids.map((id) => C.avatar(data.memberById[id], ctx, size || 'sm')).join('')}</span>`;
  C.chip = (label, tone, ic) =>
    `<span class="chip t-${tone || 'neutral'}">${ic ? icon(ic, 13) : ''}<span>${esc(label)}</span></span>`;
  C.analysed = () => C.chip('Analysed', 'analysed', 'check');
  /** The only processing words: Analysed, Waiting to be analysed, Couldn't be analysed. */
  C.docChip = (d) =>
    d.status === 'waiting' ? C.chip('Waiting to be analysed', 'neutral', 'clock') : d.status === 'failed' ? C.chip('Couldn’t be analysed', 'bad', 'alert') : C.analysed();
  const toneIcon = { ok: 'check', warn: 'clock', bad: 'alert', neutral: 'calendar', info: 'info' };
  C.statusChip = (st) => C.chip(st.label, st.tone, toneIcon[st.tone]);
  C.btn = (label, o = {}) =>
    `<button class="btn btn-${o.kind || 'glass'}${o.size ? ' btn-' + o.size : ''}${o.cls ? ' ' + o.cls : ''}" ${o.go ? `data-go="${o.go}"` : ''} ${o.act ? `data-act="${o.act}"` : ''} ${o.attrs || ''}>${o.icon ? icon(o.icon, o.size === 'sm' ? 15 : 18) : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
  C.ibtn = (ic, label, o = {}) =>
    `<button class="ibtn${o.cls ? ' ' + o.cls : ''}" aria-label="${esc(label)}" title="${esc(label)}" ${o.go ? `data-go="${o.go}"` : ''} ${o.act ? `data-act="${o.act}"` : ''} ${o.attrs || ''}>${icon(ic, o.size || 20)}${o.badge ? `<i class="badge">${o.badge}</i>` : ''}</button>`;
  C.seg = (opts, active, act, cls) =>
    `<div class="seg${cls ? ' ' + cls : ''}" role="group">${opts
      .map(([v, label, ic]) => `<button class="seg-b" aria-pressed="${v === active}" data-act="${act}" data-v="${v}">${ic ? icon(ic, 16) : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`)
      .join('')}</div>`;
  C.toggle = (on, label, act) =>
    `<button class="toggle" role="switch" aria-checked="${!!on}" ${act ? `data-act="${act}"` : ''}><i></i><span class="sr">${esc(label || '')}</span></button>`;
  C.search = (ph, o = {}) =>
    `<label class="search${o.cls ? ' ' + o.cls : ''}">${icon('search', 17)}<input type="search" placeholder="${esc(ph || 'Search bills, services, amounts')}" aria-label="Search" ${o.id ? `id="${o.id}"` : ''}></label>`;
  C.money = (minor, cls) => {
    const [a, b] = fmt.moneyParts(minor);
    return `<span class="fig${cls ? ' ' + cls : ''}">${a}<small>${b}</small></span>`;
  };
  C.eyebrow = (t) => `<div class="eyebrow">${esc(t)}</div>`;
  C.progress = (f, tone) =>
    `<div class="progress${tone ? ' t-' + tone : ''}"><i style="width:${Math.max(0, Math.min(1, f)) * 100}%"></i></div>`;
  C.kv = (rows) =>
    `<dl class="kv">${rows
      .filter(Boolean)
      .map(([k, v, cls]) => `<div class="kv-r${cls ? ' ' + cls : ''}"><dt>${esc(k)}</dt><dd>${v}</dd></div>`)
      .join('')}</dl>`;
  C.sectionHead = (title, right) =>
    `<div class="sec-head"><h3>${esc(title)}</h3>${right ? `<div class="sec-right">${right}</div>` : ''}</div>`;
  C.notice = (n, o = {}) =>
    `<button class="notice t-${n.tone}${o.cls ? ' ' + o.cls : ''}" data-go="${n.go}"><span class="notice-ic">${icon(n.icon, 18)}</span><span class="notice-t"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></span>${icon('chevron-right', 16, 'chev')}</button>`;

  /* ---------- the one bill row ---------- */
  C.billSub = (b) => {
    const svc = svcOf(b);
    if (b.plan && b.plan.mode === 'instalments') {
      const ins = data.nextInstalment(b);
      return ins
        ? `Instalment ${ins.n} of ${b.plan.instalments.length} · ${fmt.money(b.amount)} for the year`
        : `Paid in ${b.plan.instalments.length} instalments · ${fmt.range(b.from, b.to)}`;
    }
    const parts = [fmt.range(b.from, b.to)];
    if (b.usage && svc.unit) parts.push(`${fmt.num(b.usage)} ${svc.unit}`);
    return parts.join(' · ');
  };
  C.billSubIn = (b) => {
    const svc = svcOf(b);
    if (b.plan) return C.billSub(b);
    return `Issued ${fmt.date(b.issued)}${b.usage && svc.unit ? ' · ' + fmt.num(b.usage) + ' ' + svc.unit : ''}`;
  };
  C.instDots = (b) =>
    b.plan
      ? `<span class="inst-dots" aria-label="Instalments">${b.plan.instalments
          .map((i) => `<i class="${i.paid ? 'done' : data.nextInstalment(b) === i ? 'next' : ''}"></i>`)
          .join('')}</span>`
      : '';
  C.billAmount = (b) => {
    const ins = data.nextInstalment(b);
    return ins ? ins.amount : b.amount;
  };
  C.billRow = (b, ctx, o = {}) => {
    const svc = svcOf(b);
    const st = data.billStatus(b);
    const title = o.inService ? (b.plan ? `${b.from.slice(0, 4)}–${b.to.slice(2, 4)} notice` : fmt.range(b.from, b.to)) : svc.name;
    const sub = o.inService ? C.billSubIn(b) : C.billSub(b);
    const mine = b.shares.find((s) => s.member === data.you);
    const tags = [
      b.unusual ? C.chip('Unusual', 'warn', 'trend-up') : '',
      b.personal ? C.chip('Yours', 'info', 'user') : '',
    ].join('');
    return `<button class="bill-row${o.cls ? ' ' + o.cls : ''}" data-go="bill:${b.id}" style="--svc:${C.col(ctx, svc)}">
      ${o.noDisc ? '' : C.disc(svc, ctx, 'sm')}
      <span class="br-main">
        <span class="br-title">${esc(title)}${!o.inService && !o.noProvider ? `<span class="br-prov">${esc(svc.provider)}</span>` : ''}</span>
        <span class="br-sub">${esc(sub)}</span>
        ${b.plan || tags ? `<span class="br-tags">${C.instDots(b)}${tags}</span>` : ''}
      </span>
      <span class="br-end">
        <span class="br-amt">${fmt.money(C.billAmount(b))}</span>
        ${o.share && mine && !b.personal ? `<span class="br-share">You ${fmt.money(mine.amount)}</span>` : ''}
        ${C.statusChip(st)}
      </span>
    </button>`;
  };

  /* ---------- documents ---------- */
  const docIcon = { pdf: 'file', scan: 'photo', email: 'mail', photo: 'photo' };
  C.docRow = (d, ctx, o = {}) => {
    const b = d.bill ? data.billById[d.bill] : null;
    const go = b ? `bill:${b.id}` : `sheet:doc:${d.id}`;
    const kind = { bill: 'Bill', receipt: 'Receipt', other: 'Email', notice: 'Payment notice' }[d.kind];
    return `<button class="doc-row${d.needs ? ' needs' : ''}" data-go="${go}">
      <span class="doc-ic">${icon(docIcon[d.type] || 'file', 19)}<i>${d.type === 'email' ? 'EML' : 'PDF'}</i></span>
      <span class="dr-main">
        <span class="dr-title">${esc(d.title)}</span>
        <span class="dr-sub">${esc(kind)} · ${esc(d.how)} · ${fmt.date(d.arrived)}</span>
      </span>
      <span class="dr-end">${C.docChip(d)}${d.needs ? C.chip(d.needs, 'warn', 'pencil') : ''}${o.withBill && b ? `<span class="dr-bill">${esc(svcOf(b).name)} · ${fmt.money(C.billAmount(b))}</span>` : ''}</span>
    </button>`;
  };

  /* A drawn stand-in for the bill's first page (no real document is shown). */
  C.paper = (b, ctx, o = {}) => {
    const svc = svcOf(b);
    return `<div class="paper${o.small ? ' small' : ''}" style="--svc:${C.col(ctx, svc)}" aria-label="Preview of the ${esc(svc.provider)} bill">
      <div class="paper-top"><span class="paper-logo">${icon(svc.icon, 14)}</span><b>${esc(svc.provider)}</b><span>Tax invoice</span></div>
      <div class="paper-amt"><span>Amount due</span><b>${fmt.money(b.plan ? b.plan.fullAmount : b.amount)}</b><span>by ${fmt.date(b.plan ? b.plan.fullDue : b.due, true)}</span></div>
      <div class="paper-lines">${'<i></i>'.repeat(o.small ? 5 : 9)}</div>
      <div class="paper-table">${'<i></i><i></i>'.repeat(o.small ? 2 : 4)}</div>
      ${o.small ? '' : `<div class="paper-bars">${[46, 52, 40, 38, 58, 64, 60, 72].map((h, i) => `<i style="height:${h}%${i === 7 ? ';background:var(--svc)' : ''}"></i>`).join('')}</div>
      <div class="paper-slip"><span>Payment slip</span><i></i><i></i></div>`}
      <span class="paper-stamp">${icon('check', 12)} Analysed</span>
    </div>`;
  };

  /* ---------- the one bill page, as parts each direction arranges ---------- */
  C.billParts = (b, ctx) => {
    const svc = svcOf(b);
    const st = data.billStatus(b);
    const docs = data.docsForBill(b.id);
    const payer = data.memberById[svc.payer];
    const ins = data.nextInstalment(b);
    const parts = {};

    parts.id = `<div class="bp-id">${C.disc(svc, ctx, 'lg')}<div><div class="eyebrow">${esc(svc.name)}${b.personal ? ' · Yours' : ''}</div><div class="bp-prov">${esc(svc.provider)}</div></div></div>`;
    parts.amount = C.money(C.billAmount(b), 'bp-amt');
    parts.status = `<div class="bp-status">${C.statusChip(st)}${b.unusual ? C.chip(`Unusual · ${fmt.pct(b.unusual.pct)} higher`, 'warn', 'trend-up') : ''}</div>`;
    parts.line = ins
      ? `<p class="bp-line">Instalment ${ins.n} of ${b.plan.instalments.length}, due ${fmt.date(ins.due)}. ${fmt.money(b.amount)} for ${fmt.range(b.from, b.to)}.</p>`
      : `<p class="bp-line">${fmt.range(b.from, b.to)} · ${b.days} days${b.paid ? ` · ${b.personal ? 'You' : who(svc.payer)} paid ${esc(svc.provider)} on ${fmt.date(b.paid)}` : ` · ${who(svc.payer)} ${svc.payer === data.you ? 'pay' : 'pays'} ${esc(svc.provider)}`}.</p>`;
    parts.hero = `<div class="bp-hero">${parts.id}${parts.amount}${parts.status}${parts.line}</div>`;

    parts.details = C.kv([
      ['Period', `${fmt.range(b.from, b.to)} <span class="muted">· ${b.days} days</span>`],
      ['Issued', fmt.date(b.issued, true)],
      [ins ? 'Next instalment' : 'Due', `${fmt.date(st.due, true)} <span class="muted">· ${fmt.rel(st.due)}</span>`],
      ['Paid to provider', b.paid && !ins ? `${fmt.date(b.paid)} by ${who(svc.payer)}` : ins ? `${b.plan.instalments.filter((i) => i.paid).length} of ${b.plan.instalments.length} instalments` : 'Not yet'],
      ['Invoice', `<span class="mono">${esc(b.invoice)}</span>`],
      b.usage && svc.unit ? ['Usage', `${fmt.num(b.usage)} ${svc.unit} <span class="muted">· ${(b.usage / b.days).toFixed(1)} ${svc.unit} a day</span>`] : null,
      ['Whose', b.personal ? 'Yours. Only you see it.' : data.household.split ? 'The household’s. Split between everyone.' : 'The household’s. Everyone in the house sees it.'],
    ]);

    if (!b.personal && !data.household.split) {
      parts.split = '';
    } else if (!b.personal) {
      const total = b.shares.reduce((a, s) => a + s.amount, 0);
      const list = ins ? ins.shares : b.shares;
      const how = svc.split.mode === 'percent' ? `By percentage · ${Object.values(svc.split.pct).join(' / ')}` : 'Evenly, by the days each person lived here';
      parts.split = `<div class="bp-split">
        ${C.sectionHead(ins ? `Split · instalment ${ins.n}` : 'Split', `<span class="muted">${esc(how)}</span>`)}
        ${HU.ch.stack(b.shares.map((s) => ({ value: s.amount, colour: C.col(ctx, data.memberById[s.member]), label: who(s.member), text: fmt.money(s.amount), tip: `${who(s.member)} · ${fmt.money(s.amount)} of ${fmt.money(total)}` })))}
        <div class="shares">${list.map((s) => C.shareRow(s, b, ctx, ins)).join('')}</div>
      </div>`;
    } else {
      parts.split = `<div class="bp-split">${C.sectionHead('Just yours')}<p class="muted small">Personal bills aren’t split and don’t appear in the household’s totals.</p></div>`;
    }

    if (b.plan) {
      parts.plan = `<div class="bp-plan">
        ${C.sectionHead('How you’re paying', C.chip('By instalments', 'info', 'repeat'))}
        <ol class="timeline">${b.plan.instalments
          .map((i) => {
            const next = ins === i;
            return `<li class="${i.paid ? 'done' : next ? 'next' : ''}"><i class="tl-dot">${i.paid ? icon('check', 12) : ''}</i><span class="tl-main"><b>Instalment ${i.n}</b><span>${i.paid ? `Paid ${fmt.date(i.paid)}` : `Due ${fmt.date(i.due, true)}`}</span></span><span class="tl-amt">${fmt.money(i.amount)}</span></li>`;
          })
          .join('')}</ol>
        <p class="muted small">Paying in full (${fmt.money(b.plan.fullAmount)}) ${b.plan.fullDue >= data.TODAY ? `is open until ${fmt.date(b.plan.fullDue)}.` : `closed ${fmt.date(b.plan.fullDue)}.`}</p>
      </div>`;
    }

    parts.files = `<div class="bp-files">${C.sectionHead('Bill & files', docs.length ? `<span class="muted">${docs.length} ${docs.length === 1 ? 'file' : 'files'}</span>` : '')}
      ${docs.length ? docs.map((d) => C.fileRow(d)).join('') : `<div class="file-row manual">${icon('pencil', 18)}<span><b>Entered by hand</b><span class="muted">Added by Alex · ${fmt.date(b.issued)}</span></span>${C.btn('Attach file', { kind: 'plain', size: 'sm', icon: 'upload', act: 'toast', attrs: 'data-msg="Choose a PDF or photo to attach"' })}</div>`}
    </div>`;

    if (b.figures) {
      const row = (f) => {
        const left = `<span class="fig-l">${esc(f.label)}${f.value && !f.comparison ? `<span class="muted">${esc(f.value)}</span>` : ''}</span>`;
        const delta =
          f.change == null ? '' : f.change === 0 ? '<span class="delta flat">same</span>'
            : `<span class="delta ${f.change > 0 ? 'up' : 'down'}">${icon(f.change > 0 ? 'arrow-up' : 'arrow-down', 12)}${fmt.pct(f.change)}</span>`;
        const right = f.comparison ? `<span class="muted">${esc(f.value)}</span>` : `${f.amount != null ? fmt.money(f.amount) : ''}${delta}`;
        return `<div class="fig-r">${left}<span class="fig-v">${right}</span></div>`;
      };
      parts.figures = `<div class="bp-figures">${C.sectionHead('From the bill', '<span class="muted">vs last bill</span>')}<div class="figs">${b.figures.map(row).join('')}</div></div>`;
    }

    parts.notice = b.unusual
      ? `<div class="bp-notice">${C.notice({ tone: 'warn', icon: 'trend-up', title: `${fmt.pct(b.unusual.pct)} higher than ${b.unusual.basis}`, body: 'Cold July and August. The usage charge is up; the supply charge hasn’t changed.', go: `service:${svc.id}` })}</div>`
      : '';

    const mine = (ins ? ins.shares : b.shares).find((s) => s.member === data.you);
    const canPay = mine && !mine.payer && !mine.paid && !b.personal;
    parts.actions = `<div class="bp-actions">
      ${canPay ? C.btn(`Mark my ${fmt.money(mine.amount)} paid`, { kind: 'primary', icon: 'check', act: 'markpaid', attrs: `data-bill="${b.id}" data-ins="${ins ? ins.n : ''}"` }) : b.personal && !b.paid ? C.btn('Mark as paid', { kind: 'primary', icon: 'check', act: 'toast', attrs: 'data-msg="Marked as paid"' }) : ''}
      ${C.btn('Edit', { kind: 'glass', icon: 'pencil', act: 'toast', attrs: 'data-msg="Opens the bill’s details to edit"' })}
      ${docs.length ? C.btn('View PDF', { kind: 'glass', icon: 'eye', act: 'toast', attrs: 'data-msg="Opens the PDF in a new tab"' }) : ''}
      ${C.ibtn('more', 'More', { act: 'toast', attrs: 'data-msg="Delete bill · Download · Make it just mine"' })}
    </div>`;
    return parts;
  };

  C.fileRow = (d) =>
    `<div class="file-row">
      <span class="doc-ic">${icon(docIcon[d.type] || 'file', 19)}<i>${d.type === 'email' ? 'EML' : 'PDF'}</i></span>
      <span class="fr-main"><b>${esc(d.kind === 'receipt' ? 'Payment receipt' : d.file)}</b><span class="muted">${esc(d.how)} · ${fmt.date(d.arrived)}${d.pages ? ` · ${d.pages} ${d.pages === 1 ? 'page' : 'pages'}` : ''}</span>${d.verified ? `<span class="verified">${icon('shield', 12)} Verified ${esc(d.verified)}</span>` : ''}</span>
      ${C.analysed()}
    </div>`;

  C.shareRow = (s, b, ctx, ins) => {
    const svc = svcOf(b);
    const m = data.memberById[s.member];
    const due = ins ? ins.due : b.due;
    let state;
    if (s.payer) state = C.chip(`Pays ${svc.short}`, 'neutral', 'arrow-right');
    else if (s.paid) state = C.chip(`Paid ${fmt.date(s.paid)}`, 'ok', 'check');
    else if (due < data.TODAY) state = C.chip(`Overdue · owes ${C.whoLow(svc.payer)}`, 'bad', 'alert');
    else state = C.chip(`Owes ${C.whoLow(svc.payer)}`, 'warn', 'clock');
    const note = m.from > b.from ? `<span class="muted small">Moved in ${fmt.date(m.from)}</span>` : '';
    return `<div class="share-row">${C.avatar(m, ctx, 'sm')}<span class="sr-name">${who(s.member)}${note}</span><span class="sr-amt">${fmt.money(s.amount)}</span>${state}</div>`;
  };

  /* ---------- the service page, as parts ---------- */
  C.serviceParts = (svc, ctx) => {
    const list = data.billsFor(svc.id);
    const latest = list[0];
    const payer = data.memberById[svc.payer];
    const fy = list.filter((b) => b.to >= '2025-07-01' && b.from <= '2026-06-30');
    const fyTotal = fy.reduce((a, b) => {
      const a0 = b.from > '2025-07-01' ? b.from : '2025-07-01';
      const z = b.to < '2026-06-30' ? b.to : '2026-06-30';
      return a + (b.amount * fmt.days(a0, z)) / b.days;
    }, 0);
    const parts = {};
    parts.head = `<div class="sp-head">${C.disc(svc, ctx, 'lg')}<div class="sp-title"><div class="eyebrow">${esc(svc.type)} · ${esc(svc.cadence)}</div><h2>${esc(svc.name)}</h2><div class="sp-prov">${esc(svc.provider)}</div></div></div>`;
    parts.chips = `<div class="sp-chips">${svc.owner ? C.chip('Yours · only you see it', 'info', 'user') : C.chip('Household', 'neutral', 'users')}${C.chip(`${svc.owner ? 'You pay it' : payer.id === data.you ? 'You pay it' : payer.name + ' pays it'}`, 'neutral', 'arrow-right')}${svc.seasonal ? C.chip('Changes with the seasons', 'neutral', 'sun') : ''}</div>`;
    parts.stats = [
      { label: 'Last financial year', value: fmt.money(fyTotal, true), sub: `${fy.length} bills` },
      { label: 'Average a month', value: fmt.money(fyTotal / 12, true), sub: 'FY 2025–26' },
      { label: 'Latest bill', value: fmt.money(C.billAmount(latest)), sub: data.billStatus(latest).label },
      { label: 'Next bill', value: svc.id === 'water' ? '≈ $296' : svc.id === 'power' ? '≈ $455' : svc.id === 'gas' ? '≈ $210' : fmt.money(latest.amount, true), sub: svc.id === 'water' ? 'Expected mid October' : svc.id === 'power' ? 'Expected early December' : svc.id === 'gas' ? 'Expected early November' : 'Same as the last' },
    ];
    parts.statsHtml = `<div class="stats">${parts.stats.map((s) => `<div class="stat"><span class="stat-l">${esc(s.label)}</span><span class="stat-v">${s.value}</span><span class="stat-s">${esc(s.sub)}</span></div>`).join('')}</div>`;

    const chrono = list.slice().reverse();
    const unit = svc.unit;
    const bars = chrono.map((b) => ({
      from: b.from,
      to: b.to,
      value: unit ? b.usage / b.days : b.amount / b.days,
      label: b.days > 45 ? fmt.mon(b.from) : '',
      tip: `${fmt.range(b.from, b.to)} · ${unit ? `${(b.usage / b.days).toFixed(1)} ${unit} a day` : `${fmt.money(b.amount / b.days)} a day`} · ${fmt.money(b.amount)}`,
      go: `bill:${b.id}`,
      flag: !!b.unusual,
    }));
    parts.chartTitle = unit ? `Usage per day, each bill` : `Cost per day, each bill`;
    parts.chart = HU.ch.periodBars(bars.slice(-12), {
      colour: C.col(ctx, svc),
      label: parts.chartTitle,
      ref: svc.limit ? { value: (svc.limit * 12) / 365, label: `Your limit · ${((svc.limit * 12) / 365).toFixed(1)} ${unit}/day` } : null,
    });

    const comps = [];
    if (svc.id === 'power') {
      comps.push(['Same time last year', '+5%', 'up', 'Jun – Aug 2025 · 17.4 kWh a day']);
      comps.push(['Last bill', '+11%', 'up', 'Mar – May · 16.4 kWh a day']);
      comps.push(['Your limit', '7% under', 'down', '600 kWh a month']);
      comps.push(['Similar households', '9% more', 'up', 'Printed on the bill']);
    } else if (svc.id === 'gas') {
      comps.push(['Same time last year', '+32%', 'up', 'Jul – Aug 2025 · 125 MJ a day']);
      comps.push(['Last bill', '+30%', 'up', 'May – Jun · 129 MJ a day']);
      comps.push(['Similar households', '15% more', 'up', 'Printed on the bill']);
    } else if (svc.id === 'water') {
      comps.push(['Same time last year', '+3%', 'up', 'Apr – Jun 2025']);
      comps.push(['Last bill', '−18%', 'down', 'Jan – Mar · 0.48 kL a day']);
    } else if (svc.id === 'net') {
      comps.push(['Price change', '+$4.00', 'up', 'From July 2026']);
    } else if (svc.id === 'rates') {
      comps.push(['Last year', '+4.2%', 'up', '2025–26 · $2,096.00']);
    } else if (svc.id === 'rego') {
      comps.push(['Last year', '+3.2%', 'up', '2025 · $884.10']);
    } else {
      comps.push(['Last year', 'Same', 'flat', 'No change since Feb 2025']);
    }
    parts.compare = `<div class="compare">${comps
      .map(([l, v, dir, s]) => `<div class="cmp"><span class="cmp-l">${esc(l)}</span><span class="cmp-v delta ${dir}">${dir !== 'flat' ? icon(dir === 'up' ? 'arrow-up' : 'arrow-down', 12) : ''}${esc(v)}</span><span class="cmp-s">${esc(s)}</span></div>`)
      .join('')}</div>`;

    if (!svc.owner && data.household.split) {
      const pct = svc.split.mode === 'percent' ? svc.split.pct : { alex: 100 / 3, jordan: 100 / 3, sam: 100 / 3 };
      parts.split = `<div class="sp-split">${C.sectionHead('How it’s split', C.btn('Change', { kind: 'plain', size: 'sm', act: 'toast', attrs: 'data-msg="Admins choose: evenly, by percentage or set amounts"' }))}
        ${HU.ch.stack(data.members.map((m) => ({ value: pct[m.id], colour: C.col(ctx, m), label: m.name, text: Math.round(pct[m.id]) + '%' })))}
        <div class="split-people">${data.members
          .map((m) => `<div class="sp-person">${C.avatar(m, ctx, 'sm')}<span>${who(m.id)}</span><b>${svc.split.mode === 'percent' ? pct[m.id] + '%' : 'Even'}</b><span class="muted">${fmt.money((latest.shares.find((s) => s.member === m.id) || { amount: 0 }).amount)}</span></div>`)
          .join('')}</div>
        <p class="muted small">${svc.split.mode === 'percent' ? 'Alex has the main bedroom.' : 'Evenly, by the days each person lived here.'} Last bill’s parts shown.</p>
      </div>`;
    } else parts.split = '';

    const byYear = {};
    list.forEach((b) => (byYear[b.from.slice(0, 4)] = byYear[b.from.slice(0, 4)] || []).push(b));
    parts.billsCount = list.length;
    parts.bills = Object.keys(byYear)
      .sort()
      .reverse()
      .map((y) => `<div class="year-group"><div class="year-h"><span>${y}</span><span class="muted">${byYear[y].length} ${byYear[y].length === 1 ? 'bill' : 'bills'} · ${fmt.money(byYear[y].reduce((a, b) => a + b.amount, 0), true)}</span></div><div class="rows">${byYear[y].map((b) => C.billRow(b, ctx, { inService: true, noDisc: true })).join('')}</div></div>`)
      .join('');

    const coming = {
      power: [['October', '$146', 'Last year’s October, adjusted'], ['November', '$135', 'Last year’s November, adjusted'], ['December', '$158', 'Summer, from last year']],
      gas: [['October', '$99', 'Last year’s October, adjusted'], ['November', '$63', 'Warmer weeks ahead'], ['December', '$50', 'Last year’s December']],
      water: [['October', '$100', 'Average of the last 3 bills'], ['November', '$97', 'Average of the last 3 bills'], ['December', '$102', 'Average of the last 3 bills']],
    }[svc.id];
    parts.coming = coming
      ? `<div class="coming">${coming.map(([m, v, s]) => `<div class="cm"><span class="cm-m">${m}</span><span class="cm-v">${v}</span><span class="cm-s">${s}</span></div>`).join('')}</div>`
      : '';
    parts.notice =
      svc.id === 'power'
        ? C.notice(data.notices[1])
        : svc.id === 'gas'
          ? C.notice({ tone: 'warn', icon: 'trend-up', title: 'Latest bill is unusual', body: '32% above the same time last year.', go: 'bill:gas-2026-07' })
          : '';
    parts.latest = latest;
    return parts;
  };

  /* ---------- small shared blocks ---------- */
  C.addressCard = () =>
    `<div class="address"><span class="address-ic">${icon('mail', 18)}</span><span class="address-t"><span class="muted small">Forward bills to</span><b class="mono">${esc(data.household.address)}</b></span>${C.btn('Copy', { kind: 'plain', size: 'sm', icon: 'copy', act: 'toast', attrs: 'data-msg="Address copied"' })}</div>`;

  C.docSheet = (d, ctx) => {
    const svc = data.serviceById[d.service];
    return `<div class="sheet-body">
      <div class="sheet-head">${C.disc(svc, ctx, 'md')}<div><div class="eyebrow">${esc({ bill: 'Bill', other: 'Email', receipt: 'Receipt' }[d.kind])}</div><h3>${esc(d.title)}</h3></div>${C.ibtn('x', 'Close', { act: 'closesheet' })}</div>
      <div class="sheet-row">${C.docChip(d)}${d.needs ? C.chip(d.needs, 'warn', 'pencil') : d.status ? '' : C.chip('Not a bill', 'neutral')}</div>
      ${d.status === 'waiting' ? '<p class="muted">It arrived a moment ago and is next in line. This usually takes under a minute.</p>' : ''}
      ${d.status === 'failed' ? '<p class="muted">The photo is too blurry to make out the amounts. Try again with a sharper photo, or enter the bill by hand.</p>' : ''}
      ${C.kv([['Arrived', `${fmt.date(d.arrived, true)} · ${esc(d.how)}`], d.from ? ['From', `<span class="mono">${esc(d.from)}</span>`] : null, d.subject ? ['Subject', esc(d.subject)] : null, ['File', esc(d.file)]])}
      ${d.needs ? `<div class="confirm"><label class="field"><span>Due date</span><input type="text" value="1 Oct 2026" aria-label="Due date"></label><label class="field"><span>Amount</span><input type="text" value="$2,296.67" aria-label="Amount"></label><p class="muted small">Everything else on the statement matched. Check the due date, then create the bill.</p></div>` : ''}
      <div class="sheet-actions">${d.status === 'failed' ? C.btn('Try again', { kind: 'primary', icon: 'rotate', act: 'toast', attrs: 'data-msg="Analysing it again"' }) + C.btn('Enter by hand', { kind: 'glass', icon: 'pencil', go: 'screen:billNew' }) : d.status === 'waiting' ? '' : d.needs ? C.btn('Create bill', { kind: 'primary', icon: 'check', act: 'toast', attrs: 'data-msg="Bill created · Rent October"' }) : C.btn('It’s a bill', { kind: 'glass', icon: 'bills', act: 'toast', attrs: 'data-msg="Analysing it again as a bill"' })}${C.btn('View file', { kind: 'glass', icon: 'eye', act: 'toast', attrs: 'data-msg="Opens the file in a new tab"' })}</div>
    </div>`;
  };
})();
