/*
  Components view: the whole component pack for the chosen pack, drawn with
  the same builders the mockups use, plus a side-by-side of all five packs.
  Also the Rules page.
*/
(function () {
  const HU = window.HU;
  const { data, fmt, icon, C, ch } = HU;
  const esc = C.esc;

  const sec = (title, sub, body, cls) =>
    `<section class="gal-sec${cls ? ' ' + cls : ''}"><div class="gal-sec-h"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${body}</section>`;
  const cell = (label, body, cls) => `<div class="g gal-cell${cls ? ' ' + cls : ''}"><div class="gal-l">${esc(label)}</div>${body}</div>`;

  function navDemo(ctx, pos) {
    const vertical = pos === 'left' || pos === 'right';
    const items = [['home', 'Home'], ['services', 'Services'], ['bills', 'Bills'], ['money', 'Money'], ['inbox', 'Inbox']]
      .map(([v, l], i) => `<button class="nav-i" ${i === 1 ? 'aria-current="page"' : ''} aria-label="${l}">${icon(v, 20)}<span>${l}</span>${v === 'inbox' ? '<i class="badge">1</i>' : ''}</button>`)
      .join('');
    return `<div class="nav-demo" data-pos="${pos}"><div class="nav-demo-content">${'<i></i>'.repeat(6)}</div><nav class="nav g-strong ${vertical ? 'vertical' : 'horizontal'}" data-pos="${pos}"><div class="nav-items">${items}</div></nav><span class="nav-demo-l">${pos}</span></div>`;
  }

  function widgetBox(ctx, id, w, h) {
    const def = HU.widgets.byId[id];
    return `<div class="gal-wg" style="--pw:${w};--ph:${h}"><section class="widget g preview" data-w="${w}" data-h="${h}" style="--pw:${w};--ph:${h}"><div class="wg-in">${def.render(ctx, w, h, 5)}</div></section><span class="gal-l">${esc(def.name)} · ${w}×${h}</span></div>`;
  }

  function compareCol(p, ctx) {
    const c = { ...ctx, pack: p.id };
    const b = data.billById['power-2026-q3'];
    return `<div class="gal-col" data-pack="${HU.packAttr(p.id)}">
      <div class="gal-col-h"><b>${esc(p.name)}</b><span class="muted small">${esc(p.type)}</span></div>
      <div class="gal-col-row">${C.btn('Mark paid', { kind: 'primary', size: 'sm', icon: 'check' })}${C.btn('Edit', { kind: 'glass', size: 'sm', icon: 'pencil' })}</div>
      <div class="gal-col-row">${C.analysed()}${C.chip('Due tomorrow', 'warn', 'clock')}${C.chip('Paid', 'ok', 'check')}</div>
      <div class="g gal-col-card"><div class="rows">${C.billRow(b, c)}</div></div>
      <div class="gal-col-wg"><section class="widget g preview" data-w="2" data-h="1" style="--pw:2;--ph:1"><div class="wg-in">${HU.widgets.byId.owes.render(c, 2, 1, 5)}</div></section></div>
      <div class="gal-col-wg"><section class="widget g preview" data-w="1" data-h="1" style="--pw:1;--ph:1"><div class="wg-in">${HU.widgets.byId.settled.render(c, 1, 1, 5)}</div></section></div>
      ${C.btn('Use this pack', { kind: 'plain', size: 'sm', act: 'gallery-pack', attrs: `data-v="${p.id}"` })}
    </div>`;
  }

  HU.gallery = function (ctx, packs) {
    const p = packs.find((x) => x.id === ctx.pack);
    const users = HU.directions.filter((d) => d.pack === p.id);
    const gctx = { ...ctx, device: 'desktop', deviceKey: 'desktop' };
    const b = data.billById['power-2026-q3'];
    const rates = data.billById['rates-2026'];
    const rego = data.billById['rego-2026'];
    const gas = data.billById['gas-2026-07'];
    const svc = data.serviceById.power;

    const header = `<header class="g gal-head">
      <div class="gal-head-t"><div class="eyebrow">Component pack</div><h1>${esc(p.name)}</h1><p>${esc(p.desc)}</p>
        <dl class="gal-meta"><div><dt>Type</dt><dd>${esc(p.type)}</dd></div><div><dt>Shape</dt><dd>${esc(p.shape)}</dd></div><div><dt>Glass</dt><dd>${esc(p.glass)}</dd></div><div><dt>Made for</dt><dd>${users.map((d) => esc(d.name)).join(', ')}</dd></div></dl>
      </div>
      <div class="gal-head-r">
        <div class="gal-l">Switch pack</div>
        <div class="gal-packs">${packs.map((x) => `<button class="chip-btn" data-act="gallery-pack" data-v="${x.id}" aria-pressed="${x.id === p.id}">${esc(x.name)}</button>`).join('')}</div>
        <div class="gal-l">See it in a direction</div>
        <div class="gal-packs">${HU.directions.map((d) => `<button class="chip-btn" data-act="gallery-open" data-v="${d.id}">${d.id} · ${esc(d.name)}</button>`).join('')}</div>
        <p class="muted small">Any pack works with any direction: set Component pack in the panel.</p>
      </div>
    </header>`;

    const tokens = [
      ['Accent', 'var(--p-accent)'],
      ['Accent 2', 'var(--p-accent2)'],
      ['Text', 'var(--p-fg)'],
      ['Secondary', 'var(--p-fg2)'],
      ['Paid', 'var(--ok)'],
      ['Due', 'var(--warn)'],
      ['Overdue', 'var(--bad)'],
      ['Scene 1', 'var(--p-blob1)'],
      ['Scene 2', 'var(--p-blob2)'],
      ['Scene 3', 'var(--p-blob3)'],
      ['Scene 4', 'var(--p-blob4)'],
    ];
    const foundations = sec(
      'Foundations',
      'Colour comes from the combo you pick; type, shape and glass come from the pack.',
      `<div class="gal-grid g4">
        ${cell('Colour tokens', `<div class="tok-grid">${tokens.map(([n, v]) => `<div class="tok"><i style="background:${v}"></i><span>${n}</span></div>`).join('')}</div>`, 'span2')}
        ${cell('Type', `<div class="type-spec"><div class="t-display">Hey, Alex.</div><div class="t-title">September so far</div><div class="t-body">Two payments due this week, $761.80 in total.</div><div class="t-small muted">Forwarded by Jordan · 8 Sep</div><div class="eyebrow">Eyebrow label</div><div class="mono">NW-4471-202609</div>${C.money(48621, 'hero-fig')}</div>`, 'span2')}
        ${cell('Glass materials', `<div class="mat-row"><div class="mat g"><b>Glass</b><span>Tiles, widgets</span></div><div class="mat g-strong"><b>Strong</b><span>Nav, sheets</span></div><div class="mat inset"><b>Inset</b><span>Inside a tile</span></div></div>`, 'span2')}
        ${cell('Service colours', `<div class="tok-grid">${data.services.map((s) => `<div class="tok">${C.disc(s, gctx, 'sm')}<span>${esc(s.name)}</span></div>`).join('')}</div>`, 'span2')}
      </div>`,
    );

    const controls = sec(
      'Controls',
      'Buttons, switches and inputs.',
      `<div class="gal-grid g3">
        ${cell('Buttons', `<div class="row-wrap">${C.btn('Mark my $215.80 paid', { kind: 'primary', icon: 'check' })}${C.btn('Edit', { kind: 'glass', icon: 'pencil' })}${C.btn('View PDF', { kind: 'plain', icon: 'eye' })}</div><div class="row-wrap">${C.btn('Add bill', { kind: 'primary', size: 'sm', icon: 'plus' })}${C.btn('Remind', { kind: 'glass', size: 'sm', icon: 'bell' })}${C.btn('Copy', { kind: 'plain', size: 'sm', icon: 'copy' })}</div>`)}
        ${cell('Icon buttons', `<div class="row-wrap">${C.ibtn('search', 'Search')}${C.ibtn('inbox', 'Inbox', { badge: 1 })}${C.ibtn('plus', 'Add', { cls: 'accent' })}${C.ibtn('more', 'More')}<button class="me">${C.avatar(data.memberById.alex, gctx, 'md')}</button></div>`)}
        ${cell('Segmented', `<div class="stack-s">${C.seg([['all', 'All'], ['household', 'Household'], ['mine', 'Mine']], 'household', 'x')}${C.seg([['all', 'All'], ['topay', 'To pay'], ['paid', 'Paid']], 'all', 'x', 'seg-sm')}</div>`)}
        ${cell('Switches', `<div class="stack-s"><div class="sw-row">${C.toggle(true, 'On')}<span>Everyone can download the household’s bills</span></div><div class="sw-row">${C.toggle(false, 'Off')}<span>Share area comparisons</span></div></div>`)}
        ${cell('Fields', `<div class="stack-s">${C.search()}<label class="field"><span>Amount</span><input type="text" value="$486.21"></label></div>`)}
        ${cell('Chips', `<div class="row-wrap">${C.analysed()}${C.chip('Paid', 'ok', 'check')}${C.chip('Due tomorrow', 'warn', 'clock')}${C.chip('5 days overdue', 'bad', 'alert')}${C.chip('Due 18 Oct', 'neutral', 'calendar')}${C.chip('Unusual', 'warn', 'trend-up')}${C.chip('Yours', 'info', 'user')}${C.chip('1 detail to confirm', 'warn', 'pencil')}${C.chip('By instalments', 'info', 'repeat')}</div>`)}
      </div>`,
    );

    const nav = sec(
      'Navigation',
      'The same nav bar at the bottom, top, left or right. Set it in the panel to see it in the mockups.',
      `<div class="gal-grid g4">${['bottom', 'top', 'left', 'right'].map((pos) => `<div class="g gal-cell">${navDemo(gctx, pos)}</div>`).join('')}</div>
       <div class="gal-grid g2">${cell('Top bar', `<div class="tb-demo">${`<header class="topbar"><div class="tb-l"><button class="brand"><span class="mark">${icon('home', 17)}</span><span class="brand-t"><b>Riverside House</b><span>Home Utilities</span></span></button></div><div class="tb-c">${C.search('Search bills, services, amounts', { cls: 'tb-search' })}</div><div class="tb-r">${C.ibtn('inbox', 'Inbox', { badge: 1 })}${C.btn('Add bill', { kind: 'primary', size: 'sm', icon: 'plus' })}<button class="me">${C.avatar(data.memberById.alex, gctx, 'md')}</button></div></header>`}</div>`)}
       ${cell('Back, pages', `<div class="row-wrap"><button class="back">${icon('chevron-left', 18)}<span>Electricity</span></button><div class="hg-dots demo"><button class="hg-dot" aria-current="true"></button><button class="hg-dot"></button><button class="hg-dot"></button></div><button class="hg-edit">${icon('grid', 15)}<span>Edit Home</span></button></div>`)}</div>`,
    );

    const rows = sec(
      'Rows & cards',
      'One bill row and one document row, used everywhere in a direction.',
      `<div class="gal-grid g2">
        ${cell('Bill row', `<div class="rows">${C.billRow(b, gctx, { share: true })}${C.billRow(rates, gctx)}${C.billRow(gas, gctx)}${C.billRow(rego, gctx)}</div>`)}
        ${cell('Bill row inside a service', `<div class="rows">${data.billsFor('power').slice(0, 3).map((x) => C.billRow(x, gctx, { inService: true, noDisc: true })).join('')}</div>`)}
        ${cell('Document row · Analysed', `<div class="rows">${data.docs.slice(0, 4).map((d) => C.docRow(d, gctx)).join('')}</div>`)}
        ${cell('Shares', `<div class="shares">${b.shares.map((s) => C.shareRow(s, b, gctx)).join('')}</div>`)}
        ${cell('Notices', `<div class="stack-s">${data.notices.map((n) => C.notice(n)).join('')}</div>`)}
        ${cell('Pass and table row', `<div class="stack-s"><div class="passes"><button class="pass open" style="--svc:${C.col(gctx, svc)}"><span class="pass-top"><span class="pass-t">${icon('bolt', 16)} Electricity</span><span class="pass-amt">$486.21</span></span><span class="pass-bot"><span class="muted small">Jun – Aug · 1,684 kWh</span>${C.statusChip(data.billStatus(b))}</span></button></div>${C.billTable([b, gas], gctx)}</div>`)}
        ${cell('Bills address', C.addressCard())}
        ${cell('Money between housemates', `<div class="debts">${data.money.youOwe.slice(0, 1).map((d) => HU.S.debtRow(d, gctx, 'out')).join('')}${data.money.owedToYou.slice(0, 1).map((d) => HU.S.debtRow(d, gctx, 'in')).join('')}</div>`)}
      </div>`,
    );

    const instruments = sec(
      'Instruments',
      'Every tile carries one. One series per chart, hover for values.',
      `<div class="gal-grid g4">
        ${cell('Ring', `<div class="center">${ch.ring(0.6, { size: 120, inner: '<b>6<small>/10</small></b>' })}</div>`)}
        ${cell('Arc', `<div class="center">${ch.arc(0.74, { colour: C.col(gctx, svc), mark: 0.8, inner: '<b>18.3</b><span>kWh a day</span>' })}</div>`)}
        ${cell('Sparkline', `<div class="spark-demo">${ch.spark(data.monthly.map((m) => m.total), {})}</div><div class="spark-demo">${ch.spark(data.billsFor('gas').slice().reverse().map((x) => x.amount / x.days), { colour: C.col(gctx, data.serviceById.gas) })}</div>`)}
        ${cell('Stacked bar & progress', `<div class="stack-s">${ch.stack(data.services.filter((s) => !s.owner).map((s) => ({ value: data.thisMonth.bySvc[s.id], colour: C.col(gctx, s), label: s.name })))}${C.progress(0.62)}${C.progress(0.9, 'warn')}</div>`)}
        ${cell('Trend', `<div class="chart-demo">${ch.trend(data.monthly.map((m) => ({ label: m.label, value: m.total / 100, short: fmt.money(m.total, true), tip: `${m.label} · ${fmt.money(m.total)}` })), { axisFormat: (v) => '$' + (v / 1000).toFixed(1) + 'k' })}</div>`, 'span2')}
        ${cell('Bills over time', `<div class="chart-demo">${ch.periodBars(data.billsFor('power').slice().reverse().map((x) => ({ from: x.from, to: x.to, value: x.usage / x.days, label: fmt.mon(x.from), tip: `${fmt.range(x.from, x.to)} · ${(x.usage / x.days).toFixed(1)} kWh a day` })), { colour: C.col(gctx, svc), ref: { value: 19.7, label: 'Your limit · 19.7 kWh/day' } })}</div>`, 'span2')}
        ${cell('Forecast', ch.pills(data.forecast.map((f) => ({ label: f.label, value: f.total, short: fmt.money(f.total, true) })), { showAll: true }), 'span2')}
        ${cell('Timeline', `<ol class="timeline">${rates.plan.instalments.map((i, n) => `<li class="${n === 0 ? 'next' : ''}"><i class="tl-dot"></i><span class="tl-main"><b>Instalment ${i.n}</b><span>Due ${fmt.date(i.due, true)}</span></span><span class="tl-amt">${fmt.money(i.amount)}</span></li>`).join('')}</ol>`, 'span2')}
      </div>`,
    );

    const widgets = sec(
      'Widgets',
      'Block sizes on the Home grid. A widget shows more as it grows.',
      `<div class="gal-wgs">
        ${widgetBox(gctx, 'settled', 1, 1)}${widgetBox(gctx, 'weather', 1, 1)}${widgetBox(gctx, 'nextdue', 1, 1)}${widgetBox(gctx, 'owes', 2, 1)}${widgetBox(gctx, 'weather', 2, 1)}${widgetBox(gctx, 'nextdue', 2, 2)}${widgetBox(gctx, 'month', 3, 1)}${widgetBox(gctx, 'services', 3, 2)}${widgetBox(gctx, 'trend', 2, 2)}
        <div class="gal-wg edit" style="--pw:1;--ph:1"><div class="home" data-editing="true"><section class="widget g preview" data-w="1" data-h="1" style="--pw:1;--ph:1"><div class="wg-in">${HU.widgets.byId.usage.render(gctx, 1, 1, 5)}</div><button class="wg-remove">${icon('minus', 14)}</button><button class="wg-size">${icon('resize', 12)}<span>1×1</span></button></section></div><span class="gal-l">Edit mode</span></div>
      </div>`,
    );

    const surfaces = sec(
      'Surfaces',
      'Sheets, toasts and the drawn bill preview.',
      `<div class="gal-grid g3">
        ${cell('Sheet', `<div class="sheet g-strong demo">${C.docSheet(data.docs.find((d) => d.needs), gctx)}</div>`)}
        ${cell('Toast', `<div class="stack-s"><div class="toast g-strong demo">${icon('check', 16)}<span>Marked paid · $215.80 to Jordan</span></div><div class="toast g-strong demo">${icon('check', 16)}<span>Address copied</span></div></div>`)}
        ${cell('Bill preview', `<div class="center">${C.paper(b, gctx, { small: true })}</div>`)}
      </div>`,
    );

    const compare = sec(
      'All six packs side by side',
      'The same components in each pack, over the same colours.',
      `<div class="gal-compare">${packs.map((x) => compareCol(x, gctx)).join('')}</div>`,
      'compare',
    );

    return `<div class="gallery" data-pack="${HU.packAttr(p.id)}">${header}${foundations}${controls}${nav}${rows}${instruments}${widgets}${surfaces}</div><div class="gallery gallery-cmp">${compare}</div>`;
  };

  HU.rulesPage = function () {
    const rule = (n, title, body, demo) =>
      `<article class="g rule"><span class="rule-n">${n}</span><h3>${esc(title)}</h3><p>${body}</p>${demo ? `<div class="rule-demo">${demo}</div>` : ''}</article>`;
    const ctx = { mode: document.body.dataset.mode, device: 'desktop' };
    return `<div class="rules" data-pack="instrument">
      <header class="rules-h"><div class="eyebrow">Redesign · ground rules</div><h1>Four rules every direction follows</h1><p>These hold in all six mockups, in every component pack and colour combo. Pick the look afterwards; these stay.</p></header>
      <div class="rules-grid">
        ${rule(1, 'No AI, anywhere', 'Documents say <b>Analysed</b>. That’s it. No confidence scores, no reader names, no “read from the bill”, no sparkles or “smart” anything.', `${C.analysed()} ${C.chip('1 detail to confirm', 'warn', 'pencil')}`)}
        ${rule(2, 'One page per bill', 'A bill opens the same page from Home, its service, the Bills list, the Inbox or Money. Its email and files sit on that page. Instalments live inside their bill, so a bill is never listed twice.', `<div class="rows">${C.billRow(data.billById['rates-2026'], ctx)}</div>`)}
        ${rule(3, 'Services hold their bills', 'Each service shows its bills inside it: the latest ones on its card, every bill on its page, grouped by year. One click from a service to any of its bills.', '')}
        ${rule(4, 'Home is a widget grid', 'Widgets snap to a grid that fits the screen: 5 × 3 blocks on desktop, 4 × 5 on iPad, 2 × 4 on iPhone. More widgets flow onto further pages. <b>Edit Home</b> (or long-press a widget) to drag, resize, remove, add, or change the grid.', '')}
      </div>
      <div class="rules-grid two">
        <article class="g rule soft"><h3>Kept from the brand</h3><ul><li>Lead with the number.</li><li>Status is never colour alone: every chip has a word and an icon.</li><li>No photos; the blurred colour scene is the backdrop, and it follows the colour combo.</li><li>No green accent. Green appears only as a service colour.</li><li>Plain words, second person, no exclamation marks.</li></ul></article>
        <article class="g rule soft"><h3>Using the studio</h3><ul><li><kbd>1</kbd>–<kbd>5</kbd> direction · <kbd>P</kbd> component pack · <kbd>C</kbd> colours · <kbd>M</kbd> light/dark · <kbd>N</kbd> nav position · <kbd>V</kbd> devices · <kbd>H</kbd> next screen · <kbd>\\</kbd> hide the panel.</li><li>Click around inside the mockups: nav, services, bills, widgets, Mark paid.</li><li>Home layouts are remembered per direction and device in this browser.</li><li>Everything shown is the fictional Riverside House demo.</li></ul></article>
      </div>
      <div class="rules-dirs">${HU.directions
        .map((d) => `<button class="g rule-dir" data-act="gallery-open" data-v="${d.id}"><span class="rule-n">${d.id}</span><b>${esc(d.name)}</b><span>${esc(d.tagline)}</span><span class="muted small">Pack: ${esc(HU.packs.find((p) => p.id === d.pack).name)}</span></button>`)
        .join('')}</div>
    </div>`;
  };
})();
