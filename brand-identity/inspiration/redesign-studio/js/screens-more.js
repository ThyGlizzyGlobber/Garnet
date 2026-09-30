/*
  R0: the screens the first studio round didn't show, designed for Almanac 2 +
  Frost Glass (they render in any direction, styled by its pack):
  forms (bills, upload, confirm, services + split editor, members, invite),
  getting in (sign in, code, unlock, PIN, welcome, setup wizard, joining by
  invite, each new person picking their colours), the wall, status, privacy,
  unsubscribe, not found, error, offline, loading, and empty states.
*/
(function () {
  const HU = window.HU;
  const { data, fmt, icon, C, S } = HU;
  const esc = C.esc;
  const M = (HU.M = {});

  /* ---------- form pieces ---------- */
  const field = (label, control, o = {}) =>
    `<label class="fld${o.wide ? ' wide' : ''}${o.warn ? ' warn' : ''}${o.ok ? ' ok' : ''}"><span class="fld-l">${esc(label)}${o.opt ? ' <span class="muted">· optional</span>' : ''}</span>${control}${o.hint ? `<span class="fld-h">${o.hint}</span>` : ''}</label>`;
  const input = (v, o = {}) =>
    `<span class="inp${o.cls ? ' ' + o.cls : ''}">${o.icon ? icon(o.icon, 16) : ''}${o.prefix ? `<i class="inp-a">${esc(o.prefix)}</i>` : ''}<input type="${o.type || 'text'}" value="${esc(v)}" placeholder="${esc(o.ph || '')}" aria-label="${esc(o.label || o.ph || 'Field')}"${o.mono ? ' class="mono"' : ''}>${o.suffix ? `<i class="inp-a">${esc(o.suffix)}</i>` : ''}${o.after || ''}</span>`;
  const select = (inner, o = {}) =>
    `<button type="button" class="inp sel${o.cls ? ' ' + o.cls : ''}" data-act="toast" data-msg="${esc(o.msg || 'Opens the list to choose from')}"><span class="sel-v">${inner}</span>${icon('chevron-down', 16)}</button>`;
  const area = (v, ph) => `<span class="inp ta"><textarea rows="3" placeholder="${esc(ph || '')}" aria-label="${esc(ph || 'Notes')}">${esc(v)}</textarea></span>`;
  const row2 = (a, b) => `<div class="fld-row">${a}${b}</div>`;
  const tgRow = (title, sub, on) =>
    `<div class="tg-row"><span><b>${esc(title)}</b>${sub ? `<span class="muted small">${esc(sub)}</span>` : ''}</span>${C.toggle(on, title, 'flip')}</div>`;
  const svcLead = (s, ctx) => `${C.disc(s, ctx, 'sm')}<span><b>${esc(s.name)}</b> <span class="muted">${esc(s.provider)}</span></span>`;
  const editorial = (ctx) => ctx.dir.key === 'almanac' || ctx.dir.key === 'almanac2';
  const head = (ctx, title, lede, right) =>
    editorial(ctx)
      ? `<header class="d3-title"><h1>${esc(title)}</h1>${lede ? `<p>${lede}</p>` : ''}${right ? `<div class="d3-title-r">${right}</div>` : ''}</header>`
      : S.head(title, lede, right);
  const actions = (primary, rest = '') => `<div class="form-acts">${primary}${rest}</div>`;
  const dots = (n, filled) => `<span class="pin-dots" aria-label="PIN, ${filled} of ${n} digits">${Array.from({ length: n }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('')}</span>`;
  const keypad = () =>
    `<div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
      .map((k) => (k === '' ? '<span></span>' : `<button type="button" class="key" data-act="toast" data-msg="${k === 'del' ? 'Deleted a digit' : 'Typed ' + k}" aria-label="${k === 'del' ? 'Delete' : k}">${k === 'del' ? icon('chevron-left', 22) : k}</button>`))
      .join('')}</div>`;
  const stepper = (steps, cur, act) =>
    `<ol class="stepper">${steps.map((s, i) => `<li class="${i + 1 < cur ? 'done' : i + 1 === cur ? 'on' : ''}"><button type="button" data-act="${act}" data-v="${i + 1}"><i>${i + 1 < cur ? icon('check', 12) : i + 1}</i><span>${esc(s)}</span></button></li>`).join('')}</ol>`;
  const presetCards = (ctx) =>
    `<div class="presets">${HU.palettes
      .filter((p) => p.app)
      .map((p) => {
        const t = p[ctx.mode] || p.light;
        const on = p.id === ctx.state.palette;
        return `<button class="preset${on ? ' on' : ''}" data-act="setPalette" data-v="${p.id}" aria-pressed="${on}" style="--pg:linear-gradient(160deg, ${t.ground.join(', ')});--pb1:${t.blobs[0]};--pb2:${t.blobs[1]};--pb3:${t.blobs[2]};--pa:${t.accent};--pa2:${t.accent2};--pfg:${t.fg}"><span class="preset-prev" aria-hidden="true"><i class="pp-b1"></i><i class="pp-b2"></i><i class="pp-b3"></i><span class="pp-card"><i class="pp-ring"></i><span class="pp-lines"><i></i><i></i></span><i class="pp-btn"></i></span></span><span class="preset-t"><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span></span><span class="preset-check" aria-hidden="true">${icon('check', 13)}</span></button>`;
      })
      .join('')}</div>`;
  const themeSeg = (ctx) => C.seg([['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['auto', 'Automatic', 'devices']], ctx.state.theme, 'setTheme', 'seg-sm');
  M.presetCards = presetCards;

  /* ---------- empty states (a brand-new household, one that doesn't split) ---------- */
  const emptyCard = (ic, title, body, acts) =>
    `<section class="g empty-card"><span class="empty-ic">${icon(ic, 26)}</span><h2>${esc(title)}</h2><p>${body}</p>${acts ? `<div class="form-acts mid">${acts}</div>` : ''}</section>`;
  const copyAddress = () => C.btn('Copy the bills address', { kind: 'primary', icon: 'copy', act: 'toast', attrs: 'data-msg="Address copied"' });
  /** A whole-screen state for screens a household can't show yet; null when the screen is fine as it is. */
  M.stateScreen = function (ctx) {
    const hh = data.household;
    const sc = ctx.screen;
    if (hh.fresh && (sc === 'services' || sc === 'service'))
      return `<div class="scr">${head(ctx, 'Services', 'Every provider gets a service, and each service holds its bills.')}${emptyCard('services', 'No services yet', `Services set themselves up when each provider’s first bill arrives. Forward one to <b class="mono">${esc(hh.address)}</b>, or add a service by hand.`, copyAddress() + C.btn('Add a service', { kind: 'glass', icon: 'plus', go: 'screen:serviceNew' }))}</div>`;
    if (hh.fresh && (sc === 'bills' || sc === 'bill'))
      return `<div class="scr">${head(ctx, 'Bills', 'Filed by the month each bill belongs to.')}${emptyCard('bills', 'No bills yet', 'Forward a bill’s email, upload a PDF or photo, or enter one by hand. It’s filed here and split automatically.', copyAddress() + C.btn('Upload a bill', { kind: 'glass', icon: 'upload', go: 'screen:upload' }) + C.btn('Enter one by hand', { kind: 'plain', go: 'screen:billNew' }))}</div>`;
    if (hh.fresh && sc === 'inbox')
      return `<div class="scr">${head(ctx, 'Inbox', 'Every bill, receipt and email that reaches the household, analysed as it arrives.')}<section class="g d3-addr">${C.addressCard()}</section>${emptyCard('inbox', 'Nothing here yet', 'When you forward a bill, it lands here, is analysed in under a minute and filed under its service.', '')}</div>`;
    if (sc === 'money' && !hh.split)
      return `<div class="scr">${head(ctx, 'Money', 'Balances between housemates.')}${emptyCard('money', hh.solo ? 'Just you here' : 'This household doesn’t split bills', hh.solo ? 'Money is for sharing bills with housemates. Invite someone and choose to split, and balances show up here.' : 'Everyone sees the bills, and nobody owes anybody. An admin can turn on splitting in Settings.', C.btn('Open Settings', { kind: 'glass', icon: 'sliders', go: 'screen:settings' }))}</div>`;
    if (hh.fresh && sc === 'money')
      return `<div class="scr">${head(ctx, 'Money', 'Balances between housemates.')}${emptyCard('money', 'Nothing to settle yet', 'Once bills arrive, each person’s share is worked out and shows here, with who owes whom.', '')}</div>`;
    return null;
  };

  /* ---------- Add a bill (the chooser sheet) ---------- */
  M.addSheet = () =>
    `<div class="sheet-body add-sheet">
      <div class="sheet-head"><div><div class="eyebrow">Add a bill</div><h3>How is it arriving?</h3></div>${C.ibtn('x', 'Close', { act: 'closesheet' })}</div>
      <div class="choice">
        <span class="choice-ic">${icon('mail', 22)}</span><span class="choice-t"><b>Forward its email</b><span class="muted small">From your own inbox to the household’s bills address. Nothing else to do.</span><span class="mono choice-addr">${esc(data.household.address)}</span></span>${C.btn('Copy', { kind: 'glass', size: 'sm', icon: 'copy', act: 'toast', attrs: 'data-msg="Address copied"' })}
      </div>
      <button class="choice" data-go="screen:upload"><span class="choice-ic">${icon('upload', 22)}</span><span class="choice-t"><b>Upload a PDF or photo</b><span class="muted small">A download, a scan or a photo of a paper bill.</span></span>${icon('chevron-right', 18, 'chev')}</button>
      <button class="choice" data-go="screen:billNew"><span class="choice-ic">${icon('pencil', 22)}</span><span class="choice-t"><b>Enter it by hand</b><span class="muted small">For bills without a document, like rent.</span></span>${icon('chevron-right', 18, 'chev')}</button>
    </div>`;

  /* ---------- Record a payment (Money) ---------- */
  M.paySheet = (ctx) => {
    const owed = data.money.owedToYou.filter((d) => d.from === 'jordan');
    const total = data.sum(owed);
    return `<div class="sheet-body">
      <div class="sheet-head"><div><div class="eyebrow">Money</div><h3>Record a payment</h3></div>${C.ibtn('x', 'Close', { act: 'closesheet' })}</div>
      <div class="fld-row">${field('Who paid', select(`${C.avatar(data.memberById.jordan || data.members[0], ctx, 'sm')}<span>Jordan</span>`))}${field('Paid', select(`${C.avatar(data.memberById.alex, ctx, 'sm')}<span>You</span>`))}</div>
      <div class="fld"><span class="fld-l">For</span><div class="pay-list">${
        owed.length
          ? owed
              .map((d) => {
                const b = data.billById[d.bill];
                const s = data.serviceById[b.service];
                return `<label class="pay-item"><input type="checkbox" checked>${C.disc(s, ctx, 'sm')}<span><b>${esc(s.name)}${d.instalment ? ` · instalment ${d.instalment}` : ''}</b><span class="muted small">${esc(fmt.range(b.from, b.to))} · due ${fmt.date(d.due)}</span></span><b>${fmt.money(d.amount)}</b></label>`;
              })
              .join('')
          : '<p class="muted small">Jordan doesn’t owe you anything right now.</p>'
      }</div></div>
      <div class="fld-row">${field('How', C.seg([['transfer', 'Bank transfer'], ['cash', 'Cash'], ['other', 'Other']], 'transfer', 'flipSeg', 'seg-sm'))}${field('When', input('Today', { icon: 'calendar', label: 'When' }))}</div>
      <div class="sheet-actions">${C.btn(`Record ${fmt.money(total)}`, { kind: 'primary', icon: 'check', act: 'toast', attrs: `data-msg="Recorded · Jordan paid you ${fmt.money(total)}"` })}${C.btn('Cancel', { kind: 'plain', act: 'closesheet' })}</div>
      <p class="muted small">The app keeps count; it never moves money.</p>
    </div>`;
  };

  /* ---------- a bill: add / edit ---------- */
  M.billForm = function (ctx, edit) {
    const b = edit ? data.billById['power-2026-q3'] || data.bills[0] : null;
    const s = b ? data.serviceById[b.service] : data.serviceById.rent || data.services[0];
    if (!s) return M.stateScreen({ ...ctx, screen: 'bills' });
    const split = data.household.split && !s.owner;
    const amount = b ? b.amount : 229667;
    const preview = split
      ? `<section class="g">${C.sectionHead('How it’s split', '<span class="muted">Set on the service</span>')}${HU.ch.stack(
          (b || data.billById['rent-2026-10'] || { shares: [] }).shares.map((x) => ({ value: x.amount, colour: C.col(ctx, data.memberById[x.member]), label: C.who(x.member) })),
        )}<div class="shares">${(b || data.billById['rent-2026-10'] || { shares: [] }).shares
          .map((x) => `<div class="share-row">${C.avatar(data.memberById[x.member], ctx, 'sm')}<span class="sr-name">${C.who(x.member)}</span><span class="sr-amt">${fmt.money(x.amount)}</span>${x.payer ? C.chip(`Pays ${s.short}`, 'neutral', 'arrow-right') : C.chip(`Owes ${C.whoLow(s.payer)}`, 'neutral')}</div>`)
          .join('')}</div><p class="muted small">${s.split.mode === 'percent' ? 'By percentage, 40 / 30 / 30.' : 'Evenly, by the days each person lived here.'} Parts update as you type.</p></section>`
      : '';
    return `<div class="scr form-scr">${S.back({ ...ctx, backLabel: edit ? 'Bill' : 'Bills' })}
      ${head(ctx, edit ? 'Edit bill' : 'Add a bill', edit ? `${esc(s.name)} · ${esc(s.provider)}` : 'For bills that don’t come by email, like rent. Anything with a document can be forwarded or uploaded instead.')}
      <div class="form-grid">
        <section class="g form-main">
          ${C.sectionHead('The bill')}
          ${field('Service', select(svcLead(s, ctx), { msg: 'Choose from the household’s services, or add a new one' }))}
          ${row2(field('Amount', input(fmt.money(amount).replace('$', ''), { prefix: '$', label: 'Amount' })), field(b && b.plan ? 'Next due' : 'Due date', input(fmt.date(b ? b.due : '2026-11-01', true), { icon: 'calendar', label: 'Due date' })))}
          ${row2(field('Covers from', input(fmt.date(b ? b.from : '2026-11-01', true), { icon: 'calendar', label: 'Covers from' })), field('To', input(fmt.date(b ? b.to : '2026-11-30', true), { icon: 'calendar', label: 'To' })))}
          ${row2(field('Issued', input(b ? fmt.date(b.issued, true) : '', { icon: 'calendar', ph: 'Date on the bill', label: 'Issued' }), { opt: true }), field('Invoice number', input(b ? b.invoice : '', { mono: true, ph: 'As printed', label: 'Invoice number' }), { opt: true }))}
          ${s.unit ? field('Usage', input(b && b.usage ? fmt.num(b.usage) : '', { suffix: s.unit, label: 'Usage' }), { opt: true, hint: 'Used for comparisons and your monthly limit.' }) : ''}
          ${field('Notes', area(edit ? '' : '', 'Anything the household should know'), { opt: true })}
          ${tgRow('Paid by instalments', 'Add each instalment’s date and amount', !!(b && b.plan))}
          <div class="drop small">${icon('upload', 18)}<span><b>Attach the bill</b> <span class="muted">· drop a PDF or photo, or choose a file</span></span></div>
        </section>
        <div class="form-side">
          ${preview}
          <section class="g">${C.sectionHead('Whose is it?')}${C.seg([['house', 'The household’s', 'users'], ['mine', 'Just mine', 'user']], s.owner ? 'mine' : 'house', 'flipSeg', 'seg-sm')}<p class="muted small">Applies to the whole ${esc(s.name.toLowerCase())} service. Just mine means only you see it and it isn’t split.</p></section>
          ${edit ? `<section class="g danger">${C.sectionHead('Delete this bill')}<p class="muted small">Deletes the bill and its file. Shares already paid back are removed with it.</p>${C.btn('Delete bill', { kind: 'plain', icon: 'x', cls: 'btn-danger', act: 'toast', attrs: 'data-msg="Asks you to confirm first"' })}</section>` : ''}
        </div>
      </div>
      ${actions(C.btn(edit ? 'Save changes' : 'Add bill', { kind: 'primary', icon: 'check', act: 'toast', attrs: `data-msg="${edit ? 'Saved' : 'Bill added · Rent November'}"` }), C.btn('Cancel', { kind: 'plain', go: 'back' }))}
    </div>`;
  };

  /* ---------- upload ---------- */
  M.upload = function (ctx) {
    const rates = data.billById['rates-2026'];
    const items = [
      rates ? [icon('file', 19), 'Council rates notice.pdf', 'Uploaded just now', `${C.analysed()}<span class="up-to">Council rates · ${fmt.money(rates.amount)}</span>`, C.btn('Open bill', { kind: 'glass', size: 'sm', go: `bill:${rates.id}` })] : null,
      [icon('photo', 19), 'IMG_2240.jpg', 'Uploaded just now', `<span class="analysing"><i></i>Analysing…</span>`, ''],
      [icon('file', 19), 'Statement Sep 2026.pdf', 'Uploaded 26 Sep', `${C.analysed()}${C.chip('1 detail to confirm', 'warn', 'pencil')}`, C.btn('Confirm', { kind: 'primary', size: 'sm', go: 'screen:confirm' })],
    ].filter(Boolean);
    return `<div class="scr form-scr">${S.back({ ...ctx, backLabel: 'Bills' })}
      ${head(ctx, 'Upload a bill', 'PDFs, scans and photos of paper bills. Each one is analysed and filed under its service, usually in under a minute.')}
      <section class="g drop big"><span class="drop-ic">${icon('upload', 30)}</span><b>Drop PDFs or photos here</b><span class="muted">Several at once is fine.</span><div class="form-acts mid">${C.btn('Choose files', { kind: 'primary', icon: 'file', act: 'toast', attrs: 'data-msg="Opens your files"' })}${C.btn('Take a photo', { kind: 'glass', icon: 'photo', act: 'toast', attrs: 'data-msg="Opens the camera"' })}</div></section>
      <section class="g">${C.sectionHead('Just now')}<div class="rows">${items
        .map(([ic, name, when, state, act]) => `<div class="up-item"><span class="doc-ic">${ic}<i>${name.endsWith('.jpg') ? 'JPG' : 'PDF'}</i></span><span class="up-t"><b>${esc(name)}</b><span class="muted small">${esc(when)}</span><span class="up-state">${state}</span></span>${act}</div>`)
        .join('')}</div></section>
      <section class="g d3-addr">${C.addressCard()}</section>
    </div>`;
  };

  /* ---------- confirm a document (a detail to check) ---------- */
  M.confirm = function (ctx) {
    const b = data.billById['rent-2026-10'];
    const s = data.serviceById.rent;
    if (!b || !s) return M.stateScreen({ ...ctx, screen: 'inbox' });
    return `<div class="scr form-scr">${S.back({ ...ctx, backLabel: 'Inbox' })}
      ${head(ctx, 'Confirm one detail', 'Harbour Lane Realty statement · uploaded by Alex · 26 Sep. Everything else matched; check the due date, then create the bill.')}
      <div class="form-grid doc-grid">
        <div class="confirm-doc">${C.paper(b, ctx)}<i class="hl" aria-hidden="true"></i></div>
        <section class="g form-main">
          ${C.sectionHead('What the statement says', C.analysed())}
          ${field('Service', select(svcLead(s, ctx)), { ok: true, hint: `${icon('check', 12)} Matched to Rent` })}
          ${row2(field('Amount', input('2,296.67', { prefix: '$', label: 'Amount' }), { ok: true, hint: `${icon('check', 12)} Same as last month` }), field('Due date', input('1 Oct 2026', { icon: 'calendar', label: 'Due date' }), { warn: true, hint: `${icon('alert', 12)} Check this: the statement shows 1 Oct and 3 Oct` }))}
          ${row2(field('Covers', input('October 2026', { icon: 'calendar', label: 'Covers' })), field('Reference', input('HL-RIV-202610', { mono: true, label: 'Reference' })))}
          ${actions(C.btn('Create bill', { kind: 'primary', icon: 'check', act: 'toast', attrs: 'data-msg="Bill created · Rent October"' }), C.btn('Not a bill', { kind: 'glass', act: 'toast', attrs: 'data-msg="Filed under Other"' }) + C.btn('View file', { kind: 'plain', icon: 'eye', act: 'toast', attrs: 'data-msg="Opens the file in a new tab"' }))}
        </section>
      </div>
    </div>`;
  };

  /* ---------- a service: add / edit, with the split editor ---------- */
  const TYPES = [
    ['Utilities', ['Electricity', 'Gas', 'Water', 'Internet']],
    ['Home', ['Rent', 'Council rates', 'Strata', 'Cleaning', 'Gardening']],
    ['Health', ['Health insurance', 'Ambulance cover', 'Gym']],
    ['Vehicle', ['Car rego', 'Car insurance', 'Roadside assistance']],
    ['Lifestyle', ['Phone', 'Subscriptions']],
    ['Other', ['Other']],
  ];
  M.serviceForm = function (ctx, edit) {
    const s = edit ? data.serviceById.rent || data.services[0] : null;
    const mode = s ? s.split.mode : 'even';
    const pct = s && s.split.pct ? s.split.pct : null;
    const latest = s ? data.billsFor(s.id)[0] : null;
    const splitOn = data.household.split && !(s && s.owner);
    const people = data.members
      .map((m) => {
        const part = latest ? (latest.shares.find((x) => x.member === m.id) || {}).amount : null;
        return `<div class="se-row">${C.avatar(m, ctx, 'md')}<span class="se-n"><b>${C.who(m.id)}</b>${m.from > '2026-01-01' ? `<span class="muted small">Moved in ${fmt.date(m.from)}</span>` : ''}</span>${mode === 'percent' ? input(String(pct[m.id]), { suffix: '%', cls: 'narrow', label: `${m.name}'s percentage` }) : '<span class="muted small">Even</span>'}<span class="se-part">${part != null ? fmt.money(part) : ''}</span></div>`;
      })
      .join('');
    const payer = s ? s.payer : data.you;
    return `<div class="scr form-scr">${S.back({ ...ctx, backLabel: edit ? s.name : 'Services' })}
      ${head(ctx, edit ? s.name : 'Add a service', edit ? `${esc(s.provider)} · ${esc(s.cadence.toLowerCase())}` : 'Most services set themselves up from their first bill. Add one here to track something that doesn’t send one.')}
      <div class="form-grid">
        <section class="g form-main">
          ${C.sectionHead('What it is')}
          <div class="fld"><span class="fld-l">Type</span><div class="type-pick">${TYPES.map(([g, list]) => `<div class="tp-g"><span class="tp-h">${g}</span><div class="tp-list">${list.map((t) => `<button type="button" class="chip-btn" aria-pressed="${(s ? s.type : 'Electricity') === t}" data-act="flipPick">${esc(t)}</button>`).join('')}</div></div>`).join('')}</div></div>
          ${row2(field('Name', input(s ? s.name : '', { ph: 'Electricity', label: 'Name' })), field('Provider', input(s ? s.provider : '', { ph: 'As on the bill', label: 'Provider' })))}
          ${row2(field('How often', select(s ? s.cadence : 'Quarterly')), field('Usage unit', select(s && s.unit ? s.unit : edit ? 'None' : 'kWh'), { opt: true }))}
          ${!edit ? field('Monthly limit', input('600', { suffix: 'kWh a month', label: 'Monthly limit' }), { opt: true, hint: 'You’ll hear about it when usage runs over.' }) : ''}
          ${tgRow('Changes with the seasons', 'Compared with the same time last year, not just the last bill', !edit)}
          ${data.members.length > 1 ? tgRow('Just for me', 'Only you see it, and it isn’t split', !!(s && s.owner)) : ''}
        </section>
        <div class="form-side">
          ${
            splitOn
              ? `<section class="g split-ed">${C.sectionHead('Who pays and how it’s split', '<span class="muted">Admins</span>')}
            <div class="fld"><span class="fld-l">Pays the provider</span><div class="payer-pick">${data.members.map((m) => `<button type="button" class="payer${m.id === payer ? ' on' : ''}" data-act="flipPick">${C.avatar(m, ctx, 'sm')}<span>${C.who(m.id)}</span></button>`).join('')}</div></div>
            <div class="fld"><span class="fld-l">Split</span>${C.seg([['even', 'Evenly'], ['percent', 'By percentage'], ['fixed', 'Set amounts']], mode, 'flipSeg', 'seg-sm')}</div>
            <div class="se-list">${people}</div>
            ${mode === 'percent' ? `<div class="se-total ok">${icon('check', 14)} 100% · adds up</div>` : ''}
            <p class="muted small">${mode === 'percent' ? 'Leave someone at 0 and they don’t pay. If someone moves out mid-bill, the others share their part by these percentages.' : 'Split by the days each person lived here.'}${latest ? ' Parts shown are for the latest bill.' : ''}</p>
            ${edit ? `<label class="check"><input type="checkbox" checked> <span>Re-split 2 earlier bills nobody has paid a share of</span></label>` : ''}
          </section>`
              : ''
          }
          ${edit ? `<section class="g danger">${C.sectionHead('Stop tracking')}<p class="muted small">Keeps its bills and history; new bills from this provider start a new service.</p>${C.btn('Stop tracking this service', { kind: 'plain', cls: 'btn-danger', act: 'toast', attrs: 'data-msg="Asks you to confirm first"' })}</section>` : ''}
        </div>
      </div>
      ${actions(C.btn(edit ? 'Save changes' : 'Add service', { kind: 'primary', icon: 'check', act: 'toast', attrs: `data-msg="${edit ? 'Saved' : 'Service added'}"` }), C.btn('Cancel', { kind: 'plain', go: 'back' }))}
    </div>`;
  };

  /* ---------- members ---------- */
  M.members = function (ctx) {
    const cards = data.members
      .map((m) => {
        const status = m.you ? 'You · signs in with Google' : m.invited ? 'Invited 2 days ago · hasn’t joined yet' : m.id === 'jordan' ? `Joined ${fmt.monthYear(m.from)} · signs in with Google` : `Joined ${fmt.monthYear(m.from)} · signs in with an email code`;
        return `<article class="g mcard" style="--m:${C.col(ctx, m)}">
          <button class="mcard-top" data-go="screen:member">${C.avatar(m, ctx, 'lg')}<span><b>${esc(m.name)}</b><span class="muted small">${esc(status)}</span></span>${icon('chevron-right', 18, 'chev')}</button>
          <div class="mcard-chips">${C.chip(m.role === 'Admin' ? 'Admin' : 'Member', m.role === 'Admin' ? 'info' : 'neutral', m.role === 'Admin' ? 'shield' : 'user')}${m.invited ? C.chip('Invite sent', 'warn', 'mail') : ''}${data.household.split && !m.invited ? C.chip(`Lives here since ${fmt.date(m.from)}`, 'neutral', 'home') : ''}</div>
          ${m.invited ? `<div class="form-acts">${C.btn('Resend invite', { kind: 'glass', size: 'sm', icon: 'mail', act: 'toast', attrs: 'data-msg="Invite sent again"' })}${C.btn('Copy link', { kind: 'plain', size: 'sm', icon: 'link', act: 'toast', attrs: 'data-msg="Link copied"' })}</div>` : ''}
        </article>`;
      })
      .join('');
    return `<div class="scr">${S.back({ ...ctx, backLabel: 'Settings' })}
      ${head(ctx, 'Members', data.household.solo ? 'Just you so far. Invite housemates to share bills with them.' : 'Who lives at Riverside House and what they can do.', C.btn('Invite someone', { kind: 'primary', icon: 'plus', go: 'screen:invite' }))}
      <div class="mgrid">${cards}</div>
      <p class="muted small">Admins add people, set splits and change household settings. Everyone chooses their own colours and PIN.</p>
    </div>`;
  };
  M.member = function (ctx) {
    const m = data.memberById.jordan || data.members[0];
    return `<div class="scr form-scr">${S.back({ ...ctx, backLabel: 'Members' })}
      <header class="member-h g" style="--m:${C.col(ctx, m)}">${C.avatar(m, ctx, 'lg')}<div><div class="eyebrow">${esc(m.role)}</div><h1>${esc(m.name)}</h1><span class="muted">${m.invited ? 'Invited, hasn’t joined yet' : `Signs in with Google · ${m.name.toLowerCase()}@example.com`}</span></div></header>
      <div class="form-grid">
        <section class="g form-main">
          ${C.sectionHead('Details')}
          ${row2(field('Name', input(m.name, { label: 'Name' })), field('Colour', `<span class="sw-pick">${['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4f8a3a', '#4a3aa7', '#e34948'].map((c) => `<button type="button" class="sw-dot${c === m.colour[0] ? ' on' : ''}" style="--c:${c}" data-act="flipPick" aria-label="Colour"></button>`).join('')}</span>`, { hint: 'Their avatar and their part of each split bar.' }))}
          ${row2(field('Moved in', input(fmt.date(m.from, true), { icon: 'calendar', label: 'Moved in' }), { hint: 'Shares count from this day.' }), field('Moved out', input('', { icon: 'calendar', ph: 'Still living here', label: 'Moved out' }), { opt: true }))}
          ${C.sectionHead('Payment details')}
          <div class="pay-rows">${m.pay.map(([k, v]) => `<div class="kv-r"><dt>${esc(k)}</dt><dd class="mono">${esc(v)}</dd></div>`).join('')}</div>
          ${C.btn('Add payment details', { kind: 'plain', size: 'sm', icon: 'plus', act: 'toast', attrs: 'data-msg="PayID, BSB and account, or anything else"' })}
        </section>
        <div class="form-side">
          <section class="g">${C.sectionHead('Role')}<p class="muted small">${m.role === 'Admin' ? 'Can add people, set splits and change household settings.' : 'Sees the household’s bills and their own. Can’t change splits or settings.'}</p>${C.btn(m.role === 'Admin' ? 'Remove admin' : 'Make admin', { kind: 'glass', size: 'sm', icon: 'shield', act: 'toast', attrs: 'data-msg="Asks you to confirm first"' })}</section>
          <section class="g">${C.sectionHead('Access')}<p class="muted small">Signed in on 2 devices.</p>${C.btn('Sign out other devices', { kind: 'glass', size: 'sm', act: 'toast', attrs: 'data-msg="Signed out everywhere else"' })}</section>
          <section class="g danger">${C.sectionHead('Remove from household')}<p class="muted small">Their paid shares stay in the history. Unpaid shares need settling first.</p>${C.btn(`Remove ${m.name}`, { kind: 'plain', cls: 'btn-danger', act: 'toast', attrs: 'data-msg="Asks you to confirm first"' })}</section>
        </div>
      </div>
      ${actions(C.btn('Save changes', { kind: 'primary', icon: 'check', act: 'toast', attrs: 'data-msg="Saved"' }), C.btn('Cancel', { kind: 'plain', go: 'back' }))}
    </div>`;
  };
  M.invite = function (ctx) {
    return `<div class="scr form-scr narrow">${S.back({ ...ctx, backLabel: 'Members' })}
      ${head(ctx, 'Invite someone', 'They choose their own colours and PIN when they join.')}
      <section class="g form-main">
        ${row2(field('Their name', input('Casey', { label: 'Their name' }), { hint: 'You can change it later.' }), field('Moved in', input('1 Oct 2026', { icon: 'calendar', label: 'Moved in' }), { hint: 'Their shares count from this day.' }))}
        ${field('Their email', input('casey@example.com', { icon: 'mail', type: 'email', label: 'Their email' }), { hint: 'We email them a link to join.' })}
        ${actions(C.btn('Send invite', { kind: 'primary', icon: 'mail', act: 'toast', attrs: 'data-msg="Invite sent to casey@example.com"' }))}
        <div class="or"><span>or share a code</span></div>
        <div class="code-share"><span class="code-big mono">K7PM-4X2Q</span>${C.btn('Copy code', { kind: 'glass', size: 'sm', icon: 'copy', act: 'toast', attrs: 'data-msg="Code copied"' })}${C.btn('Copy link', { kind: 'plain', size: 'sm', icon: 'link', act: 'toast', attrs: 'data-msg="Link copied"' })}</div>
        <p class="muted small">The code works once and lasts 7 days. Sending a new invite cancels this one.</p>
      </section>
    </div>`;
  };

  /* ---------- status (operator only) ---------- */
  M.status = function (ctx) {
    const card = (ic, title, lines, chip) =>
      `<section class="g st-card"><div class="st-h">${C.disc({ colour: ['#5b6f82', '#b9c7d6'], icon: ic }, ctx, 'sm')}<b>${esc(title)}</b>${chip || ''}</div>${C.kv(lines)}</section>`;
    return `<div class="scr">${head(ctx, 'Status', 'For the operator only. Nobody in a household sees this page.')}
      <div class="st-grid">
        ${card('download', 'Software', [['Installed', '<span class="mono">f7b61d9</span> · built 29 Sep'], ['Latest', '<span class="mono">f7b61d9</span>'], ['Backups', 'Snapshot before every update · last 29 Sep, 10:02']], C.chip('Up to date', 'ok', 'check'))}
        ${card('mail', 'Bills addresses', [['Email Worker', 'Signs deliveries per household (v2)'], ['This week', '14 emails · 12 bills, 2 receipts'], ['Households', '2']], C.chip('Working', 'ok', 'check'))}
        ${card('file', 'Documents', [['Analysed this month', '41'], ['Waiting', '1 · next in line'], ['Couldn’t be analysed', '1 · a blurry photo'], ['Reader', 'Anthropic API · claude-opus-5 · 38 reads']], C.chip('1 to look at', 'warn', 'alert'))}
        ${card('bell', 'Email out', [['Service', 'Resend'], ['This week', '12 sent · none failed']], C.chip('Working', 'ok', 'check'))}
        ${card('cloud-sun', 'Weather', [['Source', 'Open-Meteo'], ['Last synced', '12 minutes ago'], ['Postcodes', '2']], C.chip('Working', 'ok', 'check'))}
        ${card('users', 'Households', [['Riverside House', 'Demo · 3 people'], ['Smith Household', '3 people · 214 bills'], ['Area comparisons', 'Not enough households yet']], '')}
      </div>
    </div>`;
  };

  /* ---------- errors, offline, loading ---------- */
  M.notFound = (ctx) =>
    `<div class="scr">${emptyCard('search', 'This page isn’t here', 'It may have moved when the app was updated, or the link was cut short.', C.btn('Go to Home', { kind: 'primary', icon: 'home', go: 'screen:home' }))}</div>`;
  M.error = (ctx) =>
    `<div class="scr">${emptyCard('alert', 'Something went wrong', 'That didn’t work, and it’s been noted. Try again; if it keeps happening, tell Alex and quote the reference below.<br><span class="mono small">Ref 7F3A-21C9</span>', C.btn('Try again', { kind: 'primary', icon: 'rotate', act: 'toast', attrs: 'data-msg="Trying again"' }) + C.btn('Go to Home', { kind: 'glass', icon: 'home', go: 'screen:home' }))}</div>`;
  M.offlineBanner = () =>
    `<div class="offline-bar">${icon('wifi', 16)}<span><b>You’re offline.</b> Showing Home as it was at 9:41. Changes wait until you’re back.</span></div>`;

  /* ---------- getting in (outside the app) ---------- */
  const authShell = (ctx, card, o = {}) =>
    `<div class="auth${o.wide ? ' wide' : ''}">
      <div class="auth-side">
        <div class="auth-brand"><span class="mark">${icon('home', 18)}</span><b>Home Utilities</b></div>
        ${o.side || `<h1 class="auth-big">Bills in, totals out, everyone knows their share.</h1><ul class="auth-points"><li>${icon('mail', 16)} Forward bills; they’re filed for you</li><li>${icon('split', 16)} Everyone’s share, worked out</li><li>${icon('calendar', 16)} What’s due, before it’s due</li></ul>`}
      </div>
      <div class="auth-main"><section class="g-strong auth-card">${card}</section>
        <p class="auth-foot muted small"><a href="#" data-go="screen:privacy">Privacy</a> · <a href="#" data-act="toast" data-msg="Opens the demo household">Try the demo household</a></p></div>
    </div>`;
  M.login = (ctx) =>
    authShell(
      ctx,
      `<h2>Sign in</h2><p class="muted">Use the account your invite was sent to.</p>
      ${C.btn('Continue with Google', { kind: 'glass', cls: 'wide g-btn', icon: 'user', act: 'toast', attrs: 'data-msg="Opens Google sign-in"' })}
      <div class="or"><span>or</span></div>
      ${field('Email', input('alex@example.com', { icon: 'mail', type: 'email', label: 'Email' }))}
      ${C.btn('Email me a code', { kind: 'primary', cls: 'wide', go: 'screen:code' })}
      <p class="muted small">New here? Your household’s admin sends you an invite. Or <a href="#" data-go="screen:welcome">start a household</a>.</p>`,
    );
  M.code = (ctx) =>
    authShell(
      ctx,
      `<h2>Check your email</h2><p class="muted">We sent a 6-digit code to <b>alex@example.com</b>. It works for 10 minutes.</p>
      <div class="code-in">${['4', '8', '2', '', '', ''].map((d, i) => `<span class="code-box${d ? ' on' : i === 3 ? ' cur' : ''}">${d}</span>`).join('')}</div>
      ${C.btn('Sign in', { kind: 'primary', cls: 'wide', go: 'screen:unlock' })}
      <p class="muted small">Didn’t get it? A new code can be sent in 0:48. <a href="#" data-go="screen:login">Use a different email</a></p>`,
    );
  M.unlock = (ctx) =>
    authShell(
      ctx,
      `<div class="pin-head">${C.avatar(data.memberById.alex, ctx, 'lg')}<h2>Hey, Alex.</h2><p class="muted">Enter your PIN to unlock.</p></div>${dots(4, 2)}${keypad()}<p class="muted small t-center">Forgot it? <a href="#" data-go="screen:login">Sign in again</a> · <a href="#" data-go="screen:login">Not Alex?</a></p>`,
      { side: `<h1 class="auth-big">Welcome back to Riverside House.</h1><p class="muted">This device stays signed in. Your PIN keeps it private.</p>` },
    );
  M.setpin = (ctx) =>
    authShell(
      ctx,
      `<div class="pin-head"><h2>Choose a PIN</h2><p class="muted">Four digits to unlock this device. Nobody else ever sees it, admins included.</p></div>${dots(4, 0)}${keypad()}`,
    );
  M.welcome = (ctx) =>
    authShell(
      ctx,
      `<h2>Hey, Alex.</h2><p class="muted">You’re signed in as alex@example.com. What next?</p>
      <button class="choice" data-go="screen:setup"><span class="choice-ic">${icon('home', 22)}</span><span class="choice-t"><b>Start a household</b><span class="muted small">Name it, pick your colours, then invite the people you live with.</span></span>${icon('chevron-right', 18, 'chev')}</button>
      <div class="choice col"><span class="choice-ic">${icon('users', 22)}</span><span class="choice-t"><b>Join a household</b><span class="muted small">Enter the code from your invite.</span></span><span class="join-row">${input('K7PM-4X2Q', { mono: true, label: 'Invite code' })}${C.btn('Join', { kind: 'primary', size: 'sm', go: 'screen:join' })}</span></div>`,
    );

  /* the setup wizard: household → where → you → colours */
  const SETUP = ['Household', 'Where', 'You', 'Colours'];
  M.setup = function (ctx) {
    const step = ctx.state.setupStep || 1;
    const bodies = {
      1: `<h2>Your household</h2><p class="muted">You can change all of this later.</p>
        ${field('Name', input('Riverside House', { label: 'Household name' }))}
        <div class="fld"><span class="fld-l">Do you split bills?</span><div class="radio-cards">
          <button type="button" class="rcard on" data-act="flipPick"><b>Yes, we split them</b><span class="muted small">Each bill is shared by the people living here. Set how per service.</span></button>
          <button type="button" class="rcard" data-act="flipPick"><b>No, just keep track</b><span class="muted small">One household total. Nobody owes anybody.</span></button>
        </div></div>`,
      2: `<h2>Where is it?</h2><p class="muted">For the weather, the seasons and your currency. A postcode, never an address.</p>
        ${field('Postcode or suburb', input('3000', { icon: 'search', label: 'Postcode or suburb' }))}
        <div class="place-pick"><button type="button" class="place on" data-act="flipPick">${icon('pin', 16)}<span><b>Riverside VIC 3000</b><span class="muted small">Melbourne time · Australian dollars</span></span>${icon('check', 16)}</button><button type="button" class="place" data-act="flipPick">${icon('pin', 16)}<span><b>Riverside Heights VIC 3001</b><span class="muted small">Melbourne time · Australian dollars</span></span></button></div>
        <div class="kv-inline muted small">Financial year from July · weeks start on Monday · <a href="#" data-act="toast" data-msg="Change currency, time zone or financial year">Change</a></div>
        <label class="check"><input type="checkbox" checked> <span>Share anonymous area comparisons. Only with 10 or more households in an area; no names or addresses. <a href="#" data-go="screen:privacy">How it works</a></span></label>`,
      3: `<h2>About you</h2><p class="muted">You’ll be the household’s first admin.</p>
        ${field('Your name', input('Alex', { label: 'Your name' }))}
        ${field('Your colour', `<span class="sw-pick">${['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4f8a3a', '#4a3aa7', '#e34948'].map((c, i) => `<button type="button" class="sw-dot${i === 0 ? ' on' : ''}" style="--c:${c}" data-act="flipPick" aria-label="Colour"></button>`).join('')}</span>`, { hint: 'For your avatar and your part of split bars.' })}
        <div class="fld"><span class="fld-l">Choose a PIN</span>${dots(4, 4)}<span class="fld-h">Four digits to unlock this device. Nobody else ever sees it.</span></div>`,
      4: `<h2>Pick your colours</h2><p class="muted">Only you see your choice. Everyone in the house picks their own, and you can change it any time in Settings.</p>
        ${presetCards(ctx)}<div class="set-row"><span><b>Light or dark</b><span class="muted small">Automatic follows your phone or computer.</span></span>${themeSeg(ctx)}</div>`,
    };
    const card = `${stepper(SETUP, step, 'setupStep')}<div class="wiz-body">${bodies[step]}</div>
      <div class="form-acts spread">${step > 1 ? C.btn('Back', { kind: 'plain', icon: 'chevron-left', act: 'setupStep', attrs: `data-v="${step - 1}"` }) : '<span></span>'}${step < 4 ? C.btn('Continue', { kind: 'primary', act: 'setupStep', attrs: `data-v="${step + 1}"` }) : C.btn('Finish setup', { kind: 'primary', icon: 'check', go: 'screen:home' })}</div>`;
    return authShell(ctx, card, { wide: true, side: `<h1 class="auth-big">Set up your household.</h1><p class="muted">Four short steps. Then forward your first bill and invite your housemates.</p>` });
  };

  /* joining by invite: the invite → sign in → colours → PIN */
  const JOIN = ['Invite', 'Sign in', 'Colours', 'PIN'];
  M.join = function (ctx) {
    const step = ctx.state.joinStep || 1;
    const alex = data.memberById.alex;
    const bodies = {
      1: `<div class="invite-card">${C.avatars(data.members.filter((m) => !m.invited || m.id === 'jordan').map((m) => m.id), ctx, 'md')}<h2>Alex invited you to Riverside House</h2><p class="muted">You’ll share bills with Alex and Sam. Your share counts from the day you moved in, <b>1 February 2025</b>.</p></div>`,
      2: `<h2>Sign in</h2><p class="muted">So this invite belongs to you. Use any email.</p>
        ${C.btn('Continue with Google', { kind: 'glass', cls: 'wide g-btn', icon: 'user', act: 'joinStep', attrs: 'data-v="3"' })}<div class="or"><span>or</span></div>
        ${field('Email', input('jordan@example.com', { icon: 'mail', type: 'email', label: 'Email' }))}${C.btn('Email me a code', { kind: 'glass', cls: 'wide', act: 'joinStep', attrs: 'data-v="3"' })}`,
      3: `<h2>Pick your colours</h2><p class="muted">Just for you. Alex and Sam keep theirs, and you can change yours any time in Settings.</p>${presetCards(ctx)}<div class="set-row"><span><b>Light or dark</b></span>${themeSeg(ctx)}</div>`,
      4: `<div class="pin-head"><h2>Choose a PIN</h2><p class="muted">Four digits to unlock this device. Nobody else ever sees it.</p></div>${dots(4, 1)}${keypad()}`,
    };
    const card = `${stepper(JOIN, step, 'joinStep')}<div class="wiz-body">${bodies[step]}</div>
      <div class="form-acts spread">${step > 1 ? C.btn('Back', { kind: 'plain', icon: 'chevron-left', act: 'joinStep', attrs: `data-v="${step - 1}"` }) : '<span></span>'}${step === 1 ? C.btn('Accept invite', { kind: 'primary', act: 'joinStep', attrs: 'data-v="2"' }) : step < 4 ? C.btn('Continue', { kind: 'primary', act: 'joinStep', attrs: `data-v="${step + 1}"` }) : C.btn('Join Riverside House', { kind: 'primary', icon: 'check', go: 'screen:home' })}</div>`;
    return authShell(ctx, card, { wide: step === 3, side: `<h1 class="auth-big">You’re invited.</h1><p class="muted">${C.avatar(alex, ctx, 'sm')} Alex added you to Riverside House. It takes a minute to join.</p>` });
  };

  /* privacy (public) and unsubscribe */
  M.privacy = (ctx) =>
    `<div class="public">
      <div class="auth-brand"><span class="mark">${icon('home', 18)}</span><b>Home Utilities</b></div>
      <header class="d3-title"><div class="eyebrow">Privacy · version 1 · September 2026</div><h1>Your bills, kept private</h1><p class="lede">What the app keeps, who sees it, and the one thing shared outside your household.</p></header>
      <div class="prose g">
        <h2>What’s kept</h2><p>The bills you forward or upload, the details on them, and how your household splits them. Everything stays on the household’s own server, with the original files kept as a record.</p>
        <h2>Who sees what</h2><p>Everyone in your household sees the household’s bills. Bills marked <b>just mine</b> are seen only by the person they belong to, admins included. Your PIN and your colours are yours alone.</p>
        <h2>Analysing bills</h2><p>To read the amounts and dates, a bill’s text (or, for a scan or photo, the image) is sent to Anthropic, the service that analyses it for us, under its commercial terms. Nothing else about your household is sent.</p>
        <h2>Area comparisons</h2><p>If your household shares them (it’s on unless an admin turns it off), your bills add to anonymous figures for your postcode and region: medians, never names, addresses or single households, and only once 10 or more households take part.</p>
        <h2>Leaving</h2><p>An admin can download everything as a zip, or delete the household. Deleting removes its bills, files and members.</p>
      </div>
    </div>`;
  M.unsubscribe = (ctx) =>
    authShell(
      ctx,
      `<div class="pin-head"><span class="empty-ic">${icon('bell', 24)}</span><h2>Reminders turned off</h2><p class="muted">You won’t get reminder emails any more. You’ll still hear about new bills.</p></div>${C.btn('Undo', { kind: 'glass', cls: 'wide', act: 'toast', attrs: 'data-msg="Reminders are back on"' })}${C.btn('Change what you get', { kind: 'plain', cls: 'wide', go: 'screen:settings' })}`,
      { side: `<h1 class="auth-big">Emails, your way.</h1><p class="muted">Choose exactly which emails you get in Settings → Emails.</p>` },
    );

  /* ---------- the wall (kiosk) ---------- */
  M.wallTop = () => {
    const wx = data.weather;
    return `<header class="wall-top"><div class="wall-time"><b>9:41</b><span>Tuesday 29 September</span></div><div class="wall-hh"><span class="mark">${icon('home', 18)}</span><b>${esc(data.household.name)}</b>${wx ? `<span class="muted">${esc(wx.place)} · ${wx.now.t}° ${esc(wx.now.sky.toLowerCase())}</span>` : ''}</div></header>`;
  };
  M.wallFoot = () =>
    `<footer class="wall-foot"><span class="muted small">Updates every minute · last at 9:41</span><button class="back wall-back" data-go="screen:home">${icon('chevron-left', 16)}<span>Back to Home</span></button></footer>`;
})();
