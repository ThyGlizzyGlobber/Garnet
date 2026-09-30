/*
  Instruments and charts. One series per chart (no dual axes), 2px lines,
  4px rounded data ends, a hover layer on every plotted chart, text in text
  colours (never the series colour). Labels are HTML so they never stretch.
*/
(function () {
  const HU = (window.HU = window.HU || {});
  let uid = 0;
  const id = (p) => `${p}${++uid}`;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || raw;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(v);
    return out;
  }

  /* Smooth path through points (monotone-ish Catmull-Rom). */
  function smooth(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const t = 0.18;
      const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
      const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
      d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return d;
  }

  const ch = (HU.ch = {});

  /** Sparkline: area + 2px line + end dot, fills its box. */
  ch.spark = function (values, o = {}) {
    const col = o.colour || 'var(--p-accent)';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const flat = max - min < Math.abs(max) * 0.002;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, flat ? 55 : 92 - ((v - min) / span) * 78]);
    const gid = id('sg');
    const last = pts[pts.length - 1];
    return `<div class="spark" style="--c:${col}">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".32"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
        <path d="${smooth(pts)} L100,100 L0,100 Z" fill="url(#${gid})"/>
        <path d="${smooth(pts)}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round"/>
      </svg>
      <i class="spark-dot" style="left:${last[0]}%;top:${last[1]}%"></i>
    </div>`;
  };

  /**
   * Trend: one smooth line with a gradient area, a fitted axis, a callout on
   * the latest value and a crosshair tooltip. points: [{label, value, tip}]
   */
  ch.trend = function (points, o = {}) {
    const col = o.colour || 'var(--p-accent)';
    const vals = points.map((p) => p.value);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const pad = (max - min) * 0.35 || max * 0.1;
    const ticks = niceTicks(min - pad, max + pad * 0.6, o.ticks || 3);
    min = ticks[0];
    max = ticks[ticks.length - 1];
    const y = (v) => 100 - ((v - min) / (max - min)) * 100;
    const pts = points.map((p, i) => [(i / (points.length - 1)) * 100, y(p.value)]);
    const gid = id('tg');
    const last = pts[pts.length - 1];
    const lastP = points[points.length - 1];
    const fmtAxis = o.axisFormat || ((v) => v);
    const series = esc(JSON.stringify(points.map((p, i) => ({ x: pts[i][0], y: pts[i][1], t: p.tip || `${p.label} · ${p.value}` }))));
    const showAxis = o.axis !== false;
    const showX = o.xLabels !== false;
    const xl = showX
      ? `<div class="chart-x">${points
          .map((p, i) => {
            const every = o.every || 1;
            const show = i % every === 0 || i === points.length - 1;
            return `<span style="left:${pts[i][0]}%">${show ? p.label : ''}</span>`;
          })
          .join('')}</div>`
      : '';
    const yl = showAxis
      ? `<div class="chart-y">${ticks.map((t) => `<span style="top:${y(t)}%">${fmtAxis(t)}</span>`).join('')}</div>`
      : '';
    const grid = showAxis ? ticks.map((t) => `<i class="chart-grid" style="top:${y(t)}%"></i>`).join('') : '';
    return `<figure class="chart chart-trend${showAxis ? ' has-axis' : ''}${showX ? ' has-x' : ''}" style="--c:${col}" data-series="${series}" aria-label="${esc(o.label || 'Trend')}">
      ${yl}
      <div class="chart-plot">
        ${grid}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".34"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
          <path d="${smooth(pts)} L100,100 L0,100 Z" fill="url(#${gid})"/>
          <path class="chart-line" d="${smooth(pts)}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round"/>
        </svg>
        ${pts.map((p, i) => (o.dots ? `<i class="chart-pt${i === pts.length - 1 ? ' last' : ''}" style="left:${p[0]}%;top:${p[1]}%"></i>` : '')).join('')}
        <i class="chart-pt last" style="left:${last[0]}%;top:${last[1]}%"></i>
        ${o.callout !== false ? `<span class="chart-callout" style="left:${last[0]}%;top:${last[1]}%">${esc(lastP.short || lastP.value)}</span>` : ''}
        <i class="chart-cross" hidden></i><i class="chart-hover-pt" hidden></i><span class="chart-tip" hidden></span>
      </div>
      ${xl}
    </figure>`;
  };

  /**
   * Bars that span each bill's period on a time axis, height = value per day.
   * bars: [{from, to, value, tip, est}] ; o.ref = {value, label} reference line.
   */
  ch.periodBars = function (bars, o = {}) {
    const col = o.colour || 'var(--p-accent)';
    const t0 = Date.parse(bars[0].from);
    const t1 = Date.parse(bars[bars.length - 1].to) + 86400000;
    const x = (s) => ((Date.parse(s) - t0) / (t1 - t0)) * 100;
    const top = Math.max(...bars.map((b) => b.value), o.ref ? o.ref.value : 0) * 1.18;
    const h = (v) => (v / top) * 100;
    const years = [];
    let yr = new Date(t0).getUTCFullYear() + 1;
    while (Date.parse(`${yr}-01-01`) < t1) {
      years.push(yr);
      yr++;
    }
    return `<figure class="chart chart-bars" style="--c:${col}" aria-label="${esc(o.label || 'Per bill')}">
      <div class="chart-plot">
        <i class="chart-grid" style="top:100%"></i>
        ${years.map((y) => `<i class="chart-year" style="left:${x(`${y}-01-01`)}%"><span>${y}</span></i>`).join('')}
        ${bars
          .map(
            (b) => `<button class="pbar${b.est ? ' est' : ''}${b.flag ? ' flag' : ''}" ${b.go ? `data-go="${b.go}"` : ''} data-tip="${esc(b.tip)}" style="left:calc(${x(b.from)}% + 1px);width:calc(${x(b.to) - x(b.from) + (100 * 86400000) / (t1 - t0)}% - 2px);height:${h(b.value)}%" aria-label="${esc(b.tip)}"></button>`,
          )
          .join('')}
        ${o.ref ? `<i class="chart-ref" style="bottom:${h(o.ref.value)}%"><span>${esc(o.ref.label)}</span></i>` : ''}
        <span class="chart-tip" hidden></span>
      </div>
      <div class="chart-x">${bars.map((b) => `<span style="left:${(x(b.from) + x(b.to)) / 2}%">${esc(b.label || '')}</span>`).join('')}</div>
    </figure>`;
  };

  /** Ring: gradient stroke (accent → accent 2), optional ticks, centre content. */
  ch.ring = function (frac, o = {}) {
    const size = o.size || 120;
    const sw = o.stroke || 'var(--ring-w)';
    const r = 42;
    const c = 2 * Math.PI * r;
    const f = Math.max(0, Math.min(1, frac));
    const gid = id('rg');
    const ticks = Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2 - Math.PI / 2;
      const r1 = 49;
      const r2 = i % 4 === 0 ? 46 : 47.2;
      return `<line x1="${50 + r1 * Math.cos(a)}" y1="${50 + r1 * Math.sin(a)}" x2="${50 + r2 * Math.cos(a)}" y2="${50 + r2 * Math.sin(a)}"/>`;
    }).join('');
    const colA = o.colour || 'var(--p-accent)';
    const colB = o.colour2 || (o.colour ? o.colour : 'var(--p-accent2)');
    return `<div class="ring" style="--size:${size}px">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colA}"/><stop offset="1" stop-color="${colB}"/></linearGradient></defs>
        <g class="ring-ticks">${ticks}</g>
        <circle class="ring-track" cx="50" cy="50" r="${r}" fill="none" style="stroke-width:${sw}"/>
        <circle class="ring-arc" cx="50" cy="50" r="${r}" fill="none" stroke="url(#${gid})" style="stroke-width:${sw};--glowc:${colA}" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 50 50)"/>
      </svg>
      <div class="ring-in">${o.inner || ''}</div>
    </div>`;
  };

  /** Half gauge with an end cap. */
  ch.arc = function (frac, o = {}) {
    const f = Math.max(0, Math.min(1, frac));
    const gid = id('ag');
    const a = Math.PI * (1 - f);
    const cx = 50 + 40 * Math.cos(a);
    const cy = 50 - 40 * Math.sin(a);
    const colA = o.colour || 'var(--p-accent)';
    const colB = o.colour2 || (o.colour ? o.colour : 'var(--p-accent2)');
    const mark = o.mark != null ? Math.PI * (1 - o.mark) : null;
    return `<div class="arc">
      <svg viewBox="0 0 100 56" aria-hidden="true">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${colA}"/><stop offset="1" stop-color="${colB}"/></linearGradient></defs>
        <path class="arc-track" d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke-linecap="round"/>
        <path class="arc-val" d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="url(#${gid})" stroke-linecap="round" pathLength="100" stroke-dasharray="${(f * 100).toFixed(1)} 100" style="--glowc:${colA}"/>
        ${mark != null ? `<line class="arc-mark" x1="${50 + 33 * Math.cos(mark)}" y1="${50 - 33 * Math.sin(mark)}" x2="${50 + 47 * Math.cos(mark)}" y2="${50 - 47 * Math.sin(mark)}"/>` : ''}
        <circle class="arc-cap" cx="${cx}" cy="${cy}" r="4.2" style="fill:${colB}"/>
      </svg>
      <div class="arc-in">${o.inner || ''}</div>
    </div>`;
  };

  /** Horizontal stacked bar with a 2px gap between parts. parts: [{value, colour, label}] */
  ch.stack = function (parts, o = {}) {
    const total = parts.reduce((a, p) => a + p.value, 0) || 1;
    return `<div class="stackbar${o.thin ? ' thin' : ''}" role="img" aria-label="${esc(parts.map((p) => `${p.label}: ${p.text || ''}`).join(', '))}">${parts
      .map((p) => `<i class="${p.hatch ? 'hatch' : ''}" style="flex:${p.value / total};--c:${p.colour}" ${p.tip ? `data-tip="${esc(p.tip)}"` : ''}></i>`)
      .join('')}</div>`;
  };

  /** Forecast strip: pill bars, the first solid, the rest hatched (estimates). */
  ch.pills = function (items, o = {}) {
    const max = Math.max(...items.map((i) => i.value));
    const min = Math.min(...items.map((i) => i.value));
    return `<div class="pills">${items
      .map((it, i) => {
        const h = 38 + ((it.value - min) / (max - min || 1)) * 62;
        return `<div class="pill-col" data-tip="${esc(it.tip || '')}"><span class="pill-v">${o.showAll || i === 0 ? esc(it.short) : ''}</span><i class="pill${i === 0 ? ' solid' : ''}" style="height:${h}%"></i><span class="pill-l">${esc(it.label)}</span></div>`;
      })
      .join('')}</div>`;
  };

  /* One hover handler for every chart on the page (works inside scaled frames). */
  function onMove(e) {
    const fig = e.target.closest && e.target.closest('.chart');
    document.querySelectorAll('.chart.hovering').forEach((c) => c !== fig && clear(c));
    if (!fig) return;
    const plot = fig.querySelector('.chart-plot');
    const tip = plot.querySelector('.chart-tip');
    const r = plot.getBoundingClientRect();
    if (fig.dataset.series) {
      const s = JSON.parse(fig.dataset.series);
      const px = ((e.clientX - r.left) / r.width) * 100;
      let best = 0;
      s.forEach((p, i) => Math.abs(p.x - px) < Math.abs(s[best].x - px) && (best = i));
      const p = s[best];
      const cross = plot.querySelector('.chart-cross');
      const dot = plot.querySelector('.chart-hover-pt');
      cross.hidden = dot.hidden = tip.hidden = false;
      cross.style.left = dot.style.left = p.x + '%';
      dot.style.top = p.y + '%';
      tip.textContent = p.t;
      tip.style.left = Math.min(Math.max(p.x, 14), 86) + '%';
      tip.style.top = p.y + '%';
      fig.classList.add('hovering');
      return;
    }
    const bar = e.target.closest('[data-tip]');
    if (bar && fig.contains(bar)) {
      const br = bar.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = bar.dataset.tip;
      tip.style.left = Math.min(Math.max(((br.left + br.width / 2 - r.left) / r.width) * 100, 16), 84) + '%';
      tip.style.top = ((br.top - r.top) / r.height) * 100 + '%';
      fig.classList.add('hovering');
    } else clear(fig);
  }
  function clear(fig) {
    fig.classList.remove('hovering');
    fig.querySelectorAll('.chart-cross,.chart-hover-pt,.chart-tip').forEach((el) => (el.hidden = true));
  }
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', () => document.querySelectorAll('.chart.hovering').forEach(clear));
})();
