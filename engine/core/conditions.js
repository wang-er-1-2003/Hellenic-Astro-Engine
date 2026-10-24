// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 行星条件判定（偶然状态：与太阳关系/东西出/顺逆行/空亡/得时/宫位质量）
// 数据源：planetary_conditions.json（教学简化阈值+警示）、Dorotheus 卷三 东西星判定表、
//        Bonatti 逆行注（不单独定罪）、Clavis/通用 空亡判据。判不了的明确不判。
'use strict';
const path = require('path');
const fs = require('fs');
const { dif } = require('./ecliptic');

const PC = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/planetary_conditions.json'), 'utf-8'));

// Dorotheus 卷三 东西星判定表：东出=行星在日之后且距日≥阈值
const ORIENTAL_THRESHOLD = { 0: 0, 1: 0, 2: 19, 3: 15, 4: 18, 5: 15, 6: 15 };
// 简化 combustion 阈值（planetary_conditions.json 教学值；真实古典按行星各异，版本警示见该文件）
const COMBUST_DEG = 8.5;
const BEAMS_DEG = 15;
const CAZIMI_DEG = 0.28;
// sect 分派（Valens 派别表简版：日/木=昼，月/金/火=夜，土/水随处境）
const SECT_DAY = new Set([0, 5]);
const SECT_NIGHT = new Set([1, 3, 4]);
const SECT_AMBIG = new Set([2, 6]);
// 宫位质量
const ANGULAR = new Set([1, 4, 7, 10]);
const CADENT = new Set([3, 6, 9, 12]);

/**
 * 计算 chart 中每颗行星的条件（仅传统七政 0-6 有意义；现代点只标日关系与宫位质量）。
 * @param {object} chart computeChart 输出
 * @returns {Array<{idx, zh, glyph, sunRelation, oriental, retrograde, stationary, voidOfCourse, sect, houseQuality, detail[]}>}
 */
function planetaryConditions(chart) {
  const byIdx = {};
  chart.planets.forEach(p => { byIdx[p.idx] = p; });
  const sun = byIdx[0];
  const isDay = chart.meta.isDay === 'day';
  const out = [];
  for (const p of chart.planets) {
    if (p.idx > 6) { out.push({ idx: p.idx, zh: p.zh, glyph: p.glyph, modern: true }); continue; }
    const detail = [];
    // 太阳自身不参与"与日关系/东西出"判定
    if (p.idx === 0) {
      out.push({ idx: 0, zh: '太阳', glyph: p.glyph, sunRelation: '—', oriental: '—',
        retrograde: false, stationary: Math.abs(p.speed) < 0.01,
        voidOfCourse: !chart.aspects.some(a => a.applying && (a.p1 === 0 || a.p2 === 0)),
        sect: isDay ? '得时' : '失时',
        houseQuality: ANGULAR.has(p.house) ? '角宫' : (CADENT.has(p.house) ? '果宫' : '续宫'),
        detail: [`太阳为盘主光源，不判日关系`, `sect ${isDay ? '得时' : '失时'}（${isDay ? '昼' : '夜'}生）`, `${p.house}宫`] });
      continue;
    }
    const dSun = Math.abs(dif(p.lon, sun.lon));

    // 与太阳关系
    let sunRelation;
    if (dSun < CAZIMI_DEG) { sunRelation = 'cazimi'; detail.push(`日核内(<0.28°) 极强`); }
    else if (dSun < COMBUST_DEG) { sunRelation = 'combust'; detail.push(`燃烧(距日${dSun.toFixed(1)}°<8.5°) 严重减损`); }
    else if (dSun < BEAMS_DEG) { sunRelation = 'underBeams'; detail.push(`日芒下(距日${dSun.toFixed(1)}°<15°) 削弱`); }
    else { sunRelation = 'free'; detail.push(`离日${dSun.toFixed(1)}° 自主`); }

    // 东西出（Dorotheus 东西星判定表：日之后且距日≥阈值=东；日之前=西）
    const eastOfSun = dif(p.lon, sun.lon) > 0;
    const thr = ORIENTAL_THRESHOLD[p.idx] != null ? ORIENTAL_THRESHOLD[p.idx] : 0;
    let oriental;
    if (eastOfSun && dSun >= thr) { oriental = '东'; detail.push(`东出(日之后${dSun.toFixed(1)}°，Dorotheus 阈值${thr}°) 偏热主动`); }
    else if (!eastOfSun && dSun >= thr) { oriental = '西'; detail.push(`西没(日之前) 偏冷内敛`); }
    else { oriental = '日芒间'; detail.push(`距日${dSun.toFixed(1)}°未达东出阈值，日芒间不计`); }

    // 顺逆行/驻留
    let retrograde = false, stationary = false;
    if (p.retrograde) { retrograde = true; detail.push(`逆行（偶然减损，不单独定罪，Bonatti 按整体权衡）`); }
    else if (Math.abs(p.speed) < 0.01) { stationary = true; detail.push(`驻留(速度≈${p.speed.toFixed(3)}°/d)`); }
    else detail.push(`顺行 ${p.speed.toFixed(2)}°/d`);

    // 空亡（无入相位）
    const voidOfCourse = !chart.aspects.some(a => a.applying && (a.p1 === p.idx || a.p2 === p.idx));
    if (voidOfCourse) detail.push(`空亡（无入相位，事难前行，Clavis/通用）`);

    // 得时/失时（sect）
    let sect;
    if (SECT_DAY.has(p.idx)) sect = isDay ? '得时' : '失时';
    else if (SECT_NIGHT.has(p.idx)) sect = isDay ? '失时' : '得时';
    else sect = '随处境'; // 土/水：派别随位置（Valens 派别表）
    detail.push(`sect ${sect}（${isDay ? '昼' : '夜'}生）`);

    // 宫位质量
    const houseQuality = ANGULAR.has(p.house) ? '角宫' : (CADENT.has(p.house) ? '果宫' : '续宫');
    detail.push(`${houseQuality}(${p.house}宫)`);

    out.push({ idx: p.idx, zh: p.zh, glyph: p.glyph, sunRelation, oriental, retrograde, stationary, voidOfCourse, sect, houseQuality, detail });
  }
  return out;
}

