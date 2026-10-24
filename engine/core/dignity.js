// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 尊贵计算（庙/擢/三分/界/面 + 陷/落 + 权重计分）
'use strict';
const fs = require('fs');
const path = require('path');
const { DIGNITY_WEIGHTS } = require('./constants');
const { norm } = require('./ecliptic');

const TABLES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/dignity_tables.json'), 'utf-8')
);

/**
 * 单一行星在某黄经的五项本然尊贵。
 * @param {number} planetIdx 行星索引（0-6 传统七政）
 * @param {number} lon 黄经
 * @param {boolean} isDay 昼生（决定三分主取昼/夜）
 * @returns {Array<{dignity, weight, detail}>}
 */
function essentialDignities(planetIdx, lon, isDay = true) {
  const signIdx = Math.floor(norm(lon) / 30);
  const degInSign = norm(lon) - signIdx * 30;
  const out = [];

  // 庙
  if (TABLES.tables.domicile[signIdx] === planetIdx) {
    out.push({ dignity: 'domicile', weight: DIGNITY_WEIGHTS.domicile, detail: '庙' });
  }
  // 擢
  const ex = TABLES.tables.exaltation[signIdx];
  if (ex && ex.planet === planetIdx) {
    out.push({ dignity: 'exaltation', weight: DIGNITY_WEIGHTS.exaltation, detail: `擢(${ex.deg}°)${ex.note ? ' ' + ex.note : ''}` });
  }
  // 三分
  const tri = TABLES.tables.triplicity[signIdx];
  const triMaster = isDay ? tri.day : tri.night;
  if (triMaster === planetIdx) {
    out.push({ dignity: 'triplicity', weight: DIGNITY_WEIGHTS.triplicity, detail: `三分主(${isDay ? '昼' : '夜'})` });
  }
  // 界
  const terms = TABLES.tables.terms[signIdx];
  for (const t of terms) {
    if (t.p === planetIdx && degInSign < t.e) {
      out.push({ dignity: 'term', weight: DIGNITY_WEIGHTS.term, detail: `界(<${t.e}°)` });
      break;
    }
  }
  // 面
  const faces = TABLES.tables.faces[signIdx];
  for (const f of faces) {
    if (f.p === planetIdx && degInSign < f.e) {
      out.push({ dignity: 'face', weight: DIGNITY_WEIGHTS.face, detail: `面(<${f.e}°)` });
      break;
    }
  }
  // 陷 / 落（负分，随本然强弱报告）
  if (TABLES.tables.detriment[signIdx] === planetIdx) {
    out.push({ dignity: 'detriment', weight: DIGNITY_WEIGHTS.detriment, detail: '陷' });
  }
  if (TABLES.tables.fall[signIdx] === planetIdx) {
    out.push({ dignity: 'fall', weight: DIGNITY_WEIGHTS.fall, detail: '落' });
  }
  return out;
}

/**
 * 本然尊贵总分（五项权重和，含陷/落负分）。
 */
function dignityScore(planetIdx, lon, isDay = true) {
  return essentialDignities(planetIdx, lon, isDay).reduce((s, d) => s + d.weight, 0);
}

/**
 * 界制对照：同一黄经在 埃及界（Chaldean，主流流通"Ptolemy 界"表实为这套）、
 * Ptolemy 修正界（Tetrabiblos Ashmand 译本，含双重权利共管段）与 Valens 五十界 下的界主。
 * 数据：埃及界 = dignity_tables.json；Ptolemy = ptolemy_terms.json；Valens = rule_tables.json「映射A-五十界全表」。
 * @returns {{degInSign, egyptian:{planet,end}, ptolemy:{planets,start,end}, valens:{planet,start,end}, match}}
 *          match: 'all'（三套一致）/ 'eg_val'（埃及=Valens≠Ptolemy）/ 'eg_pt'（埃及=Ptolemy≠Valens）/
 *                 'pt_val'（Ptolemy=Valens≠埃及）/ 'none' / null（数据缺失）
 */
let _ptTerms = null;
function ptolemyTermsTable() {
  if (_ptTerms) return _ptTerms;
  _ptTerms = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/ptolemy_terms.json'), 'utf-8')).terms;
  return _ptTerms;
}

let _valensTerms = null;
function valensTermsTable() {
  if (_valensTerms) return _valensTerms;
  const db = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/rule_tables.json'), 'utf-8'));
  const t = db.tables.find(x => x.table === '映射A-五十界全表');
  const EN = { Aries: 0, Taurus: 1, Gemini: 2, Cancer: 3, Leo: 4, Virgo: 5, Libra: 6, Scorpio: 7, Sagittarius: 8, Capricorn: 9, Aquarius: 10, Pisces: 11 };
  const ZH = { Jupiter: '木星', Venus: '金星', Mercury: '水星', Mars: '火星', Saturn: '土星' };
  _valensTerms = Array.from({ length: 12 }, () => []);
  for (const r of t.rows) {
    const si = EN[r[0]];
    if (si == null) continue;
    _valensTerms[si].push({ planet: ZH[r[2]] || r[2], start: parseFloat(r[4]), end: parseFloat(r[5]) });
  }
  return _valensTerms;
}

function termsCompare(lon) {
  const signIdx = Math.floor(norm(lon) / 30);
  const degInSign = norm(lon) - signIdx * 30;
  const PLANET_ZH = { 0: '太阳', 1: '月亮', 2: '水星', 3: '金星', 4: '火星', 5: '木星', 6: '土星' };
  // 埃及界（Dorotheus 主流收此套；dignity_tables.json 即此系统，非 Ptolemy 界）
  let egyptian = null;
  for (const t of TABLES.tables.terms[signIdx]) {
    if (degInSign < t.e) { egyptian = { planet: PLANET_ZH[t.p] || String(t.p), end: t.e }; break; }
  }
  // Ptolemy 修正界（Ashmand，可共管段）
  let ptolemy = null;
  for (const s of ptolemyTermsTable()[signIdx]) {
    if (degInSign >= s.start && degInSign < s.end) { ptolemy = s; break; }
  }
  // Valens 五十界
  let valens = null;
  for (const s of valensTermsTable()[signIdx]) {
    if (degInSign >= s.start && degInSign < s.end) { valens = s; break; }
  }
  let match = null;
  if (egyptian && ptolemy && valens) {
    const inPt = ptolemy.planets.includes(egyptian.planet);
    const inPtV = ptolemy.planets.includes(valens.planet);
    if (egyptian.planet === valens.planet && inPt) match = 'all';
    else if (egyptian.planet === valens.planet) match = 'eg_val';
    else if (inPt && inPtV) match = 'pt_val';
    else if (inPt) match = 'eg_pt';
    else if (inPtV) match = 'val_pt';
    else match = 'none';
  } else if (egyptian && valens) {
    match = egyptian.planet === valens.planet ? 'all' : 'none';
  }
  return { degInSign: Math.round(degInSign * 10) / 10, egyptian, ptolemy, valens, match };
}

module.exports = { essentialDignities, dignityScore, termsCompare };
