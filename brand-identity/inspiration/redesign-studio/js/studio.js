/*
  The studio: controls, device frames and routing. Every switch (direction,
  component pack, colour combo, light/dark, nav position, devices, screen)
  re-renders all visible frames at once.
*/
(function () {
  const HU = window.HU;
  const { data, fmt, icon, C } = HU;
  const esc = C.esc;

  HU.packs = [
    { id: 'liquid', name: 'Liquid', dir: 1, desc: 'Clear, thick glass with bright specular rims, lensing edges and capsule controls. Apple’s newest material.', type: 'SF Pro (the system face on Apple devices)', shape: 'Radius 30 · 20 · capsules', glass: 'Clear: blur 22, saturation 190%, specular rim' },
    { id: 'instrument', name: 'Instrument', dir: 2, desc: 'Precise frosted tiles with hairline rims, tick-marked gauges, mono labels and solid accent controls.', type: 'Outfit · Manrope · JetBrains Mono (today’s faces)', shape: 'Radius 18 · 12 · 10', glass: 'Frosted: blur 28, 58% fill, hairline rim' },
    { id: 'frost', name: 'Frost', dir: 3, desc: 'Matte, milky glass with long soft shadows and no rims. Characterful headings, text-first controls.', type: 'Bricolage Grotesque · Figtree', shape: 'Radius 22 · 14 · pills', glass: 'Matte: blur 44, low saturation, no rim' },
    { id: 'tint', name: 'Tint', dir: 4, desc: 'Glass tinted by each service’s colour, glossy top highlights, chunky rounded shapes and gradient buttons.', type: 'Sora · Instrument Sans', shape: 'Radius 26 · 18 · 16', glass: 'Tinted: blur 26, colour-mixed fill, gloss' },
    { id: 'frostglass', name: 'Frost Glass', attr: 'frost frostglass', dir: 6, desc: 'Frost’s type and calm, on clearer glass: a soft specular rim, more of the colour scene showing through, glass controls and accent buttons.', type: 'Bricolage Grotesque · Figtree', shape: 'Radius 24 · 16 · pills', glass: 'Clear frost: blur 30, saturation 150%, soft specular rim' },
    { id: 'vibrancy', name: 'Vibrancy', dir: 5, desc: 'macOS materials: sidebar vibrancy, hairline separators, compact controls and inset grouped lists.', type: 'Geist · Geist Mono', shape: 'Radius 12 · 8 · 7', glass: 'Vibrant: blur 50, saturation 180%, hairlines' },
  ];
  const packById = Object.fromEntries(HU.packs.map((p) => [p.id, p]));
  /** The data-pack value: a pack that builds on another carries both names. */
  HU.packAttr = (id) => (packById[id] && packById[id].attr) || id;

  const SCREEN_GROUPS = [
    ['The app', [['home', 'Home', 'home'], ['services', 'Services', 'services'], ['service', 'A service', 'layers'], ['bills', 'Bills', 'bills'], ['bill', 'A bill', 'file'], ['inbox', 'Inbox', 'inbox'], ['money', 'Money', 'money'], ['settings', 'Settings', 'sliders']]],
    ['Forms', [['addSheet', 'Add a bill', 'plus'], ['paySheet', 'Record a payment', 'money'], ['billNew', 'New bill', 'pencil'], ['billEdit', 'Edit a bill', 'pencil'], ['upload', 'Upload', 'upload'], ['confirm', 'Confirm a detail', 'check'], ['serviceNew', 'New service', 'plus'], ['serviceEdit', 'Service & split', 'split'], ['members', 'Members', 'users'], ['member', 'A member', 'user'], ['invite', 'Invite', 'mail']]],
    ['Getting in', [['login', 'Sign in', 'user'], ['code', 'Email code', 'mail'], ['unlock', 'Unlock', 'lock'], ['setpin', 'Set a PIN', 'lock'], ['welcome', 'Welcome', 'home'], ['setup', 'Setup wizard', 'sliders'], ['join', 'Join by invite', 'users']]],
    ['Everything else', [['wall', 'Wall', 'desktop'], ['status', 'Status', 'chart'], ['privacy', 'Privacy', 'shield'], ['unsubscribe', 'Unsubscribe', 'bell'], ['notFound', 'Not found', 'search'], ['error', 'Error', 'alert'], ['offline', 'Offline', 'wifi'], ['loading', 'Loading', 'clock']]],
  ];
  const SCREENS = SCREEN_GROUPS.flatMap((g) => g[1]);
  /** Screens drawn outside the app (no nav): getting in and public pages. */
  const OUTSIDE = new Set(['login', 'code', 'unlock', 'setpin', 'welcome', 'setup', 'join', 'privacy', 'unsubscribe']);
  /** Screens that draw Home underneath (a sheet, a banner or a skeleton on top). */
  const ON_HOME = new Set(['addSheet', 'offline', 'loading']);
  /** Screens drawn as a sheet over another screen: [sheet kind, screen underneath]. */
  const SHEET_OVER = { paySheet: ['pay', 'money'] };
  const NAV = [
    ['home', 'Home', 'home'],
    ['services', 'Services', 'services'],
    ['bills', 'Bills', 'bills'],
    ['money', 'Money', 'money'],
    ['inbox', 'Inbox', 'inbox'],
  ];
  const navItems = () => NAV.filter(([v]) => v !== 'money' || data.household.split);
  const DEVICES = {
    desktop: { w: 1440, h: 900, label: 'Desktop · 1440 × 900' },
    tabletP: { w: 820, h: 1180, label: 'iPad · 820 × 1180' },
    tabletL: { w: 1180, h: 820, label: 'iPad · 1180 × 820' },
    phone: { w: 393, h: 852, label: 'iPhone · 393 × 852' },
  };
  const BEZEL = { desktop: [0, 0], tabletP: [16, 16], tabletL: [16, 16], phone: [11, 11] };

  /* ---------- state ---------- */
  const KEY = 'hu-studio-state-v2';
  const defaults = {
    view: 'mockups',
    dir: 1,
    pack: 'match',
    palette: 'mist',
    theme: 'auto',
    nav: 'bottom',
    devices: 'all',
    orient: 'portrait',
    screen: 'home',
    serviceId: 'power',
    billId: 'power-2026-q3',
    docId: null,
    svcScope: 'all',
    billFilter: 'all',
    inboxFilter: 'all',
    panel: true,
    scenario: 'demo',
    setupStep: 1,
    joinStep: 1,
  };
  let state = { ...defaults };
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch (e) {
    /* first visit or storage blocked */
  }
  let history = [];
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* storage blocked: choices last for this visit */
    }
  };

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const mode = () => (state.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : state.theme);
  const dir = () => HU.directionById[state.dir];
  const pack = () => (state.pack === 'match' ? dir().pack : state.pack);

  /* ---------- palette CSS ---------- */
  const pcss = document.createElement('style');
  pcss.id = 'palette-css';
  pcss.textContent = HU.paletteCSS();
  document.head.appendChild(pcss);

  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.theme);
    document.body.dataset.mode = mode();
    document.body.dataset.palette = state.palette;
  }

  /* ---------- panel ---------- */
  const panel = document.getElementById('panel');
  const stage = document.getElementById('stage');
  const stageInner = document.getElementById('stageInner');

  function sw(p) {
    return `<button class="swatch" data-set="palette" data-v="${p.id}" aria-pressed="${state.palette === p.id}" title="${esc(p.name)}" aria-label="${esc(p.name)} colours" style="${HU.swatchStyle(p, mode())}"><i></i></button>`;
  }
  function renderPanel() {
    const d = dir();
    const pal = HU.palettes.find((p) => p.id === state.palette);
    const pk = packById[pack()];
    panel.innerHTML = `
      <div class="pn-top">
        <div class="pn-brand"><span class="pn-mark">${icon('home', 18)}</span><div><b>Redesign Studio</b><span>Home Utilities · Riverside House demo</span></div></div>
        <button class="pn-collapse" data-studio="panel" aria-label="Hide controls" title="Hide controls (\\)">${icon('chevron-left', 18)}</button>
      </div>
      <div class="pn-sec">
        <div class="pn-seg" role="group" aria-label="View">${[['mockups', 'Mockups', 'devices'], ['components', 'Components', 'layers'], ['rules', 'Rules', 'rule']]
          .map(([v, l, ic]) => `<button data-set="view" data-v="${v}" aria-pressed="${state.view === v}">${icon(ic, 16)}<span>${l}</span></button>`)
          .join('')}</div>
      </div>
      <div class="pn-sec">
        <div class="pn-h"><span>Direction</span><kbd>1–6</kbd></div>
        <div class="pn-dirs">${HU.directions
          .map((x) => `<button class="pn-dir" data-set="dir" data-v="${x.id}" aria-pressed="${state.dir === x.id}"><span class="pn-dir-n">${x.id}</span><span class="pn-dir-t"><b>${esc(x.name)}</b><span>${esc(x.tagline)}</span></span></button>`)
          .join('')}</div>
        <details class="pn-more" ${state.moreOpen ? 'open' : ''}><summary>About ${esc(d.name)}</summary><p>${esc(d.idea)}</p><div class="pn-gw"><div><b>Good for</b>${d.good.map((g) => `<span>${esc(g)}</span>`).join('')}</div><div><b>Watch</b>${d.watch.map((g) => `<span>${esc(g)}</span>`).join('')}</div></div></details>
      </div>
      <div class="pn-sec">
        <div class="pn-h"><span>Component pack</span><kbd>P</kbd></div>
        <div class="pn-packs">
          <button class="pn-pack match" data-set="pack" data-v="match" aria-pressed="${state.pack === 'match'}"><b>Match</b><span>${esc(packById[d.pack].name)}</span></button>
          ${HU.packs.map((p) => `<button class="pn-pack" data-set="pack" data-v="${p.id}" aria-pressed="${state.pack === p.id}" data-pk="${p.id}"><b class="pk-aa">Aa</b><span>${esc(p.name)}</span></button>`).join('')}
        </div>
        <p class="pn-note">${esc(pk.name)}: ${esc(pk.desc)}</p>
      </div>
      <div class="pn-sec">
        <div class="pn-h"><span>Colours · ${esc(pal.name)}</span><kbd>C</kbd></div>
        <div class="pn-presets">${HU.palettes
          .filter((p) => p.app)
          .map((p) => `<button class="pn-preset" data-set="palette" data-v="${p.id}" aria-pressed="${state.palette === p.id}" title="${esc(p.name)}"><span class="swatch" style="${HU.swatchStyle(p, mode())}"><i></i></span><span>${esc(p.name)}</span></button>`)
          .join('')}</div>
        <p class="pn-note">The five presets everyone can choose from in Settings. ${esc(pal.note)}</p>
        <details class="pn-more pn-more-c" ${state.moreColours ? 'open' : ''}><summary>More combos from the first round</summary><div class="pn-swatches">${HU.palettes.filter((p) => !p.app).map(sw).join('')}</div></details>
      </div>
      <div class="pn-sec pn-row2">
        <div><div class="pn-h"><span>Appearance</span><kbd>M</kbd></div>
          <div class="pn-seg sm">${[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['auto', 'devices', 'Auto']].map(([v, ic, l]) => `<button data-set="theme" data-v="${v}" aria-pressed="${state.theme === v}" title="${l}" aria-label="${l}">${icon(ic, 16)}</button>`).join('')}</div></div>
        <div><div class="pn-h"><span>Nav bar</span><kbd>N</kbd></div>
          <div class="pn-seg sm">${['bottom', 'top', 'left', 'right'].map((v) => `<button data-set="nav" data-v="${v}" aria-pressed="${state.nav === v}" title="Nav on the ${v}" aria-label="Nav on the ${v}">${icon('nav-' + v, 17)}</button>`).join('')}</div></div>
      </div>
      <div class="pn-sec">
        <div class="pn-h"><span>Devices</span><kbd>V</kbd></div>
        <div class="pn-seg">${[['all', 'All three', 'devices'], ['desktop', 'Desktop', 'desktop'], ['tablet', 'iPad', 'tablet'], ['phone', 'iPhone', 'phone']]
          .map(([v, l, ic]) => `<button data-set="devices" data-v="${v}" aria-pressed="${state.devices === v}" title="${l}">${icon(ic, 16)}<span>${l}</span></button>`)
          .join('')}</div>
        <button class="pn-link" data-set="orient" data-v="${state.orient === 'portrait' ? 'landscape' : 'portrait'}">${icon('rotate', 15)} iPad in ${state.orient === 'portrait' ? 'landscape' : 'portrait'}</button>
      </div>
      <div class="pn-sec">
        <div class="pn-h"><span>Screen</span><kbd>H</kbd></div>
        ${SCREEN_GROUPS.map(([g, list], i) => {
          const open = i === 0 || list.some(([v]) => v === state.screen);
          return `<details class="pn-group" ${open ? 'open' : ''}><summary>${esc(g)} <span class="muted">${list.length}</span></summary><div class="pn-screens">${list.map(([v, l, ic]) => `<button data-set="screen" data-v="${v}" aria-pressed="${state.screen === v}">${icon(ic, 15)}<span>${l}</span></button>`).join('')}</div></details>`;
        }).join('')}
        <p class="pn-note">Everything in the mockups is clickable. Long-press a widget or use Edit Home to rearrange.</p>
      </div>
      <div class="pn-sec">
        <div class="pn-h"><span>Household state</span></div>
        <div class="pn-screens">${HU.scenarios.map((x) => `<button data-set="scenario" data-v="${x.id}" aria-pressed="${state.scenario === x.id}"><span>${esc(x.name)}</span></button>`).join('')}</div>
        <p class="pn-note">${esc((HU.scenarios.find((x) => x.id === state.scenario) || HU.scenarios[0]).note)}</p>
      </div>
      <div class="pn-foot">
        <button class="pn-link" data-studio="resetHome">${icon('grid', 15)} Reset every Home layout</button>
        <span class="muted">Fictional demo data. Nothing is saved to the app.</span>
      </div>`;
  }

  /* ---------- app chrome ---------- */
  function statusbar(ctx) {
    if (ctx.device === 'desktop') return '';
    return `<div class="statusbar"><span class="sb-time">9:41</span><span class="sb-r"><svg viewBox="0 0 18 12" width="17" height="11"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>${icon('wifi', 16)}<svg viewBox="0 0 27 13" width="25" height="12"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2.5" y="2.5" width="16" height="8" rx="2"/><rect x="25" y="4.5" width="1.6" height="4" rx=".8" opacity=".45"/></svg></span></div>`;
  }
  const group = (scr) =>
    ({ service: 'services', serviceNew: 'services', serviceEdit: 'services', bill: 'bills', billNew: 'bills', billEdit: 'bills', upload: 'bills', confirm: 'inbox', addSheet: 'home', offline: 'home', loading: 'home', paySheet: 'money' })[scr] || scr;
  function columnNav(ctx, active) {
    const items = navItems().map(
      ([v, l, ic]) =>
        `<button class="nav-i" data-go="screen:${v}" ${active === v ? 'aria-current="page"' : ''} aria-label="${l}">${icon(ic, 21)}<span>${l}</span>${v === 'inbox' ? '<i class="badge">1</i>' : ''}</button>`,
    ).join('');
    const row = (s) =>
      `<button class="nc-s" data-go="service:${s.id}" style="--svc:${C.col(ctx, s)}"><i></i><span>${esc(s.name)}</span><b>${fmt.money(s.owner ? C.billAmount(data.billsFor(s.id)[0]) : data.thisMonth.bySvc[s.id], true)}</b></button>`;
    return `<nav class="nav g-strong vertical column" data-pos="${ctx.nav}" aria-label="Main">
      <button class="nc-brand" data-go="screen:home" aria-label="Riverside House, Home"><span class="mark">${icon('home', 17)}</span><span class="nc-bt"><b>Riverside House</b><span>${esc(data.household.solo ? 'Just you' : data.household.fresh ? 'Alex · 2 invited' : 'Alex, Jordan and Sam')}</span></span></button>
      <div class="nav-items">${items}</div>
      <div class="nc-svcs">${
        data.services.length
          ? `<div class="nav-sec">Services<span>this month</span></div>${data.services.filter((s) => !s.owner).map(row).join('')}${data.services.some((s) => s.owner) ? `<div class="nav-sec">Just yours</div>${data.services.filter((s) => s.owner).map(row).join('')}` : ''}`
          : `<div class="nav-sec">Services</div><p class="nc-empty">Each provider’s first bill adds its service here.</p>`
      }</div>
      <button class="nc-me" data-go="screen:settings" aria-label="Alex · Settings">${C.avatar(data.memberById.alex, ctx, 'md')}<span class="nc-bt"><b>Alex</b><span>Admin · Settings</span></span>${icon('sliders', 18)}</button>
    </nav>`;
  }
  function navHtml(ctx) {
    const active = group(history.length ? history[0].screen : ctx.screen);
    if (ctx.column) return columnNav(ctx, active);
    const vertical = ctx.nav === 'left' || ctx.nav === 'right';
    const side = vertical && ctx.device !== 'phone' && ctx.dir.sidebar;
    const items = navItems().map(
      ([v, l, ic]) =>
        `<button class="nav-i" data-go="screen:${v}" ${active === v ? 'aria-current="page"' : ''} aria-label="${l}">${icon(ic, 22)}<span>${l}</span>${v === 'inbox' ? '<i class="badge">1</i>' : ''}</button>`,
    ).join('');
    const extra = side
      ? `<div class="nav-extra"><div class="nav-sec">Services</div>${data.services
          .filter((s) => !s.owner)
          .map((s) => `<button class="nav-s" data-go="service:${s.id}" style="--svc:${C.col(ctx, s)}"><i></i><span>${esc(s.name)}</span></button>`)
          .join('')}<div class="nav-sec">Just yours</div><button class="nav-s" data-go="service:rego" style="--svc:${C.col(ctx, data.serviceById.rego)}"><i></i><span>Car rego</span></button></div>`
      : '';
    const brand = side ? `<button class="nav-brand" data-go="screen:home"><span class="mark">${icon('home', 16)}</span><b>Riverside House</b></button>` : '';
    return `<nav class="nav g-strong ${vertical ? 'vertical' : 'horizontal'}" data-pos="${ctx.nav}" aria-label="Main">${brand}<div class="nav-items">${items}</div>${extra}</nav>`;
  }
  function topbar(ctx, centre) {
    const phone = ctx.device === 'phone';
    if (ctx.column)
      return `<header class="topbar tb-col">
        <div class="tb-l">${ctx.device === 'desktop' ? C.search('Search bills, services, amounts', { cls: 'tb-search' }) : C.ibtn('search', 'Search', { act: 'toast', attrs: 'data-msg="Search bills, services and amounts"' })}</div>
        <div class="tb-c"></div>
        <div class="tb-r">${C.ibtn('inbox', 'Inbox', { go: 'screen:inbox', badge: 1 })}${C.btn('Add bill', { kind: 'primary', size: 'sm', icon: 'plus', go: 'sheet:add' })}</div>
      </header>`;
    const title = { home: 'Home', services: 'Services', service: (data.serviceById[ctx.state.serviceId] || { name: 'Service' }).name, bills: 'Bills', bill: 'Bill', inbox: 'Inbox', money: 'Money', settings: 'Settings' }[ctx.screen] || (SCREENS.find(([v]) => v === ctx.screen) || [0, 'Home'])[1];
    const search = !phone && !centre ? C.search('Search bills, services, amounts', { cls: 'tb-search' }) : '';
    const sidebar = (ctx.nav === 'left' || ctx.nav === 'right') && ctx.device === 'desktop' && ctx.dir.sidebar;
    return `<header class="topbar">
      <div class="tb-l">${sidebar ? `<div class="tb-title"><b>${esc(title)}</b><span>Riverside House</span></div>` : `<button class="brand" data-go="screen:home" aria-label="Riverside House, Home"><span class="mark">${icon('home', 17)}</span><span class="brand-t"><b>Riverside House</b><span>${esc(phone ? title : 'Home Utilities')}</span></span></button>`}</div>
      <div class="tb-c">${centre || search}</div>
      <div class="tb-r">
        ${phone || centre ? C.ibtn('search', 'Search', { act: 'toast', attrs: 'data-msg="Search bills, services and amounts"' }) : ''}
        ${C.ibtn('inbox', 'Inbox', { go: 'screen:inbox', badge: 1 })}
        ${phone ? C.ibtn('plus', 'Add a bill', { go: 'sheet:add', cls: 'accent' }) : C.btn('Add bill', { kind: 'primary', size: 'sm', icon: 'plus', go: 'sheet:add' })}
        <button class="me" aria-label="Alex · Settings" data-go="screen:settings">${C.avatar(data.memberById.alex, ctx, 'md')}</button>
      </div>
    </header>`;
  }
  function backLabel() {
    if (!history.length) return state.screen === 'service' ? 'Services' : state.screen === 'bill' ? 'Bills' : '';
    const prev = history[history.length - 1];
    if (prev.screen === 'service') return data.serviceById[prev.serviceId].name;
    return { home: 'Home', services: 'Services', bills: 'Bills', inbox: 'Inbox', money: 'Money', bill: 'Bill', settings: 'Settings' }[prev.screen];
  }
  const M_IN = {
    billNew: (c) => HU.M.billForm(c, false),
    billEdit: (c) => HU.M.billForm(c, true),
    upload: (c) => HU.M.upload(c),
    confirm: (c) => HU.M.confirm(c),
    serviceNew: (c) => HU.M.serviceForm(c, false),
    serviceEdit: (c) => HU.M.serviceForm(c, true),
    members: (c) => HU.M.members(c),
    member: (c) => HU.M.member(c),
    invite: (c) => HU.M.invite(c),
    status: (c) => HU.M.status(c),
    notFound: (c) => HU.M.notFound(c),
    error: (c) => HU.M.error(c),
  };
  function screenBody(ctx) {
    const d = ctx.dir;
    const scr = ctx.screen;
    if (ON_HOME.has(scr) || scr === 'home') {
      const home = d.homeHead(ctx) + HU.widgets.render(ctx);
      if (scr === 'offline') return HU.M.offlineBanner() + home;
      if (scr === 'loading') return `<div class="skeleton">${home}</div>`;
      return home;
    }
    if (M_IN[scr]) return M_IN[scr](ctx);
    if (SHEET_OVER[scr]) return HU.M.stateScreen({ ...ctx, screen: SHEET_OVER[scr][1] }) || d[SHEET_OVER[scr][1]](ctx);
    return HU.M.stateScreen(ctx) || d[scr](ctx);
  }
  function renderApp(ctx) {
    const d = ctx.dir;
    const place = ctx.nav === 'top' ? (ctx.device === 'phone' ? 'below' : 'header') : 'overlay';
    const attrs = `data-dir="${d.key}" data-pack="${HU.packAttr(ctx.pack)}" data-chrome="${d.chrome}" data-device="${ctx.device}" data-orient="${ctx.orient}"`;
    const shell = (inner) => `${inner}<div class="sheet-wrap" hidden></div><div class="toasts" aria-live="polite"></div>`;
    try {
      if (OUTSIDE.has(ctx.screen))
        return `<div class="app outside" ${attrs} data-screen="${ctx.screen}">${statusbar(ctx)}${shell(`<main class="main"><div class="main-in">${HU.M[ctx.screen](ctx)}</div></main>`)}</div>`;
      if (ctx.screen === 'wall')
        return `<div class="app wall-app" ${attrs} data-screen="wall">${statusbar(ctx)}${shell(`<main class="main" data-screen="home"><div class="main-in">${HU.M.wallTop()}${HU.widgets.render(ctx)}${HU.M.wallFoot()}</div></main>`)}</div>`;
    } catch (err) {
      console.error(err);
    }
    const nav = navHtml(ctx);
    let body;
    try {
      body = screenBody(ctx);
    } catch (err) {
      console.error(err);
      body = `<p class="muted">This screen hit an error: ${esc(err.message)}</p>`;
    }
    const mainScreen = ON_HOME.has(ctx.screen) ? 'home' : ctx.screen;
    return `<div class="app" data-dir="${d.key}" data-pack="${HU.packAttr(ctx.pack)}" data-chrome="${d.chrome}" data-nav="${ctx.nav}" data-navplace="${place}" data-navstyle="${ctx.column ? 'column' : 'bar'}" data-device="${ctx.device}" data-orient="${ctx.orient}" data-screen="${mainScreen}">
      ${statusbar(ctx)}
      <div class="win">
        ${topbar(ctx, place === 'header' ? nav : '')}
        ${place === 'below' ? nav : ''}
        <main class="main" data-screen="${mainScreen}"><div class="main-in">${body}</div></main>
      </div>
      ${place === 'overlay' ? nav : ''}
      <div class="sheet-wrap" hidden></div>
      <div class="toasts" aria-live="polite"></div>
    </div>`;
  }

  /* ---------- frames ---------- */
  function visibleDevices() {
    const t = state.orient === 'portrait' ? 'tabletP' : 'tabletL';
    if (state.devices === 'desktop') return ['desktop'];
    if (state.devices === 'tablet') return [t];
    if (state.devices === 'phone') return ['phone'];
    return ['desktop', t, 'phone'];
  }
  function ctxFor(key) {
    const d = dir();
    const device = key === 'desktop' ? 'desktop' : key === 'phone' ? 'phone' : 'tablet';
    const side = state.nav === 'left' || state.nav === 'right';
    const colStyle = d.navStyle === 'column';
    return {
      dir: d,
      pack: pack(),
      mode: mode(),
      nav: colStyle && side && device === 'phone' ? 'bottom' : state.nav,
      column: colStyle && side && device !== 'phone',
      device,
      deviceKey: key,
      orient: key === 'tabletL' ? 'landscape' : 'portrait',
      screen: state.screen,
      wall: state.screen === 'wall',
      state,
      backLabel: state.screen === 'service' || state.screen === 'bill' ? backLabel() : '',
    };
  }
  function frameShell(key) {
    const dev = DEVICES[key];
    const [bx, by] = BEZEL[key];
    const kind = key === 'desktop' ? 'desktop' : key === 'phone' ? 'phone' : 'tablet';
    const chrome =
      kind === 'desktop'
        ? `<div class="win-chrome"><span class="lights"><i></i><i></i><i></i></span><span class="url">${icon('lock', 12)} home-utilities.app</span><span></span></div>`
        : '';
    return `<div class="slot" data-key="${key}">
      <div class="device device-${kind}" style="--dw:${dev.w + bx * 2}px;--dh:${dev.h + by * 2 + (kind === 'desktop' ? 38 : 0)}px">
        ${chrome}
        <div class="screen" style="width:${dev.w}px;height:${dev.h}px">
          <div class="scene"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><i class="grain"></i><i class="vig"></i></div>
          <div class="app-host"></div>
          ${kind === 'phone' ? '<i class="island"></i><i class="home-ind"></i>' : kind === 'tablet' ? '<i class="home-ind"></i>' : ''}
        </div>
      </div>
      <div class="slot-label">${esc(dev.label)}</div>
    </div>`;
  }
  let shellKey = '';
  function renderStage() {
    stage.dataset.view = state.view;
    if (state.view === 'components') {
      shellKey = '';
      stageInner.className = 'stage-inner gallery-host';
      stageInner.innerHTML = HU.gallery({ pack: pack(), mode: mode(), dir: dir(), nav: state.nav, state }, HU.packs);
      return;
    }
    if (state.view === 'rules') {
      shellKey = '';
      stageInner.className = 'stage-inner rules-host';
      stageInner.innerHTML = HU.rulesPage(mode());
      return;
    }
    const keys = visibleDevices();
    const k = keys.join(',') + '|' + state.devices;
    if (k !== shellKey) {
      shellKey = k;
      stageInner.className = `stage-inner frames devices-${state.devices}`;
      stageInner.innerHTML = keys.map(frameShell).join('');
    }
    keys.forEach((key) => renderFrame(key));
    fit();
  }
  function renderFrame(key, keepScroll = true) {
    const slot = stageInner.querySelector(`.slot[data-key="${key}"]`);
    if (!slot) return;
    const host = slot.querySelector('.app-host');
    const ctx = ctxFor(key);
    const prev = host.querySelector('.main');
    const top = keepScroll && prev && host.firstElementChild && host.firstElementChild.dataset.screen === (ON_HOME.has(state.screen) ? 'home' : state.screen) ? prev.scrollTop : 0;
    host.innerHTML = renderApp(ctx);
    const main = host.querySelector('.main');
    if (main) main.scrollTop = top;
    HU.widgets.mount(host, ctx, () => renderFrame(key));
    if (state.screen === 'addSheet') openSheet(host.querySelector('.main'), 'add');
    if (SHEET_OVER[state.screen]) openSheet(host.querySelector('.main'), SHEET_OVER[state.screen][0]);
  }
  function fit() {
    const slots = [...stageInner.querySelectorAll('.slot')];
    if (!slots.length) return;
    const pad = 36;
    const W = stage.clientWidth - pad * 2;
    const H = stage.clientHeight - pad * 2 - 34;
    const size = (key) => {
      const [bx, by] = BEZEL[key];
      return { w: DEVICES[key].w + bx * 2, h: DEVICES[key].h + by * 2 + (key === 'desktop' ? 38 : 0) };
    };
    let scale;
    if (slots.length === 1) {
      const s = size(slots[0].dataset.key);
      scale = Math.min(1, W / s.w, H / s.h);
    } else {
      const d = size('desktop');
      const t = size(slots[1].dataset.key);
      const p = size('phone');
      const gap = 44;
      const wide = W > 1500;
      if (wide) scale = Math.min(1, (W - gap * 2) / (d.w + t.w + p.w), H / Math.max(d.h, t.h, p.h));
      else scale = Math.min(1, W / d.w, (W - gap) / (t.w + p.w));
      stageInner.dataset.row = wide ? 'one' : 'two';
    }
    slots.forEach((slot) => {
      const s = size(slot.dataset.key);
      slot.style.width = s.w * scale + 'px';
      slot.style.height = s.h * scale + 26 + 'px';
      slot.querySelector('.device').style.transform = `scale(${scale})`;
    });
    stageInner.style.setProperty('--scale', scale);
  }

  /* ---------- rendering everything ---------- */
  function renderAll() {
    applyTheme();
    renderPanel();
    renderStage();
    document.body.dataset.panel = state.panel ? 'open' : 'closed';
    save();
  }

  /* ---------- routing inside the mockups ---------- */
  function go(target, frameHost) {
    if (target === 'back') {
      const prev = history.pop();
      if (prev) Object.assign(state, prev);
      else state.screen = state.screen === 'bill' ? 'bills' : 'services';
      return renderAll();
    }
    const [kind, a, b] = target.split(':');
    if (kind === 'sheet') return openSheet(frameHost, a, b);
    const snap = { screen: state.screen, serviceId: state.serviceId, billId: state.billId };
    if (frameHost && frameHost.closest && frameHost.closest('.nav') && kind !== 'screen') {
      history = [{ screen: kind === 'service' ? 'services' : 'bills', serviceId: state.serviceId, billId: state.billId }];
      state.screen = kind;
      if (kind === 'service') state.serviceId = a;
      else state.billId = a;
      renderAll();
      stageInner.querySelectorAll('.main').forEach((m) => (m.scrollTop = 0));
      return;
    }
    if (kind === 'screen') {
      history = [];
      state.screen = a;
    } else if (kind === 'service') {
      if (state.screen !== 'service' || state.serviceId !== a) history.push(snap);
      state.screen = 'service';
      state.serviceId = a;
    } else if (kind === 'bill') {
      if (state.screen !== 'bill' || state.billId !== a) history.push(snap);
      state.screen = 'bill';
      state.billId = a;
    }
    if (history.length > 12) history = history.slice(-12);
    renderAll();
    stageInner.querySelectorAll('.main').forEach((m) => (m.scrollTop = 0));
  }
  function openSheet(host, kind, id) {
    const app = host && host.closest('.app-host');
    const wrap = app ? app.querySelector('.sheet-wrap') : null;
    if (!wrap) return;
    const ctx = ctxFor(app.closest('.slot').dataset.key);
    if (kind === 'add' || kind === 'pay') {
      wrap.innerHTML = `<div class="sheet g-strong" role="dialog" aria-label="${kind === 'add' ? 'Add a bill' : 'Record a payment'}">${kind === 'add' ? HU.M.addSheet(ctx) : HU.M.paySheet(ctx)}</div>`;
      wrap.hidden = false;
      return;
    }
    const d = data.docs.find((x) => x.id === id);
    wrap.innerHTML = `<div class="sheet g-strong" role="dialog" aria-label="${esc(d.title)}">${C.docSheet(d, ctx)}</div>`;
    wrap.hidden = false;
  }
  function toast(host, msg) {
    const hosts = host ? [host.closest('.app-host')].filter(Boolean) : [];
    hosts.forEach((h) => {
      const t = h.querySelector('.toasts');
      if (!t) return;
      const el = document.createElement('div');
      el.className = 'toast g-strong';
      el.innerHTML = `${icon('check', 16)}<span>${esc(msg)}</span>`;
      t.appendChild(el);
      setTimeout(() => el.classList.add('out'), 2200);
      setTimeout(() => el.remove(), 2600);
    });
  }
  function markPaid(el) {
    const b = data.billById[el.dataset.bill];
    const who = el.dataset.member || data.you;
    const ins = el.dataset.ins ? b.plan.instalments.find((i) => i.n === +el.dataset.ins) : null;
    const share = (ins ? ins.shares : b.shares).find((s) => s.member === who);
    if (share) share.paid = data.TODAY;
    data.recomputeMoney();
    const svc = data.serviceById[b.service];
    const slot = el.closest('.slot');
    const key = slot ? slot.dataset.key : null;
    renderAll();
    const host = key ? stageInner.querySelector(`.slot[data-key="${key}"] .app-host .main`) : null;
    toast(host, who === data.you ? `Marked paid · ${fmt.money(share.amount)} to ${data.memberById[svc.payer].name}` : `${data.memberById[who].name}’s ${fmt.money(share.amount)} marked paid`);
  }

  function applyDirDefaults(id) {
    const d = HU.directionById[id];
    if (!d || id === state.dir) return;
    if (d.navDefault) state.nav = d.navDefault;
    if (d.paletteDefault) state.palette = d.paletteDefault;
  }

  /* ---------- events ---------- */
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set],[data-studio]');
    if (!b) return;
    if (b.dataset.studio === 'panel') {
      state.panel = !state.panel;
      return renderAll();
    }
    if (b.dataset.studio === 'resetHome') {
      HU.widgets.resetAll();
      return renderAll();
    }
    const k = b.dataset.set;
    let v = b.dataset.v;
    if (k === 'dir') {
      v = +v;
      applyDirDefaults(v);
    }
    if (k === 'screen') history = [];
    if (k === 'dir' || k === 'screen') stageInner.querySelectorAll('.main').forEach((m) => (m.scrollTop = 0));
    if (k === 'view' || k === 'screen') state.view = k === 'screen' ? 'mockups' : state.view;
    if (k === 'scenario') HU.setScenario(v);
    if (k === 'screen' && v === 'setup') state.setupStep = 1;
    if (k === 'screen' && v === 'join') state.joinStep = 1;
    state[k] = v;
    renderAll();
  });
  panel.addEventListener('toggle', (e) => {
    if (e.target.matches('.pn-more-c')) {
      state.moreColours = e.target.open;
      save();
    } else if (e.target.matches('.pn-more')) {
      state.moreOpen = e.target.open;
      save();
    }
  }, true);
  document.getElementById('panelOpen').addEventListener('click', () => {
    state.panel = true;
    renderAll();
  });

  stageInner.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('sheet-wrap')) {
      e.target.hidden = true;
      e.target.innerHTML = '';
      return;
    }
    // The innermost control wins: an action button inside a link-like row acts, not navigates.
    const t = e.target.closest('[data-go],[data-act]');
    if (!t || !stageInner.contains(t)) return;
    if (t.closest('.home[data-editing="true"] .widget .wg-in')) return;
    e.preventDefault();
    if (t.dataset.go && !t.dataset.act) return go(t.dataset.go, t);
    const act = t.dataset.act;
    const v = t.dataset.v;
    if (act === 'toast') return toast(t, t.dataset.msg);
    if (act === 'markpaid') return markPaid(t);
    if (act === 'closesheet') {
      const w = t.closest('.sheet-wrap');
      if (w) {
        w.hidden = true;
        w.innerHTML = '';
      }
      return;
    }
    if (act === 'density') {
      const home = t.closest('.home');
      if (home) home.dispatchEvent(new CustomEvent('app-density', { detail: v }));
      return;
    }
    if (act === 'flip') {
      t.setAttribute('aria-checked', t.getAttribute('aria-checked') !== 'true');
      return;
    }
    if (act === 'setPalette') {
      const slot = t.closest('.slot');
      const key = slot ? slot.dataset.key : null;
      state.palette = v;
      renderAll();
      const host = key ? stageInner.querySelector(`.slot[data-key="${key}"] .main`) : null;
      return host && toast(host, `Colours changed to ${HU.palettes.find((p) => p.id === v).name}`);
    }
    if (act === 'flipPick') {
      const box = t.closest('.type-pick, .payer-pick, .radio-cards, .place-pick, .sw-pick') || t.parentElement;
      box.querySelectorAll('.on, [aria-pressed="true"]').forEach((x) => {
        x.classList.remove('on');
        if (x.hasAttribute('aria-pressed')) x.setAttribute('aria-pressed', 'false');
      });
      t.classList.add('on');
      if (t.hasAttribute('aria-pressed')) t.setAttribute('aria-pressed', 'true');
      return;
    }
    if (act === 'flipSeg') {
      t.parentElement.querySelectorAll('.seg-b').forEach((x) => x.setAttribute('aria-pressed', x === t));
      return;
    }
    if (act === 'setupStep') state.setupStep = +v;
    else if (act === 'joinStep') state.joinStep = +v;
    else if (act === 'setTheme') state.theme = v;
    else if (act === 'svcScope' || act === 'billFilter' || act === 'inboxFilter') state[act] = v;
    else if (act === 'pickService') state.serviceId = v;
    else if (act === 'pickDoc') state.docId = v;
    else if (act === 'gallery-pack') state.pack = v;
    else if (act === 'gallery-open') {
      state.view = 'mockups';
      applyDirDefaults(+v);
      state.dir = +v;
    } else return;
    renderAll();
  });
  stageInner.addEventListener('submit', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const cycle = (arr, cur) => arr[(arr.indexOf(cur) + (e.shiftKey ? arr.length - 1 : 1)) % arr.length];
    if (k >= '1' && k <= '6') {
      applyDirDefaults(+k);
      state.dir = +k;
    }
    else if (k === 'c') state.palette = cycle(HU.palettes.map((p) => p.id), state.palette);
    else if (k === 'p') state.pack = cycle(['match', ...HU.packs.map((p) => p.id)], state.pack);
    else if (k === 'n') state.nav = cycle(['bottom', 'top', 'left', 'right'], state.nav);
    else if (k === 'm') state.theme = mode() === 'dark' ? 'light' : 'dark';
    else if (k === 'v') state.devices = cycle(['all', 'desktop', 'tablet', 'phone'], state.devices);
    else if (k === 'h') {
      history = [];
      state.screen = cycle(SCREENS.map((s) => s[0]), state.screen);
    } else if (k === '\\') state.panel = !state.panel;
    else if (k === 'escape') {
      stageInner.querySelectorAll('.sheet-wrap').forEach((w) => ((w.hidden = true), (w.innerHTML = '')));
      return;
    } else return;
    e.preventDefault();
    renderAll();
  });

  mq.addEventListener('change', () => state.theme === 'auto' && renderAll());
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(fit, 60);
  });
  // On a phone-sized screen, open on the iPhone frame with the controls drawer closed.
  if (window.matchMedia('(max-width: 760px)').matches) {
    if (state.devices === 'all' || state.devices === 'desktop') state.devices = 'phone';
    state.panel = false;
  }

  HU.setScenario(state.scenario || 'demo');
  if (!SCREENS.some(([v]) => v === state.screen)) state.screen = 'home';
  HU.studio = { renderAll, state: () => state };
  renderAll();
})();
