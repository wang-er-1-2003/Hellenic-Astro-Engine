// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - Almuten 命主（Lord of the Geniture）判定
// 数据源：Clavis CP3-504（Almuten 择法两派）/ CP3-307（命主判定细则）
//   现代法（Coley）：全盘 本然+偶然尊贵总和 最高者
//   古法：月在月与水星之位中 本然尊贵最多者（水星主灵、月主身）
//   平局（CP3-307 尾句已实现）：①ASC落座本然尊贵多者 ②吉照升点 ③吉照其主（升主） ④吉照日月；最终并列全列出
'use strict';
const fs = require('fs');
const path = require('path');
const { essentialDignities } = require('./dignity');
const { dif } = require('./ecliptic');

const TABLES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/dignity_tables.json'), 'utf-8')
).tables;
const W = { domicile: 5, exaltation: 4, triplicity: 3, term: 2, face: 1 };

/** 行星在某个星座（整体）内的本然尊贵权：庙5/擢4/三分3/界2/面1 */
function dignityInSign(planetIdx, signIdx, isDay) {
  let score = 0;
  const list = [];
  if (TABLES.domicile[signIdx] === planetIdx) { score += 5; list.push('庙'); }
  const ex = TABLES.exaltation[signIdx];
  if (ex && ex.planet === planetIdx) { score += 4; list.push(`擢(${ex.deg}°)`); }
  const tri = TABLES.triplicity[signIdx];
  if (tri) {
    const tm = isDay ? tri.day : tri.night;
    if (tm === planetIdx) { score += 3; list.push(`三分(${isDay ? '昼' : '夜'})`); }
  }
  if (TABLES.terms[signIdx].some(t => t.p === planetIdx)) { score += 2; list.push('界'); }
  if (TABLES.faces[signIdx].some(f => f.p === planetIdx)) { score += 1; list.push('面'); }
  return { score, list };
}

/**
 * 命主判定。
 * @param {object} chart computeChart 输出（含 planets[].dignityScore/accidental、houses.angles.asc、meta.isDay）
 * @returns {{modern:{zh,glyph,total,essential,accidental,tieNote}, ancient:{zh,glyph,score,moonSign,mercSign,note}, sources:string[]}}
 */
function findAlmuten(chart) {
  const isDay = chart.meta.isDay === 'day';
  const seven = chart.planets.filter(p => p.idx <= 6);

  // ---- 现代法（Coley）：本然+偶然总和最高 ----
  const scored = seven.map(p => ({
    planet: p,
    essential: p.dignityScore || 0,
    accidental: p.accidental ? p.accidental.score : 0,
    total: (p.dignityScore || 0) + (p.accidental ? p.accidental.score : 0),
  }));
  const maxTotal = Math.max(...scored.map(s => s.total));
  const tied = scored.filter(s => s.total === maxTotal);
  let winner;
  let tieNote = '';
  if (tied.length === 1) {
    winner = tied[0];
  } else {
    // 平局细则（CP3-307 尾句）：①ASC落座本然尊贵多者 ②吉照升点 ③吉照其主（升主） ④吉照日月；仍并列全列出（如实）
    const ascLon = chart.houses.angles.asc;
    const ascRulerIdx = TABLES.domicile[Math.floor(ascLon / 30)];
    const ascRuler = chart.planets.find(p => p.idx === ascRulerIdx);
    const sunP = chart.planets.find(p => p.idx === 0);
    const moonP = chart.planets.find(p => p.idx === 1);
    const orb = 8;
    const goodAspect = (lonA, lonB) => {
      const d = Math.abs(dif(lonA, lonB));
      return [0, 60, 120].some(a => Math.abs(d - a) < orb);
    };
    let pool = tied.map(s => ({
      ...s,
      ascEssential: essentialDignities(s.planet.idx, ascLon, isDay).reduce((t, d) => t + (W[d.dignity] || 0), 0),
    }));
    const steps = ['并列（综合' + maxTotal + '）'];
    // ① ASC 落座本然尊贵多者
    const maxAsc = Math.max(...pool.map(s => s.ascEssential));
    pool = pool.filter(s => s.ascEssential === maxAsc);
    steps.push('ASC落座本然尊贵');
    // ② 吉照升点（吉照=合/六/三 工程口径，8°；原文未限定吉星照，标注）
    if (pool.length > 1) {
      const withAsc = pool.filter(s => goodAspect(s.planet.lon, ascLon));
      if (withAsc.length) { pool = withAsc; steps.push('吉照升点'); }
    }
    // ③ 吉照其主（升主）
    if (pool.length > 1 && ascRuler && ascRulerIdx != null && ascRulerIdx <= 6) {
      const withRuler = pool.filter(s => s.planet.idx !== ascRulerIdx && goodAspect(s.planet.lon, ascRuler.lon));
      if (withRuler.length) { pool = withRuler; steps.push('吉照升主'); }
    }
    // ④ 吉照日月（排除自照：候选行星自身不是日/月）
    if (pool.length > 1) {
      const withLum = pool.filter(s =>
        (sunP && s.planet.idx !== 0 && goodAspect(s.planet.lon, sunP.lon)) ||
        (moonP && s.planet.idx !== 1 && goodAspect(s.planet.lon, moonP.lon)));
      if (withLum.length) { pool = withLum; steps.push('吉照日月'); }
    }
    winner = pool[0];
    tieNote = steps.join(' → ') + '裁定（CP3-307）' +
      (pool.length > 1 ? `；仍并列，全列出：${pool.map(s => s.planet.zh).join('/')}（取首者为主，其余并列注记）` : '');
  }

  // ---- 古法：月与水星之位中本然尊贵最多者 ----
  const moon = chart.planets.find(p => p.idx === 1);
  const merc = chart.planets.find(p => p.idx === 2);
  let ancient = null;
  if (moon && merc) {
    const moonSign = Math.floor(moon.lon / 30);
    const mercSign = Math.floor(merc.lon / 30);
    const sameSign = moonSign === mercSign;
    const aScores = seven.map(p => {
      const m = dignityInSign(p.idx, moonSign, isDay);
      const g = dignityInSign(p.idx, mercSign, isDay);
      const score = sameSign ? m.score : m.score + g.score; // 同星座时按单星座计一次并标注
      const list = sameSign ? m.list : [...m.list, ...g.list];
      return { planet: p, score, list };
    });
    const maxA = Math.max(...aScores.map(s => s.score));
    const aWinner = aScores.find(s => s.score === maxA);
    ancient = {
      zh: aWinner.planet.zh, glyph: aWinner.planet.glyph, score: aWinner.score,
      moonSign, mercSign, list: aWinner.list,
      note: sameSign ? '月与水星同星座，按单星座计（标注）' : '月座+水星座尊贵权合计（界/面按星座整体计，Clavis 原文口径）',
    };
  }

  return {
    modern: {
      zh: winner.planet.zh, glyph: winner.planet.glyph,
      total: winner.total, essential: winner.essential, accidental: winner.accidental,
      tieNote,
    },
    ancient,
    sources: ['Clavis CP3-504', 'Clavis CP3-307'],
    note: '平局细则已实现：ASC落座本然尊贵 → 吉照升点 → 吉照升主 → 吉照日月（CP3-307 尾句）；吉照=合/六/三工程口径（原文未限定吉星照）',
  };
}

module.exports = { findAlmuten, dignityInSign };