/**
 * 偶然尊贵计分（Accidental Dignities）。
 * 数据源：Clavis 基础教义卷 CE-042（偶然尊贵分值）/ CE-043（偶然弱分值）
 *      + Schoener 尊贵分数卷 SD-027/033（疾行/吉星夹限 +1/+5）、SD-061/067/047/048/049（慢行/凶星夹限/合/冲/趋合凶星弱分）
 * 实事求是约束：CE/SD 表均未给界定的项（5宫分值、刑凶星分值）一律不计分并在 notes 注明，不自行补造阈值；
 * 离焦脱离阈值已另在 aspects.detachedPlanets 实现（映射E#3 半径和）；"离焦+5"经核查系 CE-042 Free from combustion 误译，已按原文实现免焦伤。
 * 工程默认并明示：夹限容许度 15°、均速=天文平均日行、龙头容许度 3°。
 * @returns {{score:number, notes:string[]}}
 */
const HOUSE_PLUS = { 1: 5, 10: 5, 7: 4, 4: 4, 11: 4, 2: 3, 9: 2, 3: 1 }; // CE-042
const HOUSE_MINUS = { 8: 4, 6: 4, 12: 5 }; // CE-043
// Clavis 东西分派：木/土/火 东出+2 西入-2；金/水/月 西入+2 东出-2（CE-042/043，与 Dorotheus 派别不同，如实按表）
const ORIENT_PLUS = new Set([4, 5, 6]); // 火木土：东出 +2
const OCCIDENT_PLUS = new Set([1, 2, 3]); // 月水金：西入 +2
const NODE_ORB = 3; // 合相交容许度：CE 未给，工程默认 3°（标注）

