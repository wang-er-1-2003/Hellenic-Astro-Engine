// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 星盘图 SVG 渲染（宫位圈 + 星座带 + 行星 + 四轴 + 相位线）
'use strict';

(function (global) {
  const CX = 260, CY = 260;      // 画布中心
  const R_SIGN_OUT = 243, R_SIGN_IN = 208;  // 星座带
  const R_HOUSE_OUT = 200, R_HOUSE_IN = 158; // 宫位带
  const R_PLANET = 132;          // 行星符号环
  const R_PLANET_DOT = 138;      // 行星点
  const R_PHASE_OUT = 118, R_PHASE_IN = 62; // 相位连线区
  const R_ANGLE = 205;           // 四轴线起点

  const ASPECT_COLOR = {
    'Conjunction': '#c0392b', 'Opposition': '#c0392b',
    'Square': '#e67e22', 'Trine': '#2e86c1', 'Sextile': '#27ae60',
    'Semisextile': '#95a5a6', 'Semisquare': '#95a5a6',
    'Sesquiquadrate': '#95a5a6', 'Quincunx': '#95a5a6',
  };
  const GLYPH = {
    '☉': { zh: '日' }, '☽': { zh: '月' }, '☿': { zh: '水' }, '♀': { zh: '金' },
    '♂': { zh: '火' }, '♃': { zh: '木' }, '♄': { zh: '土' },
    '♅': { zh: '天' }, '♆': { zh: '海' }, '♇': { zh: '冥' },
    '☊': { zh: '北交' }, '☋': { zh: '南交' },
  };
  const SIGN_NAMES = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '宝瓶', '双鱼'];
  const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

  // 黄经 λ → 屏幕极角 φ（ASC 固定左=180°；黄经增 → 顺时针）
  function phi(asc, lon) {
    let a = (180 + (lon - asc)) % 360;
    return a < 0 ? a + 360 : a;
  }
  // 极坐标 → SVG 坐标（φ 顺时针，y 向下）
  function pt(r, deg) {
    const rad = deg * Math.PI / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }
  const F = (n) => n.toFixed(2);

  // 弧 path：φa→φb 顺时针（允许跨 0°）
  function arcPath(rOut, rIn, degA, degB) {
    let a = degA, b = degB;
    if (b < a) b += 360;
    const large = (b - a) > 180 ? 1 : 0;
    const p1 = pt(rOut, a), p2 = pt(rOut, b), p3 = pt(rIn, b), p4 = pt(rIn, a);
    return `M ${F(p1.x)} ${F(p1.y)} A ${rOut} ${rOut} 0 ${large} 1 ${F(p2.x)} ${F(p2.y)} ` +
           `L ${F(p3.x)} ${F(p3.y)} A ${rIn} ${rIn} 0 ${large} 0 ${F(p4.x)} ${F(p4.y)} Z`;
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /**
   * 渲染星盘 SVG。
   * @param {HTMLElement} container
   * @param {object} chart 引擎输出（chart.js 结构）
   */
  function render(container, chart) {
    const asc = chart.houses.angles.asc;
    const cusps = chart.houses.cuspsRaw; // [c1..c12] 黄经
    const parts = [];

    parts.push(`<svg viewBox="0 0 ${CX * 2} ${CY * 2}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:560px;display:block">`);
    parts.push(`<circle cx="${CX}" cy="${CY}" r="${R_SIGN_OUT}" fill="#fff" stroke="#333" stroke-width="1"/>`);

    // ---- 星座带 ----
    for (let s = 0; s < 12; s++) {
      const a0 = phi(asc, s * 30), a1 = phi(asc, (s + 1) * 30);
      parts.push(`<path d="${arcPath(R_SIGN_OUT, R_SIGN_IN, a0, a1)}" fill="${s % 2 ? '#f4f6f8' : '#eef2f6'}" stroke="#999" stroke-width="0.5"/>`);
      const mid = pt((R_SIGN_OUT + R_SIGN_IN) / 2, (a0 + a1) / 2);
      parts.push(`<text x="${F(mid.x)}" y="${F(mid.y + 4)}" text-anchor="middle" font-size="13" fill="#444">${SIGN_GLYPHS[s]} ${SIGN_NAMES[s]}</text>`);
    }

    // ---- 宫位带 ----
    const cuspAngles = cusps.map(c => phi(asc, c));
    for (let i = 0; i < 12; i++) {
      const a0 = cuspAngles[i], a1 = cuspAngles[(i + 1) % 12];
      parts.push(`<path d="${arcPath(R_HOUSE_OUT, R_HOUSE_IN, a0, a1)}" fill="none" stroke="#777" stroke-width="0.6"/>`);
      // 宫头半径线
      const p = pt(R_ANGLE, a0), q = pt(R_HOUSE_IN, a0);
      parts.push(`<line x1="${F(p.x)}" y1="${F(p.y)}" x2="${F(q.x)}" y2="${F(q.y)}" stroke="#777" stroke-width="0.8"/>`);
      // 宫号（段中央）
      let midA = (a0 + a1) / 2;
      const m = pt((R_HOUSE_OUT + R_HOUSE_IN) / 2, midA);
      parts.push(`<text x="${F(m.x)}" y="${F(m.y + 4)}" text-anchor="middle" font-size="11" font-weight="600" fill="#333">${i + 1}</text>`);
    }

    // ---- 相位线（先画，压在行星下）----
    const posByIdx = {};
    chart.planets.forEach(p => { posByIdx[p.idx] = p; });
    for (const a of chart.aspects) {
      const p1 = posByIdx[a.p1], p2 = posByIdx[a.p2];
      if (!p1 || !p2) continue;
      const q1 = pt(R_PHASE_OUT, phi(asc, p1.lon));
      const q2 = pt(R_PHASE_OUT, phi(asc, p2.lon));
      const color = ASPECT_COLOR[a.aspect] || '#95a5a6';
      const w = Math.max(1, 2.4 - a.orbUsed * 0.12);
      parts.push(`<line x1="${F(q1.x)}" y1="${F(q1.y)}" x2="${F(q2.x)}" y2="${F(q2.y)}" stroke="${color}" stroke-width="${F(w)}" opacity="0.55"/>`);
    }

    // ---- 四轴（ASC 左、MC 上按计算）----
    const angles = [
      { key: 'asc', label: 'ASC' }, { key: 'mc', label: 'MC' },
      { key: 'dc', label: 'DC' }, { key: 'ic', label: 'IC' },
    ];
    for (const a of angles) {
      const lon = chart.houses.angles[a.key];
      const aDeg = phi(asc, lon);
      const p = pt(R_ANGLE, aDeg), q = pt(R_SIGN_OUT, aDeg);
      parts.push(`<line x1="${F(p.x)}" y1="${F(p.y)}" x2="${F(q.x)}" y2="${F(q.y)}" stroke="#2c5f8a" stroke-width="1.6"/>`);
      const t = pt(R_SIGN_OUT + 10, aDeg);
      parts.push(`<text x="${F(t.x)}" y="${F(t.y + 4)}" text-anchor="middle" font-size="12" font-weight="700" fill="#2c5f8a">${a.label}</text>`);
    }

    // ---- 行星 ----
    for (const p of chart.planets) {
      const aDeg = phi(asc, p.lon);
      const d = pt(R_PLANET_DOT, aDeg);
      parts.push(`<circle cx="${F(d.x)}" cy="${F(d.y)}" r="3.2" fill="#1a1a1a"/>`);
      const g = pt(R_PLANET, aDeg);
      const glyph = esc(p.glyph);
      const zh = GLYPH[p.glyph] ? GLYPH[p.glyph].zh : '';
      const retro = p.retrograde ? ' <tspan font-size="9" fill="#b00">R</tspan>' : '';
      // 行星符号（带浅底圆，提升可读性）
      parts.push(`<g><circle cx="${F(g.x)}" cy="${F(g.y)}" r="11" fill="#fff" stroke="#bbb" stroke-width="0.6" opacity="0.9"/>` +
                 `<text x="${F(g.x)}" y="${F(g.y + 4)}" text-anchor="middle" font-size="13" fill="#111">${glyph}</text></g>`);
      // 度数标注（环外小字）
      const t = pt(R_HOUSE_IN - 12, aDeg);
      parts.push(`<text x="${F(t.x)}" y="${F(t.y + 3)}" text-anchor="middle" font-size="8.5" fill="#666">${zh}${p.position.signDeg.toFixed(1)}°${retro}</text>`);
    }

    // ---- 中心文字 ----
    parts.push(`<text x="${CX}" y="${CY - 6}" text-anchor="middle" font-size="12" fill="#555">${esc(chart.meta.type)}</text>`);
    parts.push(`<text x="${CX}" y="${CY + 10}" text-anchor="middle" font-size="10" fill="#888">${esc(chart.houses.systemName)}</text>`);

    parts.push('</svg>');
    container.innerHTML = parts.join('');
  }

  global.renderChartView = render;
})(window);
