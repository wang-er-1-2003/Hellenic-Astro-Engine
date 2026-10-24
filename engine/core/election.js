// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - D 择时域（Electional）：候选时间天象盘 → 宜忌评分
// 数据源：规则库-Bonatti4宫择时.xlsx（BT-001~055）+ 规则库-Clavis择时世俗卷.xlsx（行星时辰/择时选盘）
// 第二版新增：同盘接纳/互溶（BT-010）+ 月庙主照上升（BT-020）
// 第三版新增：本命协同（CE-163 一切择时以本命为根基 + LCA-501 + CE-175/177 专项）
// 实事求是：仅实现可计算的通用判据链，每条注明来源；固定星/行星时辰（需日出日落接口，swe 无 riset）声明未计。
'use strict';
const fs = require('fs');
const path = require('path');
const { lotOfFortune, houseOfLon } = require('./life');
const { fixedStarChecks } = require('./fixed_stars');

const ORB = 8; // 照升点相位容许度（工程默认，古典未统一）
const ANGLES = new Set([1, 4, 7, 10]);
const BAD_HOUSES = new Set([1, 9, 11]); // BT-004 al-Kindi：凶星不入 9/1/11
const ASPECTS = { 0: '合', 60: '六合', 90: '刑', 120: '三合', 180: '冲' };
const BENEFIC = new Set([3, 5]);
const MALEFIC = new Set([4, 6]);
const DIGN = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/dignity_tables.json'), 'utf-8')).tables;
const DOMICILE = DIGN.domicile;
const EXALT = DIGN.exaltation.map(e => (e ? e.planet : null));