function accidentalScore(p, chart) {
  const notes = [];
  let score = 0;
  const sun = chart.planets.find(x => x.idx === 0);
  if (!sun) return { score: 0, notes: ['盘无太阳，未计'] };
  const sunLon = sun.lon;

  // 宫位
  if (HOUSE_PLUS[p.house]) { score += HOUSE_PLUS[p.house]; notes.push(`宫位 ${p.house}宫 +${HOUSE_PLUS[p.house]}（CE-042）`); }
  else if (HOUSE_MINUS[p.house]) { score -= HOUSE_MINUS[p.house]; notes.push(`宫位 ${p.house}宫 -${HOUSE_MINUS[p.house]}（CE-043）`); }
  else if (p.house === 5) { notes.push('宫位 5宫 CE 表缺分值，未计'); }

  // 顺逆/驻留
  if (!p.retrograde && Math.abs(p.speed) >= 0.01) { score += 4; notes.push('顺行 +4（CE-042）'); }
  else if (p.retrograde) { score -= 1; notes.push('逆行 -1（CE-043）'); }
  else { notes.push('驻留 CE 表无分值条目，未计'); }

  // 东出/西入（Clavis 分派，按黄经前后：东=日之后）
  if (p.idx >= 1 && p.idx <= 6) {
    const east = dif(p.lon, sunLon) > 0;
    if (east && ORIENT_PLUS.has(p.idx)) { score += 2; notes.push(`东出(日之后) +2（CE-042 火木土东出）`); }
    else if (east && !ORIENT_PLUS.has(p.idx)) { score -= 2; notes.push(`东出(日之后) -2（CE-043 月水金东出为弱）`); }
    else if (!east && OCCIDENT_PLUS.has(p.idx)) { score += 2; notes.push(`西入(日之前) +2（CE-042 月水金西入）`); }
    else if (!east && !OCCIDENT_PLUS.has(p.idx)) { score -= 2; notes.push(`西入(日之前) -2（CE-043 火木土西入为弱）`); }
  }

  // 与太阳关系（CE-042/043：Cazimi +5 / 焦伤 -5 / 日光束下 -4 / 免焦伤 Free from combustion +5）
  // 注：CE-042 翻译列"离焦=5"系误译——原文 Free from combustion（免于焦伤），阈值=日光束外（映射E#9 焦伤 8°30′、BO-053 12°-15° 脱离日辉）
  if (p.idx !== 0) {
    const dSun = Math.abs(dif(p.lon, sunLon));
    if (dSun < CAZIMI_DEG) { score += 5; notes.push('Cazimi 日心 +5（CE-042）'); }
    else if (dSun < COMBUST_DEG) { score -= 5; notes.push(`焦伤(距日${dSun.toFixed(1)}°) -5（CE-043）`); }
    else if (dSun < BEAMS_DEG) { score -= 4; notes.push(`日光束下(距日${dSun.toFixed(1)}°) -4（CE-043）`); }
    else { score += 5; notes.push(`免焦伤 Free from combustion +5（CE-042；距日${dSun.toFixed(1)}° 日光束外）`); }
  }

  // 龙头/龙尾（北交 idx11 真月交点；南交=北交+180；容许度 3° 工程默认）
  const node = chart.planets.find(x => x.idx === 11);
  if (node && p.idx >= 1 && p.idx <= 6) {
    const dHead = Math.abs(dif(p.lon, node.lon));
    const dTail = Math.abs(dif(p.lon, (node.lon + 180) % 360));
    if (dHead < NODE_ORB) { score += 4; notes.push(`合龙头(北交) +4（CE-042，容许度${NODE_ORB}° 工程默认）`); }
    else if (dTail < NODE_ORB) { score -= 4; notes.push(`合龙尾(南交) -4（CE-043，容许度${NODE_ORB}° 工程默认）`); }
  }

  // 月减光：月亮与太阳黄经差绝对值>180°（亏月） -2（CE-043；判定简化，标注）
  if (p.idx === 1) {
    if (Math.abs(dif(p.lon, sunLon)) > 180) { score -= 2; notes.push('月减光(亏月) -2（CE-043，判定=月日黄经差>180°）'); }
  }

  // === 第二版：Schoener 尊贵分数卷（SD 表）补齐 ===
  // 数据源：规则库-Schoener尊贵分数.xlsx（SD-027 疾行+1 / SD-061 慢行-1 / SD-033 吉星夹限+5 /
  //        SD-067 凶星夹限-5 / SD-047 合凶星-5 / SD-048 冲凶星-4 / SD-049 趋合凶星-3）
  // 实事求是：均速表=天文平均日行（°/day，标注为星历均值）；夹限容许度 SD 表未给，工程默认 15° 已标注；
  // 刑凶星 SD 表无分值条目，不判。
  const MEAN_SPEED = { 1: 13.176, 2: 1.383, 3: 1.200, 4: 0.524, 5: 0.083, 6: 0.034 }; // 平均日行°/d（天文均值）
  const RING_ORB = 15; // 夹限容许度（工程默认，SD 表未给）
  const BENEFIC_RING = new Set([3, 5]); // SD 表吉星=木/金（SD-013 同表口径）
  const MALEFIC_RING = new Set([4, 6]); // SD 表凶星=土/火（SD-042 同表口径）

  // 1. 疾行/慢行（SD-027 +1 / SD-061 -1）：日行快于/慢于均速（太阳不判，太阳无均速概念）
  if (p.idx >= 1 && p.idx <= 6 && Number.isFinite(p.speed)) {
    const mean = MEAN_SPEED[p.idx];
    if (mean != null && !p.retrograde) {
      if (p.speed > mean) { score += 1; notes.push(`疾行 ${p.speed.toFixed(2)}°/d > 均速 ${mean}（SD-027）+1`); }
      else if (p.speed < mean) { score -= 1; notes.push(`慢行 ${p.speed.toFixed(2)}°/d < 均速 ${mean}（SD-061）-1`); }
    }
  }

  // 2. 夹限（SD-033 两吉星夹 +5 / SD-067 两凶星夹 -5）：行星黄经两侧各有吉/凶星夹持
  if (p.idx <= 6) {
    const around = { ben: [], mal: [] };
    for (const q of chart.planets) {
      if (q.idx === p.idx || q.idx > 6 || q.idx === 0 && p.idx === 0) continue;
      const d = dif(q.lon, p.lon);
      if (Math.abs(d) <= RING_ORB && Math.abs(d) >= 0.5) {
        if (BENEFIC_RING.has(q.idx)) around.ben.push({ zh: q.zh, d });
        else if (MALEFIC_RING.has(q.idx)) around.mal.push({ zh: q.zh, d });
      }
    }
    const benBoth = around.ben.some(x => x.d < 0) && around.ben.some(x => x.d > 0);
    const malBoth = around.mal.some(x => x.d < 0) && around.mal.some(x => x.d > 0);
    if (benBoth) { score += 5; notes.push(`夹于两吉星（${around.ben.map(x => x.zh).join('、')}）之间（SD-033 夹限）+5，容许度${RING_ORB}° 工程默认`); }
    else if (malBoth) { score -= 5; notes.push(`夹于两凶星（${around.mal.map(x => x.zh).join('、')}）之间（SD-067 夹限）-5，容许度${RING_ORB}° 工程默认`); }
  }

  // 3. 合/冲/趋合凶星（SD-047 合 -5 / SD-048 冲 -4 / SD-049 趋合 -3）：行星与土/火的相位
  if (p.idx <= 6) {
    for (const asp of chart.aspects || []) {
      if (asp.p1 !== p.idx && asp.p2 !== p.idx) continue;
      const other = asp.p1 === p.idx ? asp.p2 : asp.p1;
      if (!MALEFIC_RING.has(other)) continue;
      const deg = asp.aspect;
      if (deg === 0) { score -= asp.applying ? 3 : 5; notes.push(`${p.zh}${asp.applying ? '趋合' : '合'}凶星 ${asp.orbUsed.toFixed(1)}°（SD-0${asp.applying ? '49' : '47'}）${asp.applying ? '-3' : '-5'}`); }
      else if (deg === 180) { score -= 4; notes.push(`${p.zh}冲凶星 ${asp.orbUsed.toFixed(1)}°（SD-048）-4`); }
    }
  }

  notes.push('刑凶星 SD 表无分值条目，未判（实事求是）');
  return { score, notes };
}

module.exports = { planetaryConditions, accidentalScore };
