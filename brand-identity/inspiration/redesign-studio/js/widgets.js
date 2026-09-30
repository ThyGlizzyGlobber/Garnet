/*
  Home is a widget grid, like iOS home-screen widgets.
  - The grid is fixed per device (e.g. 5 × 3 blocks on desktop) and always
    fits the screen; extra widgets flow onto further pages (swipe / dots).
  - Widgets come in block sizes (1×1, 2×1, 2×2, 5×1 …) and draw more detail
    as they grow.
  - Edit mode: drag to rearrange (across pages too), tap the size badge to
    resize, − to remove, + to add from the gallery, and change grid density.
*/
(function () {
  const HU = (window.HU = window.HU || {});
  const { data, fmt, icon, C, ch } = HU;
  const esc = C.esc;
  const W = (HU.widgets = {});

  const hdr = (ic, title, right) =>
    `<header class="wg-h">${icon(ic, 15)}<span class="wg-t">${esc(title)}</span>${right ? `<span class="wg-hr">${right}</span>` : ''}</header>`;
  const you = () => data.memberById[data.you];

  function upcoming() {
    const out = [];
    data.bills.forEach((b) => {
      const st = data.billStatus(b);
      if (st.key === 'paid') return;
      const n = data.diff(data.TODAY, st.due);
      if (n > 30) return;
      const svc = data.serviceById[b.service];
      const ins = data.nextInstalment(b);
      let amount;
      let label;
      if (!data.household.split) {
        const payer = data.memberById[svc.payer];
        amount = C.billAmount(b);
        label = b.personal ? 'Just yours' : svc.payer === data.you ? `You pay ${svc.short}` : `${payer ? payer.name : ''} pays ${svc.short}`;
        out.push({ b, svc, st, amount, label, n, share: false, ins });
        return;
      }
      const mine = (ins ? ins.shares : b.shares).find((s) => s.member === data.you);
      if (!mine) return;
      if (b.personal) {
        amount = C.billAmount(b);
        label = 'Just yours';
      } else if (svc.payer === data.you) {
        amount = C.billAmount(b);
        label = `You pay ${svc.short}`;
      } else if (mine.paid) return;
      else {
        amount = mine.amount;
        label = `Your share · to ${data.memberById[svc.payer].name}`;
      }
      out.push({ b, svc, st, amount, label, n, share: !b.personal && svc.payer !== data.you, ins });
    });
    return out.sort((a, b) => a.n - b.n);
  }
  W.upcoming = upcoming;

  const upRow = (u, ctx) =>
    `<button class="up-row" data-go="bill:${u.b.id}">${C.disc(u.svc, ctx, 'sm')}<span class="up-main"><b>${esc(u.svc.name)}${u.ins ? ` <span class="muted">· ${u.ins.n} of ${u.b.plan.instalments.length}</span>` : ''}</b><span>${esc(u.label)}</span></span><span class="up-end"><b>${fmt.money(u.amount)}</b><span class="up-when t-${u.st.tone}">${esc(fmt.rel(u.st.due))}</span></span></button>`;

  /* ---------- catalogue ---------- */
  W.catalog = [
    {
      id: 'month',
      name: 'This month so far',
      desc: 'What September has cost so far, and where it’s heading.',
      icon: 'calendar',
      sizes: [[2, 1], [3, 1], [4, 1], [5, 1], [2, 2], [3, 2], [4, 2]],
      render(ctx, w, h) {
        const tm = data.thisMonth;
        const lm = data.lastMonth;
        const chg = (tm.total - lm.total) / lm.total;
        const svcParts = data.services
          .filter((s) => !s.owner)
          .map((s) => ({ s, v: tm.bySvc[s.id] }))
          .sort((a, b) => b.v - a.v);
        const stack = ch.stack(
          svcParts.map(({ s, v }) => ({ value: v, colour: C.col(ctx, s), label: s.name, text: fmt.money(v, true), tip: `${s.name} · ${fmt.money(v)}` })),
          { thin: true },
        );
        const known = ch.stack(
          [
            { value: tm.known, colour: 'var(--p-accent)', label: 'Billed', text: fmt.money(tm.known) },
            { value: tm.est, colour: 'var(--p-accent)', hatch: true, label: 'Estimated', text: fmt.money(tm.est) },
          ],
          {},
        );
        const main = `<div class="m-main">
          ${hdr('calendar', 'September so far', w >= 3 ? `<span class="muted">Day 29 of 30</span>` : '')}
          <div class="m-fig">${C.money(tm.known, 'wg-fig')}<span class="m-cap">billed</span></div>
          <p class="wg-line">Tracking to <b>${fmt.money(tm.total, true)}</b> · ${fmt.pct(chg)} ${chg < 0 ? 'under' : 'over'} August</p>
          ${known}
          ${h > 1 || w <= 2 ? '' : `<div class="wg-legend"><span><i class="lg"></i>${fmt.money(tm.known, true)} billed</span><span><i class="lg hatch"></i>${fmt.money(tm.est, true)} estimated</span></div>`}
        </div>`;
        const bySvc = `<div class="m-svc">
          <div class="eyebrow">By service</div>${stack}
          <div class="m-svc-list">${svcParts
            .slice(0, w >= 4 || h > 1 ? 6 : 3)
            .map(({ s, v }) => `<button class="m-svc-i" data-go="service:${s.id}"><i style="--c:${C.col(ctx, s)}"></i><span>${esc(s.name)}</span><b>${fmt.money(v, true)}</b></button>`)
            .join('')}</div>
        </div>`;
        const yours = `<div class="m-you">
          <div class="eyebrow">Your share</div>
          ${ch.ring(data.yourMonth.total / tm.total, { size: 74, inner: `<b>${Math.round((data.yourMonth.total / tm.total) * 100)}%</b>` })}
          <div class="m-you-t"><b>${fmt.money(data.yourMonth.total, true)}</b><span class="muted">of ${fmt.money(tm.total, true)}</span></div>
        </div>`;
        const trend =
          h > 1
            ? `<div class="m-trend">${ch.trend(
                data.monthly.slice(-6).map((m) => ({ label: m.label, value: m.total / 100, short: fmt.money(m.total, true), tip: `${m.label} · ${fmt.money(m.total)}${m.est ? ' (part estimated)' : ''}` })),
                { axis: false, colour: 'var(--p-accent)', callout: false },
              )}</div>`
            : '';
        const mini = `<div class="m-mini">${stack}<div class="m-mini-l">${svcParts
          .slice(0, 3)
          .map(({ s, v }) => `<span><i style="--c:${C.col(ctx, s)}"></i>${esc(s.name)} ${fmt.money(v, true)}</span>`)
          .join('')}</div></div>`;
        if (w <= 2 && h === 1) return `<div class="m m-s">${main}${mini}</div>`;
        if (w <= 2) return `<div class="m m-tall">${main}${trend}</div>`;
        const showYours = w >= 4 && data.household.split;
        if (h === 1) return `<div class="m m-row">${main}${bySvc}${showYours ? yours : ''}</div>`;
        return `<div class="m m-big">${main}${showYours ? yours : ''}${bySvc}${trend}</div>`;
      },
    },
    {
      id: 'weather',
      name: 'Weather',
      desc: 'This week’s weather and what heating or cooling will cost.',
      icon: 'cloud-sun',
      sizes: [[1, 1], [2, 1], [2, 2], [3, 1]],
      render(ctx, w, h) {
        const wx = data.weather;
        const now = `<div class="wx-now">
          <div class="wx-place">${icon('pin', 13)}${esc(wx.place)}</div>
          <div class="wx-temp"><span>${wx.now.t}°</span>${icon(wx.now.icon, 34, 'wx-ic')}</div>
          <div class="wx-sky">${esc(wx.now.sky)} · H ${wx.now.hi}° L ${wx.now.lo}°</div>
        </div>`;
        const days = (n) =>
          `<div class="wx-days">${wx.days
            .slice(0, n)
            .map((d) => `<div class="wx-d${d.need ? ' ' + d.need : ''}"><span>${d.d}</span>${icon(d.icon, 20)}<b>${d.hi}°</b><span class="muted">${d.lo}°</span></div>`)
            .join('')}</div>`;
        if (w === 1) return `<div class="wx wx-s">${now}${C.chip('Heating day', 'warn', 'thermo')}</div>`;
        if (h === 1) return `<div class="wx wx-m">${now}${days(w >= 3 ? 6 : 4)}</div>`;
        return `<div class="wx wx-l">${now}${days(6)}<p class="wx-line">${icon('flame', 14)}${esc(wx.line)}</p><p class="muted small">Tinted days need heating. Weather data: Open-Meteo.</p></div>`;
      },
    },
    {
      id: 'nextdue',
      name: 'Next due',
      desc: 'What you pay next: your shares and the bills you pay.',
      icon: 'clock',
      sizes: [[1, 1], [2, 1], [2, 2], [3, 2], [2, 3]],
      render(ctx, w, h) {
        const list = upcoming();
        const first = list[0];
        if (w === 1 && h === 1) {
          return `<div class="nd nd-s">${hdr('clock', 'Next due')}
            <button class="nd-one" data-go="bill:${first.b.id}">${C.disc(first.svc, ctx, 'md')}<b>${esc(first.svc.name)}</b><span class="t-${first.st.tone} nd-when">${esc(fmt.rel(first.st.due))}</span></button>
            <div class="nd-amt">${C.money(first.amount, 'wg-fig sm')}</div>
            ${first.share && data.household.split ? C.btn('Mark paid', { kind: 'primary', size: 'sm', act: 'markpaid', attrs: `data-bill="${first.b.id}" data-ins="${first.ins ? first.ins.n : ''}"` }) : `<span class="muted small">${esc(first.label)}</span>`}
          </div>`;
        }
        const n = h === 1 ? (w >= 3 ? 3 : 2) : h === 2 ? 5 : 7;
        const week = list.filter((u) => u.n <= 7);
        return `<div class="nd">${hdr('clock', 'Next due', `<span class="muted">${fmt.money(data.sum(week), true)} this week</span>`)}
          <div class="nd-list">${list.slice(0, n).map((u) => upRow(u, ctx)).join('')}</div></div>`;
      },
    },
    {
      id: 'owes',
      name: 'Settle up',
      desc: 'Who owes whom between housemates.',
      icon: 'money',
      sizes: [[1, 1], [2, 1], [2, 2]],
      render(ctx, w, h) {
        const ppl = data.money.people;
        const net = ppl.reduce((a, p) => a + p.net, 0);
        const owed = data.sum(data.money.owedToYou);
        if (w === 1) {
          return `<div class="ow ow-s">${hdr('money', 'Settle up')}<div class="ow-fig">${C.money(net, 'wg-fig sm')}</div><span class="muted small">owed to you, after what you owe</span>${C.avatars(ppl.map((p) => p.member), ctx)}</div>`;
        }
        const rows = ppl
          .map((p) => {
            const m = data.memberById[p.member];
            const t = p.youOwe && p.owesYou ? `Owes you ${fmt.money(p.owesYou)} · you owe ${fmt.money(p.youOwe)}` : p.owesYou ? `Owes you ${fmt.money(p.owesYou)}` : `You owe ${fmt.money(p.youOwe)}`;
            return `<button class="ow-row" data-go="screen:money">${C.avatar(m, ctx, 'md')}<span class="ow-main"><b>${esc(m.name)}</b><span class="muted">${esc(t)}</span></span><span class="ow-net ${p.net >= 0 ? 'pos' : 'neg'}">${p.net >= 0 ? '+' : '−'}${fmt.money(Math.abs(p.net))}</span></button>`;
          })
          .join('');
        return `<div class="ow">${hdr('money', 'Settle up', `<span class="muted">${fmt.money(owed, true)} owed to you</span>`)}
          <div class="ow-list">${rows}</div>
          ${h > 1 ? `<div class="ow-acts">${C.btn('Remind', { kind: 'glass', size: 'sm', icon: 'bell', act: 'toast', attrs: 'data-msg="Reminder emailed to Jordan and Sam"' })}${C.btn('Settle up', { kind: 'primary', size: 'sm', icon: 'check', go: 'screen:money' })}</div><p class="muted small">You owe Jordan ${fmt.money(data.sum(data.money.youOwe))} for electricity, due tomorrow.</p>` : ''}
        </div>`;
      },
    },
    {
      id: 'trend',
      name: 'Monthly cost',
      desc: 'The last 12 months, each bill spread over the months it covers.',
      icon: 'chart',
      sizes: [[2, 1], [3, 1], [4, 1], [2, 2], [3, 2], [4, 2], [5, 2]],
      render(ctx, w, h) {
        const pts = data.monthly.map((m) => ({
          label: m.label,
          value: m.total / 100,
          short: fmt.money(m.total, true),
          tip: `${m.label} ${m.key.slice(0, 4)} · ${fmt.money(m.total)}${m.est ? ' · part estimated' : ''}`,
        }));
        const avg = data.monthly.reduce((a, m) => a + m.total, 0) / 12;
        return `<div class="tr${h > 1 ? ' tr-l' : ''}">${hdr('chart', 'Monthly cost', `<span class="muted">Avg ${fmt.money(avg, true)}</span>`)}
          ${ch.trend(pts, { axis: w >= 3 || h > 1, every: w >= 4 ? 1 : w >= 3 ? 2 : 3, axisFormat: (v) => '$' + (v / 1000).toFixed(1) + 'k', label: 'Monthly cost, last 12 months' })}</div>`;
      },
    },
    {
      id: 'services',
      name: 'Services',
      desc: 'Every service with what it’s costing this month.',
      icon: 'services',
      sizes: [[2, 1], [3, 1], [2, 2], [3, 2], [4, 2]],
      render(ctx, w, h) {
        const list = data.services.filter((s) => !s.owner);
        const n = h === 1 ? (w >= 3 ? 6 : 4) : 6;
        const tiles = list
          .slice(0, n)
          .map((s) => {
            const bl = data.billsFor(s.id);
            const spark = h > 1 ? ch.spark(data.monthly.map((m) => m.bySvc[s.id]), { colour: C.col(ctx, s) }) : '';
            return `<button class="sv-t" data-go="service:${s.id}" style="--svc:${C.col(ctx, s)}">${C.disc(s, ctx, h > 1 ? 'md' : 'sm')}<span class="sv-n">${esc(s.name)}</span><b>${fmt.money(data.thisMonth.bySvc[s.id], true)}</b>${spark}</button>`;
          })
          .join('');
        return `<div class="sv sv-${h > 1 ? 'l' : 'm'}" style="--n:${h > 1 ? (w >= 3 ? 3 : 2) : Math.min(n, w * 2)}">${hdr('services', 'Services', `<span class="muted">This month</span>`)}<div class="sv-grid">${tiles}</div></div>`;
      },
    },
    {
      id: 'usage',
      name: 'Electricity use',
      desc: 'Usage per day against the limit you set.',
      icon: 'bolt',
      sizes: [[1, 1], [2, 1], [2, 2]],
      render(ctx, w, h) {
        const svc = data.serviceById.power;
        const perDay = 1684 / 92;
        const limit = (600 * 12) / 365;
        const arc = ch.arc(perDay / (limit * 1.25), {
          colour: C.col(ctx, svc),
          mark: 1 / 1.25,
          inner: `<b>${perDay.toFixed(1)}</b><span>kWh a day</span>`,
        });
        const side =
          w > 1
            ? `<div class="us-side">${C.kv([['Your limit', `${limit.toFixed(1)} kWh`], ['Last year', '<span class="delta up">+5%</span>'], ['Similar homes', '16.7 kWh']])}${h > 1 ? `<div class="us-spark">${ch.spark(data.billsFor('power').slice().reverse().map((b) => b.usage / b.days), { colour: C.col(ctx, svc) })}</div>` : ''}</div>`
            : '';
        return `<button class="us${w > 1 ? ' us-m' : ''}" data-go="service:power">${hdr('bolt', 'Electricity')}<div class="us-body"><div class="us-arc">${arc}<span class="muted small">7% under your limit</span></div>${side}</div></button>`;
      },
    },
    {
      id: 'notices',
      name: 'Heads up',
      desc: 'Unusual bills, the season ahead and anything to confirm.',
      icon: 'bell',
      sizes: [[1, 1], [2, 1], [2, 2], [3, 1]],
      render(ctx, w, h) {
        const ns = data.notices;
        if (w === 1) {
          const n = ns[0];
          return `<button class="nt nt-s t-${n.tone}" data-go="${n.go}">${hdr('bell', 'Heads up', `<i class="badge">${ns.length}</i>`)}<span class="nt-ic">${icon(n.icon, 22)}</span><b>${esc(n.title)}</b><span class="muted small">${esc(n.body)}</span></button>`;
        }
        const k = h === 1 ? 2 : 3;
        return `<div class="nt">${hdr('bell', 'Heads up', `<span class="muted">${ns.length} things</span>`)}<div class="nt-list${h === 1 && w >= 3 ? ' row' : ''}">${ns.slice(0, k).map((n) => C.notice(n, { cls: 'compact' })).join('')}</div></div>`;
      },
    },
    {
      id: 'inbox',
      name: 'Inbox',
      desc: 'Bills and receipts as they’re analysed.',
      icon: 'inbox',
      sizes: [[1, 1], [2, 1], [2, 2], [3, 2]],
      render(ctx, w, h) {
        const recent = data.docs.filter((d) => !d.personal || true).slice(0, h > 1 ? 4 : 2);
        const needs = data.docs.filter((d) => d.needs).length;
        if (w === 1) {
          return `<button class="ib ib-s" data-go="screen:inbox">${hdr('inbox', 'Inbox')}<div class="ib-fig"><b>4</b><span>analysed this week</span></div>${needs ? C.chip(`${needs} to confirm`, 'warn', 'pencil') : C.analysed()}</button>`;
        }
        return `<div class="ib">${hdr('inbox', 'Inbox', needs ? C.chip(`${needs} to confirm`, 'warn') : '')}<div class="ib-list">${recent
          .map(
            (d) =>
              `<button class="ib-row" data-go="${d.bill ? 'bill:' + d.bill : 'sheet:doc:' + d.id}"><span class="doc-ic sm">${icon(d.type === 'email' ? 'mail' : 'file', 16)}</span><span class="ib-main"><b>${esc(d.title)}</b><span class="muted">${esc(d.how)} · ${fmt.date(d.arrived)}</span></span>${d.needs ? C.chip('Confirm', 'warn') : C.docChip(d)}</button>`,
          )
          .join('')}</div>${h > 1 ? C.addressCard() : ''}</div>`;
      },
    },
    {
      id: 'settled',
      name: 'Shares settled',
      desc: 'How many of this month’s shares are paid back.',
      icon: 'split',
      sizes: [[1, 1], [2, 1]],
      render(ctx, w) {
        const all = data.money.sharesThisMonth;
        const paid = all.filter((s) => s.paid).length;
        const ring = ch.ring(paid / all.length, { size: w > 1 ? 96 : 84, inner: `<b>${paid}<small>/${all.length}</small></b>` });
        if (w === 1) return `<div class="st st-s">${hdr('split', 'Settled')}<div class="st-ring">${ring}</div><span class="muted small">shares paid in September</span></div>`;
        const open = all.filter((s) => !s.paid);
        const byM = {};
        open.forEach((s) => (byM[s.member] = (byM[s.member] || 0) + 1));
        return `<div class="st st-m">${hdr('split', 'Shares settled')}<div class="st-body"><div class="st-ring">${ring}</div><div class="st-list">${Object.entries(byM)
          .map(([id, n]) => `<div class="st-row">${C.avatar(data.memberById[id], ctx, 'sm')}<span>${C.who(id)}</span><b>${n} open</b></div>`)
          .join('')}<span class="muted small">September’s shares</span></div></div></div>`;
      },
    },
    {
      id: 'forecast',
      name: 'Next six months',
      desc: 'Estimated household cost for the months ahead.',
      icon: 'trend-up',
      sizes: [[2, 1], [3, 1], [4, 1], [2, 2]],
      render(ctx, w) {
        const items = data.forecast.map((f) => ({ label: f.label, value: f.total, short: fmt.money(f.total, true), tip: `${f.label} · about ${fmt.money(f.total, true)}` }));
        return `<div class="fc">${hdr('trend-up', 'Next six months', `<span class="muted">Estimates</span>`)}${ch.pills(items, { showAll: w >= 3 })}</div>`;
      },
    },
    {
      id: 'setaside',
      name: 'Set aside',
      desc: 'What each person should put aside for next month.',
      icon: 'lock',
      sizes: [[1, 1], [2, 1]],
      render(ctx, w) {
        const each = { alex: 118600, jordan: 90100, sam: 90100 };
        if (w === 1) return `<div class="sa sa-s">${hdr('lock', 'Set aside')}${C.money(each.alex, 'wg-fig sm')}<span class="muted small">for you, for October</span></div>`;
        return `<div class="sa">${hdr('lock', 'Set aside for October')}<div class="sa-list">${data.members
          .map((m) => `<div class="sa-r">${C.avatar(m, ctx, 'sm')}<span>${C.who(m.id)}</span><b>${fmt.money(each[m.id], true)}</b></div>`)
          .join('')}</div></div>`;
      },
    },
    {
      id: 'mine',
      name: 'Just yours',
      desc: 'Your own bills. Only you see these.',
      icon: 'user',
      sizes: [[1, 1], [2, 1]],
      render(ctx, w) {
        const b = data.billById['rego-2026'];
        const svc = data.serviceById.rego;
        return `<button class="mn${w > 1 ? ' mn-m' : ''}" data-go="bill:${b.id}">${hdr('user', 'Just yours')}<div class="mn-body">${C.disc(svc, ctx, 'md')}<div class="mn-t"><b>${esc(svc.name)}</b><span class="muted">${esc(svc.provider)}</span></div>${C.money(b.amount, 'wg-fig sm')}${C.statusChip(data.billStatus(b))}</div></button>`;
      },
    },
    {
      id: 'plan',
      name: 'Council rates',
      desc: 'Where the instalment plan is up to.',
      icon: 'landmark',
      sizes: [[1, 1], [2, 1]],
      render(ctx, w) {
        const b = data.billById['rates-2026'];
        const ins = data.nextInstalment(b);
        const mine = ins.shares.find((s) => s.member === data.you);
        return `<button class="pl${w > 1 ? ' pl-m' : ''}" data-go="bill:${b.id}">${hdr('landmark', 'Council rates')}<div class="pl-body"><div><div class="pl-fig">${C.money(ins.amount, 'wg-fig sm')}</div><span class="muted small">Instalment ${ins.n} of 4 · ${esc(fmt.rel(ins.due))}</span></div>${C.instDots(b)}${w > 1 ? `<span class="pl-you">Your part ${fmt.money(mine.amount)}</span>` : ''}</div></button>`;
      },
    },
  ];

  /* ---------- widgets added with Almanac 2 (available to every direction) ---------- */
  const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayFull = (d) => DAY_FULL[new Date(d + 'T00:00:00Z').getUTCDay()];
  const ordinal = (n) => ['first', 'second', 'third', 'fourth'][n - 1] || `${n}th`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const andList = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

  /** Every due date (bills and instalments) between two days. */
  function dueItems(from, to) {
    const out = [];
    data.bills.forEach((b) => {
      const svc = data.serviceById[b.service];
      const list = b.plan
        ? b.plan.instalments.map((i) => ({ due: i.due, amount: i.amount, paid: !!i.paid, n: i.n }))
        : [{ due: b.due, amount: b.amount, paid: !!b.paid }];
      list.forEach((x) => x.due >= from && x.due <= to && out.push({ ...x, b, svc }));
    });
    return out.sort((a, b) => (a.due < b.due ? -1 : 1));
  }

  /** What happened lately: payments between housemates, bills paid, documents analysed. */
  function activity() {
    const since = data.addDays(data.TODAY, -16);
    const ev = [];
    data.bills.forEach((b) => {
      const svc = data.serviceById[b.service];
      const sets = b.plan ? b.plan.instalments.map((i) => [i.shares, i.n]) : [[b.shares, null]];
      sets.forEach(([sh, n]) =>
        sh.forEach((s) => {
          if (!s.paid || s.payer || s.paid < since) return;
          ev.push({ date: s.paid, who: s.member, go: `bill:${b.id}`, text: `${C.who(s.member)} paid ${C.whoLow(svc.payer)} ${fmt.money(s.amount)}`, sub: `${svc.name}${n ? `, instalment ${n}` : ''}` });
        }),
      );
      if (b.paid && !b.plan && !b.personal && b.paid >= since)
        ev.push({ date: b.paid, who: svc.payer, go: `bill:${b.id}`, text: `${C.who(svc.payer)} paid ${svc.short} ${fmt.money(b.amount)}`, sub: `${svc.name} bill` });
    });
    data.docs.forEach((d) => {
      if (d.arrived < since) return;
      const text = d.status === 'waiting' ? `${d.title} arrived` : d.status === 'failed' ? `${d.title} couldn’t be analysed` : d.needs ? d.title : `${d.title} analysed`;
      ev.push({ date: d.arrived, doc: d, go: d.bill ? `bill:${d.bill}` : `sheet:doc:${d.id}`, text, sub: d.status === 'waiting' ? 'Waiting to be analysed' : d.needs || d.how });
    });
    return ev.sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  W.activity = activity;

  const svcNote = { power: '+5% on last year', gas: '+32% on last winter', water: '+3% on last year', net: '+$4 since July', rent: 'Same since February 2025', rates: '+4.2% on last year' };

  W.catalog.push(
    {
      id: 'calendar',
      name: 'Due dates',
      desc: 'Five weeks at a glance, with every due date marked.',
      icon: 'calendar',
      sizes: [[1, 1], [2, 1], [2, 2], [3, 2]],
      render(ctx, w, h) {
        const today = data.TODAY;
        const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
        const start = data.addDays(today, -dow - 7);
        const end = data.addDays(start, 34);
        const items = dueItems(start, end);
        const ahead = items.filter((x) => !x.paid && x.due >= today);
        const next = ahead[0];
        if (w === 1 && h === 1) {
          const same = ahead.filter((x) => x.due === next.due);
          return `<button class="cal cal-s" data-go="bill:${next.b.id}">${hdr('calendar', 'Next due')}
            <div class="cal-leaf"><span class="cal-mon">${fmt.mon(next.due)}</span><b>${+next.due.slice(8)}</b><span class="cal-dow">${dayFull(next.due)}</span></div>
            <span class="cal-cap">${same.length} due · ${fmt.money(data.sum(same), true)}</span></button>`;
        }
        const byDay = {};
        items.forEach((x) => (byDay[x.due] = byDay[x.due] || []).push(x));
        const cell = (d) => {
          const its = byDay[d] || [];
          const cls = ['cal-d', d === today ? 'today' : '', d < today ? 'past' : '', its.length ? 'has' : '', its.length && its.every((x) => x.paid) ? 'done' : ''].join(' ');
          const label = d.slice(8) === '01' ? fmt.mon(d) : +d.slice(8);
          if (!its.length) return `<span class="${cls}"><span>${label}</span></span>`;
          const tip = its.map((x) => `${x.svc.name} ${fmt.money(x.amount)}${x.paid ? ' (paid)' : ''}`).join(', ');
          return `<button class="${cls}" data-go="bill:${its[0].b.id}" title="${esc(`${fmt.date(d)}: ${tip}`)}"><span>${label}</span><span class="cal-dots">${its.slice(0, 3).map((x) => `<i style="--c:${C.col(ctx, x.svc)}"></i>`).join('')}</span></button>`;
        };
        const head = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l) => `<span class="cal-h">${l}</span>`).join('');
        if (h === 1) {
          const s2 = data.addDays(today, -dow);
          return `<div class="cal cal-m">${hdr('calendar', 'Due dates', '<span class="muted">Next two weeks</span>')}<div class="cal-grid">${head}${Array.from({ length: 14 }, (_, i) => cell(data.addDays(s2, i))).join('')}</div></div>`;
        }
        const list = ahead
          .slice(0, w >= 3 ? 5 : 3)
          .map((x) => `<button class="cal-li" data-go="bill:${x.b.id}"><i style="--c:${C.col(ctx, x.svc)}"></i><span>${esc(x.svc.name)}${x.n ? ` · ${x.n} of 4` : ''}</span><b>${esc(fmt.rel(x.due) === 'Tomorrow' ? 'Tomorrow' : fmt.date(x.due))}</b></button>`)
          .join('');
        return `<div class="cal cal-l${w >= 3 ? ' wide' : ''}">${hdr('calendar', 'Due dates', `<span class="muted">${fmt.date(start)} – ${fmt.date(end)}</span>`)}<div class="cal-body"><div class="cal-grid">${head}${Array.from({ length: 35 }, (_, i) => cell(data.addDays(start, i))).join('')}</div><div class="cal-list">${list}</div></div></div>`;
      },
    },
    {
      id: 'activity',
      name: 'Recent activity',
      desc: 'Payments between housemates, bills paid and documents analysed.',
      icon: 'list',
      sizes: [[2, 1], [2, 2], [3, 2], [2, 3]],
      render(ctx, w, h) {
        const ev = activity().slice(0, h === 1 ? 2 : h === 2 ? 5 : 8);
        return `<div class="act">${hdr('list', 'Recent activity')}<div class="act-list">${ev
          .map(
            (e) =>
              `<button class="act-row" data-go="${e.go}">${e.doc ? `<span class="doc-ic sm">${icon(e.doc.type === 'email' ? 'mail' : 'file', 15)}</span>` : C.avatar(data.memberById[e.who], ctx, 'sm')}<span class="act-main"><b>${esc(e.text)}</b><span class="muted">${esc(e.sub)}</span></span><span class="act-when">${esc(fmt.rel(e.date))}</span></button>`,
          )
          .join('')}</div></div>`;
      },
    },
    {
      id: 'week',
      name: 'This week in the house',
      desc: 'The week ahead in a few plain sentences.',
      icon: 'home',
      sizes: [[2, 1], [3, 1], [2, 2], [3, 2]],
      render(ctx, w, h) {
        const up = upcoming().filter((u) => u.n <= 7);
        const soon = up.filter((u) => u.n <= 1);
        const later = up.filter((u) => u.n > 1);
        const nm = (u) =>
          u.share ? `your <b>${fmt.money(u.amount)}</b> share of ${u.svc.name.toLowerCase()}` : u.ins ? `the ${ordinal(u.ins.n)} council rates instalment` : `${u.svc.name.toLowerCase()} (<b>${fmt.money(u.amount, true)}</b>)`;
        const s = [];
        if (soon.length) s.push(`${cap(andList(soon.map(nm)))} ${soon.length > 1 ? 'are' : 'is'} due ${soon[0].n === 0 ? 'today' : 'tomorrow'}.`);
        if (later.length) s.push(`Then ${andList(later.map((u) => `${u.svc.name.toLowerCase()} on ${dayFull(u.st.due)}`))}.`);
        const od = data.money.debts.filter((d) => d.from !== data.you && d.to !== data.you && d.due < data.TODAY);
        od.slice(0, 1).forEach((d) => s.push(`${data.memberById[d.from].name} still owes ${data.memberById[d.to].name} <b>${fmt.money(d.amount)}</b> for ${data.serviceById[data.billById[d.bill].service].name.toLowerCase()}.`));
        const cold = data.weather ? data.weather.days.slice(0, 3).filter((d) => d.need === 'heat').length : 0;
        if (cold) s.push(`${cap(['one', 'two', 'three'][cold - 1])} cold ${cold > 1 ? 'days' : 'day'} ahead, so gas will stay high.`);
        const n = h > 1 || w >= 3 ? s.length : 3;
        return `<div class="wk">${hdr('home', 'This week in the house')}<p class="wk-p">${s.slice(0, n).map((x) => `<span class="wk-s">${x} </span>`).join('')}</p></div>`;
      },
    },
    {
      id: 'actions',
      name: 'Quick actions',
      desc: 'Add a bill, upload one, copy the bills address or record a payment.',
      icon: 'plus',
      sizes: [[1, 1], [2, 1]],
      render(ctx, w) {
        const acts = [
          ['plus', 'Add a bill', '', 'sheet:add'],
          ['upload', 'Upload', '', 'screen:upload'],
          ['copy', 'Bills address', 'Address copied', ''],
          ['money', 'Record payment', '', 'sheet:pay'],
        ].filter((a) => a[0] !== 'money' || data.household.split);
        return `<div class="qa${w > 1 ? ' qa-m' : ''}">${hdr('plus', 'Quick actions')}<div class="qa-grid">${acts
          .map(([ic, l, m, go]) => `<button class="qa-b" ${go ? `data-go="${go}"` : `data-act="toast" data-msg="${esc(m)}"`} title="${esc(l)}" aria-label="${esc(l)}">${icon(ic, 18)}<span>${esc(l)}</span></button>`)
          .join('')}</div></div>`;
      },
    },
    {
      id: 'season',
      name: 'Season ahead',
      desc: 'What last summer did to the energy bills.',
      icon: 'sun',
      sizes: [[1, 1], [2, 1], [2, 2]],
      render(ctx, w) {
        const days = data.diff(data.TODAY, '2026-12-01');
        const rows = [
          [data.serviceById.power, 4.6, 5.4, '+18%', 'up'],
          [data.serviceById.gas, 3.2, 1.9, '−40%', 'down'],
        ];
        if (w === 1)
          return `<button class="sn sn-s" data-go="service:power">${hdr('sun', 'Season ahead')}<div class="sn-fig"><b>${days}</b><span>days to summer</span></div><span class="sn-cap">Electricity ran <b>18% higher</b> last summer</span></button>`;
        return `<button class="sn sn-m" data-go="service:power">${hdr('sun', 'Summer starts 1 Dec', `<span class="muted">in ${days} days</span>`)}<div class="sn-rows">${rows
          .map(
            ([s, a, b, t, dir]) =>
              `<div class="sn-r"><span class="sn-n">${C.disc(s, ctx, 'sm')}<span>${esc(s.name)}</span></span><span class="sn-bars"><i class="spring" style="width:${(a / 6) * 100}%"></i><i style="width:${(b / 6) * 100}%;--c:${C.col(ctx, s)}"></i></span><b class="delta ${dir}">${t}</b></div>`,
          )
          .join('')}</div><span class="muted small">Last spring (grey) against last summer, per day. About $27 a month more for power.</span></button>`;
      },
    },
  );
  W.catalog.push(
    {
      id: 'start',
      name: 'Get started',
      desc: 'The first few steps for a new household.',
      icon: 'check',
      sizes: [[3, 2], [2, 2], [2, 3], [4, 2]],
      render(ctx, w, h) {
        const steps = [
          [true, 'Household set up', 'Riverside House · Australian dollars · Melbourne time'],
          [false, 'Forward your first bill', `From your own inbox to ${data.household.address}. Its service sets itself up.`],
          [false, 'Jordan and Sam are invited', 'They choose their own colours and PIN when they join.'],
          [data.household.postcode, 'Postcode added', data.household.postcode ? 'Weather and season notes are on.' : 'Add it for weather and season notes.'],
        ];
        const done = steps.filter((x) => x[0]).length;
        return `<div class="gs">${hdr('check', 'Get started', `<span class="muted">${done} of ${steps.length} done</span>`)}
          <ol class="gs-list">${steps.map(([ok, t, sub]) => `<li class="${ok ? 'done' : ''}"><i class="gs-dot">${ok ? icon('check', 12) : ''}</i><span><b>${esc(t)}</b><span class="muted small">${esc(sub)}</span></span></li>`).join('')}</ol>
          <div class="gs-acts">${C.btn('Copy the address', { kind: 'primary', size: 'sm', icon: 'copy', act: 'toast', attrs: 'data-msg="Address copied"' })}${C.btn('Upload a bill', { kind: 'glass', size: 'sm', icon: 'upload', go: 'screen:upload' })}${w >= 3 ? C.btn('Enter one by hand', { kind: 'plain', size: 'sm', go: 'screen:billNew' }) : ''}</div>
        </div>`;
      },
    },
    {
      id: 'postcode',
      name: 'Add your postcode',
      desc: 'Turns on weather and season notes.',
      icon: 'pin',
      sizes: [[1, 1], [2, 1]],
      render(ctx, w) {
        return `<div class="pc${w > 1 ? ' pc-m' : ''}">${hdr('pin', 'Weather')}<p class="pc-t">Add your postcode to see the week’s weather and what heating or cooling will cost.</p>${C.btn('Add postcode', { kind: 'glass', size: 'sm', icon: 'pin', go: 'screen:settings' })}</div>`;
      },
    },
  );

  // One small tile per household service.
  data.services
    .filter((s) => !s.owner)
    .forEach((s) =>
      W.catalog.push({
        id: `svc-${s.id}`,
        name: s.name,
        desc: `${s.provider}: this month, its trend and the latest bill.`,
        icon: s.icon,
        sizes: [[1, 1], [2, 1]],
        render(ctx, w) {
          const b0 = data.billsFor(s.id)[0];
          const spark = ch.spark(data.monthly.map((m) => m.bySvc[s.id]), { colour: C.col(ctx, s) });
          const top = `<div class="svt-top">${C.disc(s, ctx, 'sm')}<span class="svt-n">${esc(s.name)}</span></div>`;
          const fig = `<div class="svt-fig"><b>${fmt.money(data.thisMonth.bySvc[s.id], true)}</b><span>this month</span></div>`;
          if (w === 1) return `<button class="svt" data-go="service:${s.id}" style="--svc:${C.col(ctx, s)}">${top}${fig}<div class="svt-spark">${spark}</div></button>`;
          return `<button class="svt svt-m" data-go="service:${s.id}" style="--svc:${C.col(ctx, s)}"><div class="svt-l">${top}${fig}<div class="svt-spark">${spark}</div></div><div class="svt-r"><span class="muted small">Latest bill</span><b>${fmt.money(C.billAmount(b0))}</b>${C.statusChip(data.billStatus(b0))}<span class="muted small">${esc(svcNote[s.id])}</span></div></button>`;
        },
      }),
    );
  W.byId = Object.fromEntries(W.catalog.map((w) => [w.id, w]));

  /* ---------- states: brand new, not splitting, no postcode ---------- */
  const EMPTY = {
    month: ['Nothing billed yet', 'This month fills in as bills arrive.'],
    week: ['A quiet week', 'Once bills arrive, the week ahead is summed up here.'],
    nextdue: ['Nothing due', 'Bills show up here with their due dates.'],
    owes: ['All square', 'Shares appear once bills are split.'],
    services: ['No services yet', 'Each provider’s first bill sets up its service.'],
    trend: ['Not enough months yet', 'The trend starts after two months of bills.'],
    calendar: ['No due dates yet', 'Due dates appear here as bills arrive.'],
    activity: ['Nothing yet', 'New bills and payments show up here.'],
    settled: ['Nothing to settle', 'Shares due this month appear here.'],
    forecast: ['Estimates come later', 'After a few bills, the months ahead are estimated.'],
    season: ['Season notes come later', 'They compare with the same time last year.'],
    usage: ['No usage yet', 'Usage appears from the first electricity bill.'],
    inbox: ['Nothing here yet', 'Forwarded bills appear as they’re analysed.'],
    notices: ['Nothing to flag', 'Unusual bills and things to confirm show up here.'],
    setaside: ['Nothing to set aside', 'Estimates start after a few bills.'],
    plan: ['No instalments', 'Bills paid by instalments show their progress here.'],
    mine: ['Nothing just yours', 'Your own bills, like car rego, show here.'],
  };
  const ALWAYS = new Set(['weather', 'start', 'actions', 'postcode']);
  function emptyWidget(def, w, h) {
    const [t, sub] = EMPTY[def.id] || ['Nothing yet', 'This fills in as bills arrive.'];
    return `<div class="wg-empty">${hdr(def.icon, def.name)}<div class="we-body"><span class="we-ic">${icon(def.icon, 20)}</span><b>${esc(t)}</b>${h > 1 || w > 1 ? `<span class="muted small">${esc(sub)}</span>` : ''}</div></div>`;
  }
  const SPLIT_ONLY = { owes: 'calendar', settled: 'plan', setaside: 'forecast' };
  /** What this household can show in place of a widget it can't (not splitting, no postcode). */
  function swapFor(id) {
    if (!data.household.split && SPLIT_ONLY[id]) return SPLIT_ONLY[id];
    if (!data.household.postcode && id === 'weather') return 'postcode';
    return id;
  }
  W.available = (def) => !(!data.household.split && SPLIT_ONLY[def.id]) && !(!data.household.postcode && def.id === 'weather') && !(data.household.postcode && def.id === 'postcode') && def.id !== 'start';
  const FRESH = {
    desktop: [[['start', 3, 2], ['weather', 2, 1], ['week', 2, 1], ['month', 2, 1], ['nextdue', 3, 1]]],
    tabletL: [[['start', 3, 2], ['weather', 2, 1], ['week', 2, 1], ['month', 2, 1], ['nextdue', 3, 1]]],
    tabletP: [[['start', 3, 2], ['weather', 1, 1], ['week', 3, 1], ['month', 2, 1], ['nextdue', 1, 1]]],
    phone: [[['start', 2, 2], ['weather', 2, 1], ['week', 2, 1]], [['month', 2, 1], ['nextdue', 2, 1]]],
  };
  /** The wall (kiosk): fewer, bigger widgets. */
  W.WALL = { grid: { desktop: [4, 2], tabletL: [4, 2], tabletP: [2, 3], phone: [2, 3] }, layout: [[['month', 2, 2], ['week', 2, 1], ['nextdue', 1, 1], ['weather', 1, 1]]] };

  /* ---------- grids ---------- */
  W.grids = {
    desktop: { comfy: [4, 3], standard: [5, 3], dense: [6, 4] },
    tabletP: { comfy: [3, 4], standard: [4, 5], dense: [4, 6] },
    tabletL: { comfy: [4, 3], standard: [5, 3], dense: [6, 4] },
    phone: { comfy: [2, 3], standard: [2, 4], dense: [2, 5] },
  };

  function findSpot(occ, cols, rows, w, h) {
    for (let r = 0; r + h <= rows; r++)
      for (let c = 0; c + w <= cols; c++) {
        let ok = true;
        for (let y = r; y < r + h && ok; y++) for (let x = c; x < c + w && ok; x++) if (occ[y][x]) ok = false;
        if (ok) return { r, c };
      }
    return null;
  }
  /** Place each page's widgets first-fit; whatever doesn't fit moves to the next page. */
  W.pack = function (pages, cols, rows) {
    const out = [];
    let carry = [];
    for (let p = 0; p < pages.length || carry.length; p++) {
      if (p > 40) break;
      const items = carry.concat(pages[p] || []);
      carry = [];
      const occ = Array.from({ length: rows }, () => Array(cols).fill(false));
      const placed = [];
      items.forEach((it) => {
        const w = Math.min(it.w, cols);
        const h = Math.min(it.h, rows);
        const s = findSpot(occ, cols, rows, w, h);
        if (!s) return carry.push(it);
        for (let y = s.r; y < s.r + h; y++) for (let x = s.c; x < s.c + w; x++) occ[y][x] = true;
        placed.push({ ...it, pw: w, ph: h, r: s.r, c: s.c });
      });
      out.push(placed);
    }
    return out;
  };

  /* ---------- state per direction × device ---------- */
  const STORE = 'hu-studio-home-v2';
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {};
  } catch (e) {
    saved = {};
  }
  const live = {};
  const persist = () => {
    try {
      const out = {};
      Object.entries(live).forEach(([k, v]) => (out[k] = { density: v.density, pages: v.pages }));
      localStorage.setItem(STORE, JSON.stringify(out));
    } catch (e) {
      /* storage unavailable: layouts last for this visit only */
    }
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function defaults(ctx) {
    const d = ctx.dir.home;
    let pages;
    if (ctx.wall) pages = W.WALL.layout;
    else if (data.household.fresh) pages = FRESH[ctx.deviceKey];
    // Tablet landscape shares the desktop grid; portrait reflows the desktop order.
    else pages = d[ctx.deviceKey] || (ctx.deviceKey === 'tabletL' ? d.desktop : [d.desktop.flat()]);
    const dens = typeof d.density === 'object' ? d.density[ctx.deviceKey] || d.density.desktop : d.density;
    const seen = new Set();
    const swapped = pages.map((pg) =>
      pg
        .map(([id, w, h]) => ({ id: swapFor(id), w, h }))
        .filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true))),
    );
    return { density: dens || 'standard', pages: clone(swapped) };
  }
  const homeKey = (ctx) =>
    `${ctx.dir.id}${ctx.dir.homeRev ? 'r' + ctx.dir.homeRev : ''}${ctx.wall ? 'w' : ''}:${data.scenario && data.scenario !== 'demo' ? data.scenario + ':' : ''}${ctx.deviceKey}`;
  W.state = function (ctx) {
    const key = homeKey(ctx);
    if (!live[key]) {
      const s = saved[key] ? clone(saved[key]) : defaults(ctx);
      live[key] = { key, density: s.density, pages: s.pages, editing: false };
    }
    return live[key];
  };
  W.reset = function (ctx) {
    const key = homeKey(ctx);
    const s = defaults(ctx);
    live[key] = { key, density: s.density, pages: s.pages, editing: live[key] ? live[key].editing : false };
    persist();
  };
  W.resetAll = function () {
    Object.keys(live).forEach((k) => delete live[k]);
    saved = {};
    try {
      localStorage.removeItem(STORE);
    } catch (e) {
      /* nothing stored */
    }
  };

  /* ---------- render ---------- */
  function widgetHtml(ctx, it, st) {
    const def = W.byId[it.id];
    if (!def) return '';
    const sizes = def.sizes.filter(([w, h]) => w <= st.cols && h <= st.rows);
    return `<section class="widget g" data-wid="${it.id}" data-w="${it.pw}" data-h="${it.ph}" style="grid-column:${it.page * st.cols + it.c + 1} / span ${it.pw};grid-row:${it.r + 1} / span ${it.ph}" aria-label="${esc(def.name)}">
      <div class="wg-in">${data.household.fresh && !ALWAYS.has(def.id) ? emptyWidget(def, it.pw, it.ph) : def.render(ctx, it.pw, it.ph, st.cols)}</div>
      <button class="wg-remove" data-hact="remove" data-wid="${it.id}" aria-label="Remove ${esc(def.name)}">${icon('minus', 14)}</button>
      ${sizes.length > 1 ? `<button class="wg-size" data-hact="size" data-wid="${it.id}" aria-label="Change size">${icon('resize', 12)}<span>${it.pw}×${it.ph}</span></button>` : ''}
    </section>`;
  }
  function gridInner(ctx, st) {
    const packed = W.pack(st.pages, st.cols, st.rows);
    st.packed = packed;
    const n = Math.max(1, packed.filter((p) => p.length).length + (st.editing ? 1 : 0));
    st.pageCount = n;
    let html = '';
    for (let p = 0; p < n; p++) {
      html += `<i class="hg-page" style="grid-column:${p * st.cols + 1} / span ${st.cols};grid-row:1 / -1"></i>`;
      for (let r = 0; r < st.rows; r++)
        for (let c = 0; c < st.cols; c++) html += `<i class="hg-slot" style="grid-column:${p * st.cols + c + 1};grid-row:${r + 1}"></i>`;
    }
    packed.slice(0, n).forEach((pg, p) => pg.forEach((it) => (html += widgetHtml(ctx, { ...it, page: p }, st))));
    return { html, n };
  }
  W.render = function (ctx) {
    const st = W.state(ctx);
    const [cols, rows] = ctx.wall ? W.WALL.grid[ctx.deviceKey] : W.grids[ctx.deviceKey][st.density];
    st.cols = cols;
    st.rows = rows;
    const { html, n } = gridInner(ctx, st);
    const dens = Object.entries(W.grids[ctx.deviceKey]).map(([k, [c, r]]) => [k, `${c}×${r}`]);
    return `<div class="home" data-editing="${st.editing}">
      <div class="home-edit" ${st.editing ? '' : 'hidden'}>
        ${C.btn('Add widget', { kind: 'glass', icon: 'plus', size: 'sm', attrs: 'data-hact="add"' })}
        ${ctx.wall ? '<span class="home-dens"></span>' : `<div class="home-dens"><span class="muted small">Grid</span>${C.seg(dens, st.density, 'density', 'seg-sm')}</div>`}
        ${C.btn('Reset', { kind: 'plain', size: 'sm', attrs: 'data-hact="reset"' })}
        ${C.btn('Done', { kind: 'primary', size: 'sm', attrs: 'data-hact="done"' })}
      </div>
      <div class="hg-scroller"><div class="hg" style="--cols:${cols};--rows:${rows};grid-template-columns:repeat(${cols * n}, var(--colw))">${html}</div></div>
      <div class="hg-foot">
        <div class="hg-dots" ${n > 1 ? '' : 'hidden'}>${Array.from({ length: n }, (_, i) => `<button class="hg-dot" data-page="${i}" aria-label="Page ${i + 1}"></button>`).join('')}</div>
        ${st.editing ? '' : `<button class="hg-edit" data-hact="edit">${icon('grid', 15)}<span>Edit Home</span></button>`}
      </div>
    </div>`;
  };

  /* ---------- interaction (per frame) ---------- */
  W.mount = function (root, ctx, rerenderApp) {
    const home = root.querySelector('.home');
    if (!home) return;
    const st = W.state(ctx);
    const scroller = home.querySelector('.hg-scroller');
    let grid = home.querySelector('.hg');

    const pageW = () => grid.querySelector('.hg-page').getBoundingClientRect().width;
    const gapPx = () => parseFloat(getComputedStyle(grid).columnGap) || 0;
    const scale = () => grid.getBoundingClientRect().width / grid.offsetWidth || 1;
    const pageNow = () => Math.round(scroller.scrollLeft / ((pageW() / scale() + gapPx()) || 1));
    const dots = () => home.querySelectorAll('.hg-dot');
    const markDot = () => dots().forEach((d, i) => d.setAttribute('aria-current', i === pageNow()));
    const goPage = (p, smooth) => scroller.scrollTo({ left: p * (pageW() / scale() + gapPx()), behavior: smooth ? 'smooth' : 'auto' });

    if (st.page) goPage(Math.min(st.page, st.pageCount - 1), false);
    markDot();
    scroller.addEventListener('scroll', () => {
      markDot();
      st.page = pageNow();
    }, { passive: true });

    function rebuild(keepPage) {
      const before = {};
      grid.querySelectorAll('.widget').forEach((w) => (before[w.dataset.wid] = w.getBoundingClientRect()));
      const p = pageNow();
      const { html, n } = gridInner(ctx, st);
      grid.style.gridTemplateColumns = `repeat(${st.cols * n}, var(--colw))`;
      grid.innerHTML = html;
      const dotsEl = home.querySelector('.hg-dots');
      dotsEl.hidden = n <= 1;
      dotsEl.innerHTML = Array.from({ length: n }, (_, i) => `<button class="hg-dot" data-page="${i}" aria-label="Page ${i + 1}"></button>`).join('');
      if (keepPage !== false) goPage(Math.min(p, n - 1), false);
      markDot();
      flip(before);
    }
    function flip(before, skip) {
      grid.querySelectorAll('.widget').forEach((w) => {
        if (w === skip) return;
        const a = before[w.dataset.wid];
        if (!a) return;
        const b = w.getBoundingClientRect();
        const s = scale();
        const dx = (a.left - b.left) / s;
        const dy = (a.top - b.top) / s;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        w.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }
    function setEditing(on) {
      st.editing = on;
      if (!on) st.pages = st.pages.filter((p) => p.length);
      persist();
      rerenderApp();
    }
    const locate = (id) => {
      for (let p = 0; p < st.pages.length; p++) {
        const i = st.pages[p].findIndex((x) => x.id === id);
        if (i >= 0) return { p, i };
      }
      return null;
    };
    // Keep the stored pages in step with what's actually shown (overflow moves on).
    const normalise = () => {
      const packed = W.pack(st.pages, st.cols, st.rows);
      st.pages = packed.map((pg) => pg.map(({ id, w, h }) => ({ id, w, h })));
    };

    home.addEventListener('click', (e) => {
      const b = e.target.closest('[data-hact]');
      if (b) {
        e.stopPropagation();
        const act = b.dataset.hact;
        if (act === 'edit') return setEditing(true);
        if (act === 'done') return setEditing(false);
        if (act === 'reset') {
          W.reset(ctx);
          W.state(ctx).editing = true;
          return rerenderApp();
        }
        if (act === 'add') return openGallery();
        if (act === 'remove') {
          const at = locate(b.dataset.wid);
          if (at) st.pages[at.p].splice(at.i, 1);
          persist();
          return rebuild();
        }
        if (act === 'size') {
          const at = locate(b.dataset.wid);
          const it = st.pages[at.p][at.i];
          const sizes = W.byId[it.id].sizes.filter(([w, h]) => w <= st.cols && h <= st.rows);
          const cur = sizes.findIndex(([w, h]) => w === Math.min(it.w, st.cols) && h === Math.min(it.h, st.rows));
          const [w, h] = sizes[(cur + 1) % sizes.length];
          it.w = w;
          it.h = h;
          normalise();
          persist();
          return rebuild();
        }
      }
      const dot = e.target.closest('.hg-dot');
      if (dot) goPage(+dot.dataset.page, true);
    });
    home.addEventListener('app-density', (e) => {
      st.density = e.detail;
      persist();
      rerenderApp();
    });

    /* Drag: long-press a widget (then keep dragging), or plain drag in edit mode.
       The widget lifts into a floating ghost above the page; its slot stays as a placeholder. */
    let drag = null;
    let press = null;
    const appEl = root.querySelector('.app');
    function startDrag(w, x, y, pointerId) {
      const r = w.getBoundingClientRect();
      const ar = appEl.getBoundingClientRect();
      const s = scale();
      const ghost = w.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.removeAttribute('style');
      ghost.style.cssText = `position:absolute;left:${(r.left - ar.left) / s}px;top:${(r.top - ar.top) / s}px;width:${r.width / s}px;height:${r.height / s}px;`;
      appEl.appendChild(ghost);
      w.classList.add('placeholder');
      drag = { el: w, ghost, id: w.dataset.wid, ox: x - r.left, oy: y - r.top, x, y, cell: null, edgeT: null };
      try {
        w.setPointerCapture(pointerId);
      } catch (e) {
        /* pointer already released */
      }
    }
    if (st.pendingDrag) {
      const pd = st.pendingDrag;
      st.pendingDrag = null;
      const w = home.querySelector(`.widget[data-wid="${pd.id}"]`);
      if (w) startDrag(w, pd.x, pd.y, pd.pointerId);
    }
    home.addEventListener('pointerdown', (e) => {
      const w = e.target.closest('.widget');
      if (!w || e.button > 0 || e.target.closest('[data-hact]')) return;
      if (!st.editing) {
        const id = w.dataset.wid;
        press = {
          x: e.clientX,
          y: e.clientY,
          t: setTimeout(() => {
            st.editing = true;
            st.pendingDrag = { id, x: press ? press.x : e.clientX, y: press ? press.y : e.clientY, pointerId: e.pointerId };
            press = null;
            persist();
            rerenderApp();
          }, 520),
        };
        return;
      }
      e.preventDefault();
      startDrag(w, e.clientX, e.clientY, e.pointerId);
    });
    home.addEventListener('pointermove', (e) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
        clearTimeout(press.t);
        press = null;
      }
      if (!drag) return;
      drag.x = e.clientX;
      drag.y = e.clientY;
      follow();
      target();
      edge();
    });
    const end = () => {
      if (press) {
        clearTimeout(press.t);
        press = null;
      }
      if (!drag) return;
      const { el, ghost } = drag;
      clearTimeout(drag.edgeT);
      drag = null;
      const pr = el.getBoundingClientRect();
      const ar = appEl.getBoundingClientRect();
      const s = scale();
      ghost.classList.add('landing');
      ghost.style.left = (pr.left - ar.left) / s + 'px';
      ghost.style.top = (pr.top - ar.top) / s + 'px';
      ghost.style.width = pr.width / s + 'px';
      ghost.style.height = pr.height / s + 'px';
      setTimeout(() => {
        ghost.remove();
        el.classList.remove('placeholder');
      }, 240);
      persist();
    };
    home.addEventListener('pointerup', end);
    home.addEventListener('pointercancel', end);

    function follow() {
      const ar = appEl.getBoundingClientRect();
      const s = scale();
      drag.ghost.style.left = (drag.x - drag.ox - ar.left) / s + 'px';
      drag.ghost.style.top = (drag.y - drag.oy - ar.top) / s + 'px';
    }
    function cellAt(x, y) {
      const gr = grid.getBoundingClientRect();
      const s = scale();
      const gap = gapPx();
      const colw = (pageW() / s - (st.cols - 1) * gap) / st.cols;
      const rowh = (gr.height / s - (st.rows - 1) * gap) / st.rows;
      const lx = (x - gr.left) / s;
      const ly = (y - gr.top) / s;
      const gc = Math.floor(lx / (colw + gap));
      const page = Math.floor(gc / st.cols);
      return { page, c: gc - page * st.cols, r: Math.max(0, Math.min(st.rows - 1, Math.floor(ly / (rowh + gap)))) };
    }
    function target() {
      const cell = cellAt(drag.x, drag.y);
      const key = `${cell.page}:${cell.c}:${cell.r}`;
      if (drag.cell === key) return;
      drag.cell = key;
      const packed = st.packed;
      const on = (packed[cell.page] || []).find((it) => cell.c >= it.c && cell.c < it.c + it.pw && cell.r >= it.r && cell.r < it.r + it.ph);
      if (on && on.id === drag.id) return;
      const from = locate(drag.id);
      const item = st.pages[from.p][from.i];
      while (st.pages.length <= cell.page) st.pages.push([]);
      if (on) {
        const to = locate(on.id);
        st.pages[from.p].splice(from.i, 1);
        const at = locate(on.id);
        const after = from.p === to.p && from.i < to.i;
        st.pages[at.p].splice(at.i + (after ? 1 : 0), 0, item);
      } else {
        const idx = cell.r * st.cols + cell.c;
        st.pages[from.p].splice(from.i, 1);
        const list = st.pages[cell.page];
        const pk = (packed[cell.page] || []).filter((it) => it.id !== drag.id);
        const before = pk.filter((it) => it.r * st.cols + it.c < idx).length;
        list.splice(Math.min(before, list.length), 0, item);
      }
      normalise();
      const beforeRects = {};
      grid.querySelectorAll('.widget').forEach((w) => (beforeRects[w.dataset.wid] = w.getBoundingClientRect()));
      const { html, n } = gridInner(ctx, st);
      // Move existing nodes rather than rebuilding, so the dragged widget keeps the pointer.
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      grid.querySelectorAll('.hg-page,.hg-slot').forEach((x) => x.remove());
      tmp.querySelectorAll('.hg-page,.hg-slot').forEach((x) => grid.prepend(x));
      tmp.querySelectorAll('.widget').forEach((nw) => {
        const old = grid.querySelector(`.widget[data-wid="${nw.dataset.wid}"]`);
        if (old) {
          old.style.gridColumn = nw.style.gridColumn;
          old.style.gridRow = nw.style.gridRow;
          if (old.dataset.w !== nw.dataset.w || old.dataset.h !== nw.dataset.h) {
            old.dataset.w = nw.dataset.w;
            old.dataset.h = nw.dataset.h;
            old.querySelector('.wg-in').innerHTML = nw.querySelector('.wg-in').innerHTML;
          }
        }
      });
      grid.style.gridTemplateColumns = `repeat(${st.cols * n}, var(--colw))`;
      const dotsEl = home.querySelector('.hg-dots');
      dotsEl.hidden = n <= 1;
      dotsEl.innerHTML = Array.from({ length: n }, (_, i) => `<button class="hg-dot" data-page="${i}" aria-label="Page ${i + 1}"></button>`).join('');
      markDot();
      flip(beforeRects);
    }
    function edge() {
      const r = scroller.getBoundingClientRect();
      const near = drag.x < r.left + 28 ? -1 : drag.x > r.right - 28 ? 1 : 0;
      if (!near) {
        clearTimeout(drag.edgeT);
        drag.edgeT = null;
        return;
      }
      if (drag.edgeT) return;
      drag.edgeT = setTimeout(() => {
        if (!drag) return;
        drag.edgeT = null;
        const p = Math.max(0, Math.min(st.pageCount - 1, pageNow() + near));
        goPage(p, true);
        setTimeout(() => drag && (follow(), (drag.cell = null), target()), 380);
      }, 520);
    }

    /* Widget gallery (Add widget). */
    function openGallery() {
      const onGrid = new Set(st.pages.flat().map((x) => x.id));
      const avail = W.catalog.filter((w) => !onGrid.has(w.id) && W.available(w));
      const sheet = root.querySelector('.sheet-wrap');
      const body = avail.length
        ? avail
            .map((w) => {
              const sizes = w.sizes.filter(([a, b]) => a <= st.cols && b <= st.rows);
              const [pw, ph] = sizes[0];
              return `<div class="gal-item" data-wid="${w.id}">
                <div class="gal-prev"><section class="widget g preview" data-w="${pw}" data-h="${ph}" style="--pw:${pw};--ph:${ph}"><div class="wg-in">${w.render(ctx, pw, ph, st.cols)}</div></section></div>
                <div class="gal-meta"><b>${esc(w.name)}</b><span class="muted small">${esc(w.desc)}</span>
                <div class="gal-sizes">${sizes.map(([a, b], i) => `<button class="chip-btn" aria-pressed="${i === 0}" data-gsize="${a}x${b}">${a}×${b}</button>`).join('')}</div>
                ${C.btn('Add', { kind: 'primary', size: 'sm', icon: 'plus', attrs: `data-gadd="${w.id}"` })}</div>
              </div>`;
            })
            .join('')
        : `<p class="muted">Every widget is already on Home. Remove one to add it at another size.</p>`;
      sheet.innerHTML = `<div class="sheet g-strong gallery-sheet" role="dialog" aria-label="Add a widget"><div class="sheet-body"><div class="sheet-head"><div><div class="eyebrow">Home</div><h3>Add a widget</h3></div>${C.ibtn('x', 'Close', { act: 'closesheet' })}</div><div class="gal">${body}</div></div></div>`;
      sheet.hidden = false;
      sheet.onclick = (e) => {
        const sz = e.target.closest('[data-gsize]');
        if (sz) {
          const item = sz.closest('.gal-item');
          item.querySelectorAll('[data-gsize]').forEach((x) => x.setAttribute('aria-pressed', x === sz));
          const [a, b] = sz.dataset.gsize.split('x').map(Number);
          const def = W.byId[item.dataset.wid];
          const pv = item.querySelector('.widget');
          pv.style.setProperty('--pw', a);
          pv.style.setProperty('--ph', b);
          pv.dataset.w = a;
          pv.dataset.h = b;
          pv.querySelector('.wg-in').innerHTML = def.render(ctx, a, b, st.cols);
          return;
        }
        const add = e.target.closest('[data-gadd]');
        if (add) {
          const item = add.closest('.gal-item');
          const [a, b] = item.querySelector('[aria-pressed="true"]').dataset.gsize.split('x').map(Number);
          const p = pageNow();
          while (st.pages.length <= p) st.pages.push([]);
          st.pages[p].push({ id: add.dataset.gadd, w: a, h: b });
          normalise();
          persist();
          sheet.hidden = true;
          sheet.innerHTML = '';
          rebuild();
          const at = locate(add.dataset.gadd);
          if (at) goPage(at.p, true);
        }
      };
    }
  };
})();