function dif(a, b) {
  let d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/** 同盘接纳/互溶：X 落 Y 的庙/擢座 且 Y 落 X 的庙/擢座 → 互溶；单向 → 接纳 */
function receptionOnChart(lonX, idxX, lonY, idxY) {
  const sx = Math.floor(lonX / 30), sy = Math.floor(lonY / 30);
  const xInY = DOMICILE[sy] === idxX || EXALT[sy] === idxX;
  const yInX = DOMICILE[sx] === idxY || EXALT[sx] === idxY;
  if (xInY && yInX) return '互溶';
  return null;
}

/** 候选时间天象盘的择时评分；可选本命盘做本命协同（CE-163 一切择时以本命为根基） */
function electionScore(chart, natalChart) {
  const factors = [];
  let score = 0;
  const sun = chart.planets.find(p => p.idx === 0);
  const moon = chart.planets.find(p => p.idx === 1);
  const mars = chart.planets.find(p => p.idx === 4);
  const jup = chart.planets.find(p => p.idx === 5);
  const sat = chart.planets.find(p => p.idx === 6);
  const node = chart.planets.find(p => p.idx === 11); // 龙头（北交）

  // 1. 月亮状态（BT-008 月增光为吉格；CE 月须强且免凶星之克）
  if (moon) {
    if (moon.voidOfCourse) { score -= 2; factors.push({ w: -2, f: '月亮空亡（无入相位）', d: '忌开始要事（通用择时忌）', s: 'Clavis 择时世俗卷' }); }
    const sr = moon.sunRelation;
    if (sr === 'cazimi') { score += 2; factors.push({ w: 2, f: '月亮 Cazimi（日心）', d: '光体极强', s: 'CE' }); }
    else if (sr === 'combust' || sr === 'underBeams') { score -= 2; factors.push({ w: -2, f: `月亮${sr === 'combust' ? '燃烧' : '日光束下'}`, d: '光体受损', s: 'CE' }); }
    const wax = dif(moon.lon, sun.lon) < 180; // 增光=盈月
    if (wax) { score += 1; factors.push({ w: 1, f: '月亮增光（盈月）', d: '吉格（BT-008）', s: 'BT-008' }); }
    else { score -= 1; factors.push({ w: -1, f: '月亮减光（亏月）', d: 'BT-008 吉格缺月增光', s: 'BT-008' }); }
    if (ANGLES.has(moon.house)) { score += 1; factors.push({ w: 1, f: `月亮落${moon.house}宫（角）`, d: '月须强（CE 择时选盘）', s: 'CE' }); }
    else if (moon.house === 12) { score -= 1; factors.push({ w: -1, f: '月亮落12宫', d: '月弱', s: 'CE' }); }
    // 月与凶星（火）合/刑/冲（BT-004 防月照火星）
    if (mars) {
      const dm = Math.abs(dif(moon.lon, mars.lon));
      if (dm < ORB || Math.abs(dm - 90) < ORB || Math.abs(dm - 180) < ORB) {
        score -= 1; factors.push({ w: -1, f: '月亮被火星照（合/刑/冲）', d: '防月照火星（BT-004）', s: 'BT-004' });
      }
    }
  }

  // 2. 凶星落宫（BT-004 al-Kindi：凶星不入 9/1/11；凶星角宫为凶）
  for (const [name, p] of [['土星', sat], ['火星', mars]]) {
    if (!p) continue;
    if (BAD_HOUSES.has(p.house)) { score -= 1; factors.push({ w: -1, f: `${name}落${p.house}宫`, d: '凶星不入9/1/11宫（BT-004）', s: 'BT-004' }); }
    if (ANGLES.has(p.house)) { score -= 1; factors.push({ w: -1, f: `${name}落${p.house}宫（角）`, d: '凶星角宫为凶（BT-003 吉星角宫尊贵之对）', s: 'BT-003' }); }
  }

  // 3. 吉星角宫尊贵（BT-003 al-Rijal：吉星在角宫有尊贵）
  for (const [name, p] of [['木星', jup], ['金星', chart.planets.find(x => x.idx === 3)]]) {
    if (!p) continue;
    if (ANGLES.has(p.house) && (p.dignityScore || 0) > 0) {
      score += 1; factors.push({ w: 1, f: `${name}落${p.house}宫且有本然尊贵（${p.dignityScore}）`, d: '吉星角宫尊贵（BT-003）', s: 'BT-003' });
    }
  }

  // 4. 光体照升点（BT-003 光体照升/4宫）
  const asc = chart.houses.angles.asc;
  for (const [name, p] of [['太阳', sun], ['月亮', moon]]) {
    if (!p) continue;
    for (const [deg, zh] of Object.entries(ASPECTS)) {
      const d = Math.abs(dif(p.lon, asc));
      if (Math.abs(d - Number(deg)) < ORB) {
        score += 1; factors.push({ w: 1, f: `${name}${zh}照上升（容许${ORB}°）`, d: '光体照升（BT-003）', s: 'BT-003' });
        break;
      }
    }
  }

  // 5. 升主状态（BT-002 角宫主东出北行；升主逆行/燃烧为凶）
  const domTbl = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../data/dignity_tables.json'), 'utf-8')).tables.domicile;
  const ascSignIdx = Math.floor(asc / 30);
  const lordIdx = domTbl[ascSignIdx];
  const lord = chart.planets.find(p => p.idx === lordIdx);
  if (lord && lordIdx != null) {
    if (lord.retrograde) { score -= 1; factors.push({ w: -1, f: `升主（${lord.zh}）逆行`, d: 'BT-003 无逆行为吉之对', s: 'BT-003' }); }
    const sr = lord.sunRelation;
    if (sr === 'combust' || sr === 'underBeams') { score -= 1; factors.push({ w: -1, f: `升主（${lord.zh}）${sr === 'combust' ? '燃烧' : '日光束下'}`, d: '升主受损', s: 'CE' }); }
    if (dif(lord.lon, sun.lon) > 0 && Math.abs(dif(lord.lon, sun.lon)) > 15) {
      score += 1; factors.push({ w: 1, f: `升主（${lord.zh}）东出北行`, d: '角宫主东出北行（BT-002）', s: 'BT-002' });
    }
  } else {
    factors.push({ w: 0, f: `升主（${ascSignIdx}座）无对应行星`, d: '现代点庙主不在七政，未计', s: '数据限制' });
  }

  // 6. 福点在角（BT-016 福点在角为吉）
  const fortune = lotOfFortune(chart);
  const fh = houseOfLon(fortune, chart);
  if (ANGLES.has(fh)) { score += 1; factors.push({ w: 1, f: `福点（${fortune.toFixed(1)}°）落${fh}宫（角）`, d: '福点在角（BT-016）', s: 'BT-016' }); }

  // 7. 龙头（北交）落 12 宫（BT-016 防龙头12宫）
  if (node && node.house === 12) { score -= 1; factors.push({ w: -1, f: '龙头（北交）落12宫', d: '防龙头12宫（BT-016）', s: 'BT-016' }); }

  // 8. 同盘接纳/互溶（第二版；BT-010 4宫主三/六合1宫主+接纳——当前为通用互溶口径，未限 4宫主×1宫主）
  const seven = chart.planets.filter(p => p.idx <= 6);
  const receptions = [];
  for (let i = 0; i < seven.length; i++) {
    for (let j = i + 1; j < seven.length; j++) {
      const rp = receptionOnChart(seven[i].lon, seven[i].idx, seven[j].lon, seven[j].idx);
      if (rp === '互溶') {
        score += 1;
        receptions.push(`${seven[i].zh}·${seven[j].zh} 互溶`);
        factors.push({ w: 1, f: `${seven[i].zh}·${seven[j].zh} 庙/擢互溶`, d: '互溶为吉（BT-010，通用口径未限宫）', s: 'BT-010' });
      }
    }
  }

  // 9. 月庙主照上升（第二版；BT-020：月庙主照上升）
  if (moon) {
    const moonSignIdx = Math.floor(moon.lon / 30);
    const moonLordIdx = DOMICILE[moonSignIdx];
    const moonLord = chart.planets.find(p => p.idx === moonLordIdx);
    if (moonLord) {
      for (const [deg, zh] of Object.entries({ 0: '合', 60: '六合', 120: '三合' })) {
        if (Math.abs(Math.abs(dif(moonLord.lon, asc)) - Number(deg)) < ORB) {
          score += 1; factors.push({ w: 1, f: `月庙主（${moonLord.zh}）${zh}照上升`, d: '月庙主照上升（BT-020）', s: 'BT-020' });
          break;
        }
      }
    } else {
      factors.push({ w: 0, f: `月落座（${moonSignIdx}座）庙主无对应行星`, d: '现代点庙主不在七政，未计', s: '数据限制' });
    }
  }

  // 10. 本命协同（第三版；CE-163 一切择时必须以本命为根基，否则虽天象美亦不益；LCA-501 择时须合本命）
  // 工程判据（近似、标注）：择时盘与本命盘七政相位比对——
  //   吉星（木金）间吉相（合/六/三）=协同 +1；凶星（土火）间凶相（刑/冲）=对抗 -1；
  //   择时凶星刑/冲/合本命 ASC/MC/日月 =对抗 -1；择时吉星吉相照本命 ASC =协同 +1；
  //   置业专项（CE-175）：择时土星与本命 4 宫主吉相且本命 4 宫主在择时盘落角 =+1
  let natalSynergy = null;
  if (natalChart) {
    natalSynergy = { co: 0, conflict: 0 };
    const naP = natalChart.planets.filter(p => p.idx <= 6);
    const elP = chart.planets.filter(p => p.idx <= 6);
    const EL = {};
    elP.forEach(p => { EL[p.idx] = p; });
    // 择时盘 × 本命盘 七政相位
    for (const e of elP) {
      for (const n of naP) {
        const d = Math.abs(dif(e.lon, n.lon));
        let aspDeg = null;
        for (const a of [0, 60, 90, 120, 180]) if (Math.abs(d - a) < ORB) { aspDeg = a; break; }
        if (aspDeg == null) continue;
        const eBen = BENEFIC.has(e.idx), eMal = MALEFIC.has(e.idx);
        const nBen = BENEFIC.has(n.idx), nMal = MALEFIC.has(n.idx);
        const zh = ASPECTS[aspDeg];
        // 吉星间吉相
        if (eBen && nBen && (aspDeg === 0 || aspDeg === 60 || aspDeg === 120)) {
          score += 1; natalSynergy.co++;
          factors.push({ w: 1, f: `本命协同：择时${EL[e.idx].zh}${zh}本命${n.zh}（吉星间吉相）`, d: '择时须合本命（CE-163/LCA-501）', s: 'CE-163' });
        }
        // 凶星间凶相
        if (eMal && nMal && (aspDeg === 90 || aspDeg === 180)) {
          score -= 1; natalSynergy.conflict++;
          factors.push({ w: -1, f: `本命协同：择时${EL[e.idx].zh}${zh}本命${n.zh}（凶星间凶相）`, d: '与本命相抗则事不顺（CE-165 原理）', s: 'CE-163/CE-165' });
        }
      }
    }
    // 择时凶星 刑/冲/合 本命 ASC/MC/日月
    const naSun = natalChart.planets[0], naMoon = natalChart.planets[1];
    const naAngles = { 上升: natalChart.houses.angles.asc, 中天: natalChart.houses.angles.mc };
    for (const e of elP) {
      if (!MALEFIC.has(e.idx)) continue;
      const hits = [];
      if (naSun) { const d = Math.abs(dif(e.lon, naSun.lon)); if (Math.abs(d - 0) < ORB || Math.abs(d - 90) < ORB || Math.abs(d - 180) < ORB) hits.push('本命日'); }
      if (naMoon) { const d = Math.abs(dif(e.lon, naMoon.lon)); if (Math.abs(d - 0) < ORB || Math.abs(d - 90) < ORB || Math.abs(d - 180) < ORB) hits.push('本命月'); }
      for (const [kn, kv] of Object.entries(naAngles)) { const d = Math.abs(dif(e.lon, kv)); if (Math.abs(d - 0) < ORB || Math.abs(d - 90) < ORB || Math.abs(d - 180) < ORB) hits.push('本命' + kn); }
      if (hits.length) {
        score -= 1; natalSynergy.conflict++;
        factors.push({ w: -1, f: `本命协同：择时凶星${EL[e.idx].zh}合/刑/冲${hits.join('、')}`, d: '凶星犯本命要点为对抗（CE-163）', s: 'CE-163' });
      }
    }
    // 择时吉星吉相照本命 ASC
    for (const e of elP) {
      if (!BENEFIC.has(e.idx)) continue;
      const d = Math.abs(dif(e.lon, natalChart.houses.angles.asc));
      if (Math.abs(d - 0) < ORB || Math.abs(d - 60) < ORB || Math.abs(d - 120) < ORB) {
        score += 1; natalSynergy.co++;
        factors.push({ w: 1, f: `本命协同：择时吉星${EL[e.idx].zh}照本命上升`, d: '吉星照本命升=协同（CE-163）', s: 'CE-163' });
      }
    }
    // 置业专项（CE-175）：择时土星与本命 4 宫主吉相 且 本命 4 宫主在择时盘落角
    const cusp4 = natalChart.houses.cuspsRaw[3];
    const n4LordIdx = parseInt(DOMICILE[Math.floor(cusp4 / 30)], 10);
    const n4Lord = natalChart.planets.find(p => p.idx === n4LordIdx);
    if (n4Lord && EL[6]) {
      const d = Math.abs(dif(EL[6].lon, n4Lord.lon));
      const good = Math.abs(d - 0) < ORB || Math.abs(d - 60) < ORB || Math.abs(d - 120) < ORB;
      const n4InAngle = ANGLES.has(houseOfLon(n4Lord.lon, chart));
      if (good && n4InAngle) {
        score += 1; natalSynergy.co++;
        factors.push({ w: 1, f: `本命协同（置业）：择时土星与命盘4宫主（${n4Lord.zh}）吉相且落角`, d: '固土星与本命4宫主，吉星照之（CE-175）', s: 'CE-175' });
      }
    }
  }

  // 11. 固定星（第三版；BT-011 上升置吉性固定星=建城恒久；BT-017 防凶性固定星于上升±2°，4宫同理）
  const fsChecks = fixedStarChecks(chart, { ascOrb: 2 });
  for (const c of fsChecks) {
    if (c.kind === '吉性' || c.kind === '混合') {
      score += 1;
      factors.push({ w: 1, f: `固定星：${c.star}合${c.scope}（吉性，距${c.orb}°）`, d: '上升置吉性固定星=事久（BT-011）', s: 'BT-011' });
    } else if (c.kind === '凶性') {
      score -= 1;
      factors.push({ w: -1, f: `固定星：${c.star}合${c.scope}（凶性，距${c.orb}°）`, d: '防凶性固定星于上升±2°（BT-017）', s: 'BT-017' });
    }
  }

  const unscored = [
    natalChart ? '' : '本命协同（CE-163 一切择时以本命为根基）未计——本模块调用时未传入本命盘（调用方可传 natalChart 启用）',
    '行星时辰（Clavis：行星时按宜忌行事）未计——需日出日落/日长接口（swe 无 riset）',
    'BT-010 原义限定（4宫主三/六合1宫主+接纳）未完整实现——当前为通用互溶口径',
    '本命协同为工程近似口径（吉/凶星间相位 + 凶星犯本命要点 + 置业专项），CE-163 为原则性条文，具体配对细则原文未详列',
    '固定星表为 BO-100 17世纪黄经+5.25°岁差工程校正；恒星身份未逐一对应现代星名；上升±2°/实体合相±1°为工程容许（BT-017 给 ±2°，BO-100 实体合相未给数值）',
  ].filter(Boolean);
  const verdict = score > 3 ? '宜（吉格较多）' : score >= 0 ? '平（中性）' : '忌（凶征较多）';
  return { score, verdict, factors, unscored, asc: asc.toFixed(2), natalSynergy, sources: ['Bonatti4宫择时 BT-001~055', 'Clavis 择时世俗卷（CE-163/165/175/177 + LCA-501）'] };
}

module.exports = { electionScore, receptionOnChart };
