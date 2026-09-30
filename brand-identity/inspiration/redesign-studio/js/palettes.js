/*
  Colour combos. Every direction and every component pack reads the same
  tokens, so any combo works with any mockup. Each combo has a light and a
  dark set; the blob scene behind the glass takes its four colours from here.
  Status colours (paid / due / overdue) are shared by all combos so their
  meaning never changes with the decor.
*/
(function () {
  const HU = (window.HU = window.HU || {});

  HU.palettes = [
    {
      id: 'mist',
      name: 'Ink & Mist',
      app: true,
      blurb: 'Today’s colours. Slate, mist and sand.',
      note: 'Today’s brand. Slate and mist with clay and sand.',
      light: {
        bg: '#e9e4dc',
        ground: ['#f1ece4', '#e9e4dc', '#ece6dd'],
        blobs: ['rgba(255,190,140,.75)', 'rgba(150,175,200,.8)', 'rgba(190,170,210,.6)', 'rgba(160,200,190,.55)'],
        accent: '#5b6f82',
        accent2: '#a77b5b',
        onAccent: '#ffffff',
        fg: '#1f1d18',
        fg2: '#5c584f',
        fg3: '#878277',
      },
      dark: {
        bg: '#12151b',
        ground: ['#1b2130', '#12151b', '#171b24'],
        blobs: ['rgba(224,160,110,.55)', 'rgba(80,120,170,.6)', 'rgba(120,90,160,.5)', 'rgba(40,120,120,.45)'],
        accent: '#b9c7d6',
        accent2: '#e0b48c',
        onAccent: '#171b22',
        fg: '#f1ede6',
        fg2: 'rgba(241,237,230,.7)',
        fg3: 'rgba(241,237,230,.5)',
      },
    },
    {
      id: 'harbour',
      name: 'Harbour',
      app: true,
      blurb: 'Deep blue, sea glass and sand.',
      note: 'Deep water blues, sea glass and a warm sand partner.',
      light: {
        bg: '#e3e8ec',
        ground: ['#edf1f4', '#e3e8ec', '#e6ebee'],
        blobs: ['rgba(120,170,215,.75)', 'rgba(110,200,210,.6)', 'rgba(236,205,160,.65)', 'rgba(150,160,220,.55)'],
        accent: '#2f5f86',
        accent2: '#b0814a',
        onAccent: '#ffffff',
        fg: '#15202a',
        fg2: '#4b5965',
        fg3: '#7a8792',
      },
      dark: {
        bg: '#0d141c',
        ground: ['#13202e', '#0d141c', '#101a24'],
        blobs: ['rgba(50,110,180,.6)', 'rgba(30,140,150,.5)', 'rgba(200,150,90,.42)', 'rgba(80,90,170,.5)'],
        accent: '#9cc4e6',
        accent2: '#e3be8a',
        onAccent: '#0d1822',
        fg: '#eef3f7',
        fg2: 'rgba(238,243,247,.7)',
        fg3: 'rgba(238,243,247,.5)',
      },
    },
    {
      id: 'ruby',
      name: 'Ruby',
      app: true,
      blurb: 'Warm reds with a touch of raspberry.',
      note: 'A simple red set: reds and blush with a raspberry partner.',
      light: {
        bg: '#f0e4e3',
        ground: ['#f6ecea', '#f0e4e3', '#f2e7e5'],
        blobs: ['rgba(232,110,110,.55)', 'rgba(245,170,160,.6)', 'rgba(200,90,120,.42)', 'rgba(240,212,202,.7)'],
        accent: '#a8283a',
        accent2: '#8e3b62',
        onAccent: '#ffffff',
        fg: '#2a1414',
        fg2: '#6b4c4b',
        fg3: '#987977',
      },
      dark: {
        bg: '#170c0e',
        ground: ['#2a1216', '#170c0e', '#1e0f12'],
        blobs: ['rgba(200,50,60,.5)', 'rgba(230,110,100,.36)', 'rgba(150,40,90,.45)', 'rgba(90,40,50,.5)'],
        accent: '#f28b8b',
        accent2: '#e79ab8',
        onAccent: '#2b0c0f',
        fg: '#f8ecec',
        fg2: 'rgba(248,236,236,.7)',
        fg3: 'rgba(248,236,236,.5)',
      },
    },
    {
      id: 'cobalt',
      name: 'Cobalt',
      app: true,
      blurb: 'Clear blues, bright and simple.',
      note: 'A simple blue set: brighter and plainer than Harbour.',
      light: {
        bg: '#e4e9f3',
        ground: ['#edf1f8', '#e4e9f3', '#e8ecf5'],
        blobs: ['rgba(90,140,235,.55)', 'rgba(150,195,250,.6)', 'rgba(70,110,200,.4)', 'rgba(210,225,245,.7)'],
        accent: '#2356c2',
        accent2: '#2f86cf',
        onAccent: '#ffffff',
        fg: '#121a2c',
        fg2: '#48536e',
        fg3: '#78829a',
      },
      dark: {
        bg: '#080d1a',
        ground: ['#0f1a33', '#080d1a', '#0b1326'],
        blobs: ['rgba(50,100,230,.5)', 'rgba(90,160,255,.35)', 'rgba(30,60,160,.55)', 'rgba(60,80,140,.4)'],
        accent: '#8fb2ff',
        accent2: '#7fd0ff',
        onAccent: '#0a1530',
        fg: '#eef2fc',
        fg2: 'rgba(238,242,252,.7)',
        fg3: 'rgba(238,242,252,.5)',
      },
    },
    {
      id: 'violet',
      name: 'Violet',
      app: true,
      blurb: 'Soft purples, calm and cool.',
      note: 'A simple purple set: violet and lilac, purer than Orchid.',
      light: {
        bg: '#ebe5f3',
        ground: ['#f2edf8', '#ebe5f3', '#eee8f5'],
        blobs: ['rgba(150,110,230,.5)', 'rgba(200,170,245,.6)', 'rgba(120,80,190,.4)', 'rgba(230,215,248,.7)'],
        accent: '#6a3fc2',
        accent2: '#9450c4',
        onAccent: '#ffffff',
        fg: '#1c1430',
        fg2: '#564b6c',
        fg3: '#857b9a',
      },
      dark: {
        bg: '#0f0a1a',
        ground: ['#1e1433', '#0f0a1a', '#160f26'],
        blobs: ['rgba(130,80,230,.5)', 'rgba(180,120,255,.35)', 'rgba(90,50,180,.55)', 'rgba(100,70,150,.45)'],
        accent: '#c3a8ff',
        accent2: '#e0a3ff',
        onAccent: '#1a0f33',
        fg: '#f2eefb',
        fg2: 'rgba(242,238,251,.7)',
        fg3: 'rgba(242,238,251,.5)',
      },
    },
    {
      id: 'ember',
      name: 'Ember',
      note: 'Coral, apricot and plum. Warm without shouting.',
      light: {
        bg: '#efe3dc',
        ground: ['#f5ebe5', '#efe3dc', '#f0e5df'],
        blobs: ['rgba(240,150,120,.7)', 'rgba(250,200,140,.7)', 'rgba(210,140,170,.55)', 'rgba(160,120,170,.5)'],
        accent: '#94472f',
        accent2: '#7a4f7e',
        onAccent: '#ffffff',
        fg: '#25160f',
        fg2: '#664f45',
        fg3: '#937a70',
      },
      dark: {
        bg: '#170f0e',
        ground: ['#2a1917', '#170f0e', '#1e1312'],
        blobs: ['rgba(210,100,70,.55)', 'rgba(230,160,90,.45)', 'rgba(170,80,120,.5)', 'rgba(100,60,130,.5)'],
        accent: '#f0a88c',
        accent2: '#d6a4d8',
        onAccent: '#2a130c',
        fg: '#f7ece7',
        fg2: 'rgba(247,236,231,.7)',
        fg3: 'rgba(247,236,231,.5)',
      },
    },
    {
      id: 'orchid',
      name: 'Orchid',
      note: 'Lavender, pink and periwinkle. Soft and a little playful.',
      light: {
        bg: '#e9e4ef',
        ground: ['#f1edf6', '#e9e4ef', '#ece6f1'],
        blobs: ['rgba(190,160,235,.7)', 'rgba(245,170,205,.6)', 'rgba(150,170,240,.6)', 'rgba(250,205,180,.55)'],
        accent: '#65509f',
        accent2: '#a8507a',
        onAccent: '#ffffff',
        fg: '#1d1826',
        fg2: '#575064',
        fg3: '#847d93',
      },
      dark: {
        bg: '#120f1a',
        ground: ['#1f1830', '#120f1a', '#171222'],
        blobs: ['rgba(130,90,210,.55)', 'rgba(200,90,150,.45)', 'rgba(80,100,200,.5)', 'rgba(200,130,110,.35)'],
        accent: '#c9b8f5',
        accent2: '#f0a6c8',
        onAccent: '#1b1330',
        fg: '#f1edf8',
        fg2: 'rgba(241,237,248,.7)',
        fg3: 'rgba(241,237,248,.5)',
      },
    },
    {
      id: 'dune',
      name: 'Dune',
      note: 'Sand, clay and dusk. The most living-room of the set.',
      light: {
        bg: '#ece5d8',
        ground: ['#f3ede2', '#ece5d8', '#eee7db'],
        blobs: ['rgba(230,190,130,.7)', 'rgba(205,150,120,.6)', 'rgba(175,180,165,.55)', 'rgba(190,170,190,.5)'],
        accent: '#76603c',
        accent2: '#955a46',
        onAccent: '#ffffff',
        fg: '#211b12',
        fg2: '#5e5446',
        fg3: '#8b8170',
      },
      dark: {
        bg: '#15120d',
        ground: ['#241e15', '#15120d', '#1b170f'],
        blobs: ['rgba(200,150,80,.5)', 'rgba(170,100,70,.5)', 'rgba(110,120,100,.45)', 'rgba(120,95,130,.45)'],
        accent: '#e2c897',
        accent2: '#e3a58b',
        onAccent: '#221a0e',
        fg: '#f4efe6',
        fg2: 'rgba(244,239,230,.7)',
        fg3: 'rgba(244,239,230,.5)',
      },
    },
    {
      id: 'aurora',
      name: 'Aurora',
      note: 'Night-sky cyan and violet. Cool, calm and a bit electric.',
      light: {
        bg: '#e2e8ec',
        ground: ['#ebf1f3', '#e2e8ec', '#e6ecef'],
        blobs: ['rgba(100,210,220,.6)', 'rgba(160,140,240,.6)', 'rgba(120,160,230,.55)', 'rgba(240,160,220,.45)'],
        accent: '#276a80',
        accent2: '#6a54c2',
        onAccent: '#ffffff',
        fg: '#122027',
        fg2: '#475a62',
        fg3: '#77898f',
      },
      dark: {
        bg: '#0a1117',
        ground: ['#0f1d27', '#0a1117', '#0c1620'],
        blobs: ['rgba(30,170,180,.5)', 'rgba(120,80,220,.55)', 'rgba(40,90,200,.5)', 'rgba(200,70,170,.4)'],
        accent: '#86d6e6',
        accent2: '#b7a4ff',
        onAccent: '#06222b',
        fg: '#eaf4f7',
        fg2: 'rgba(234,244,247,.7)',
        fg3: 'rgba(234,244,247,.5)',
      },
    },
    {
      id: 'graphite',
      name: 'Graphite',
      note: 'Apple-neutral greys. Lets the glass and the numbers do the work.',
      light: {
        bg: '#e8e8ea',
        ground: ['#f2f2f4', '#e8e8ea', '#ececee'],
        blobs: ['rgba(200,205,215,.8)', 'rgba(170,180,195,.6)', 'rgba(225,220,215,.7)', 'rgba(185,190,205,.55)'],
        accent: '#1d1d1f',
        accent2: '#6e6e73',
        onAccent: '#ffffff',
        fg: '#1d1d1f',
        fg2: '#55555a',
        fg3: '#838389',
      },
      dark: {
        bg: '#0c0c0e',
        ground: ['#1a1a1d', '#0c0c0e', '#121214'],
        blobs: ['rgba(90,95,110,.55)', 'rgba(60,65,80,.6)', 'rgba(120,115,110,.4)', 'rgba(75,80,100,.5)'],
        accent: '#f5f5f7',
        accent2: '#a1a1a6',
        onAccent: '#1d1d1f',
        fg: '#f5f5f7',
        fg2: 'rgba(245,245,247,.7)',
        fg3: 'rgba(245,245,247,.5)',
      },
    },
    {
      id: 'tide',
      name: 'Tide',
      note: 'Brighter blue, indigo and pink, closest to Apple’s own wallpapers.',
      light: {
        bg: '#e6e9f5',
        ground: ['#eef0fa', '#e6e9f5', '#e9ecf7'],
        blobs: ['rgba(90,140,255,.6)', 'rgba(175,110,255,.5)', 'rgba(255,140,180,.5)', 'rgba(100,220,255,.5)'],
        accent: '#3050c8',
        accent2: '#b83f82',
        onAccent: '#ffffff',
        fg: '#151a2e',
        fg2: '#4b526c',
        fg3: '#7b829c',
      },
      dark: {
        bg: '#070a1a',
        ground: ['#0e1430', '#070a1a', '#0a0f24'],
        blobs: ['rgba(60,100,255,.55)', 'rgba(150,70,255,.5)', 'rgba(255,80,150,.4)', 'rgba(40,190,255,.4)'],
        accent: '#9fb3ff',
        accent2: '#ff9fcf',
        onAccent: '#0b1030',
        fg: '#eef0fb',
        fg2: 'rgba(238,240,251,.7)',
        fg3: 'rgba(238,240,251,.5)',
      },
    },
  ];

  const solid = (c) => c.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)');
  HU.solid = solid;

  /** The swatch drawn inside each colour button: the four blob colours plus the accent. */
  HU.swatchStyle = function (p, mode) {
    const t = p[mode] || p.light;
    const b = t.blobs.map(solid);
    return `background: conic-gradient(from 200deg, ${b[0]} 0 25%, ${b[1]} 0 50%, ${b[2]} 0 75%, ${b[3]} 0 100%); --sw-accent: ${t.accent};`;
  };

  function block(t) {
    return [
      `--p-bg:${t.bg}`,
      `--p-ground:linear-gradient(160deg, ${t.ground[0]} 0%, ${t.ground[1]} 55%, ${t.ground[2]} 100%)`,
      `--p-blob1:${t.blobs[0]}`,
      `--p-blob2:${t.blobs[1]}`,
      `--p-blob3:${t.blobs[2]}`,
      `--p-blob4:${t.blobs[3]}`,
      `--p-accent:${t.accent}`,
      `--p-accent2:${t.accent2}`,
      `--p-on-accent:${t.onAccent}`,
      `--p-fg:${t.fg}`,
      `--p-fg2:${t.fg2}`,
      `--p-fg3:${t.fg3}`,
    ].join(';');
  }

  /** CSS for every combo in both modes, keyed on body[data-palette][data-mode]. */
  HU.paletteCSS = function () {
    return HU.palettes
      .map(
        (p) =>
          `body[data-palette="${p.id}"][data-mode="light"]{${block(p.light)}}\n` +
          `body[data-palette="${p.id}"][data-mode="dark"]{${block(p.dark)}}`,
      )
      .join('\n');
  };
})();
