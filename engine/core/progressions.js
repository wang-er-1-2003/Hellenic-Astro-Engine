// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - B 推运域：法达（Firdaria）年限与 小限（Annual Profections）
// 数据源：engine/data/firdaria.json（含版本分歧警示）/ engine/data/profections.json
'use strict';
const fs = require('fs');
const path = require('path');
const { norm, dif } = require('./ecliptic');

const F = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/firdaria.json'), 'utf-8'));
const P = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/profections.json'), 'utf-8'));
const BEN = [3, 5]; // 金星/木星
const MAL = [4, 6]; // 火星/土星
// PF-008 小限宫年度主题（Lilly 基础教程卷·十二宫总表——事项列）
const LILLY_HOUSE_TOPICS = {
  1: '生命/体貌/庶民', 2: '财富/动产/借贷/讼友', 3: '兄弟/邻里/短途/书信',
  4: '父/土地/房产/终局/城', 5: '子女/宴乐/戏剧/胎儿', 6: '仆役/小畜/疾病',
  7: '婚姻/配偶/公开敌/讼', 8: '死/遗嘱/嫁妆/忧惧', 9: '远航/宗教/学问/梦',
  10: '王侯/官职/母/事业', 11: '朋友/希望/国库', 12: '私敌/囚禁/忧苦/大畜',
};

/**
 * 法达：给定年龄 → 主周期 + 副周期（如有）。
 * @param {number} age 实足年龄
 * @param {boolean} isDay 昼生
 * @param {'hand'|'zoller'} version 夜生版本（昼生两版一致）；默认 hand（Rob Hand 流通版，Zoller 交点夹火土后为教学口径）
 */
function firdariaAtAge(age, isDay, version = 'hand') {
  const seq = isDay ? F.sequences.day : (version === 'zoller' ? F.sequences.night_zoller : F.sequences.night_hand);
  const normAge = ((age % F.cycle_length_years) + F.cycle_length_years) % F.cycle_length_years;
  // 主周期
  let acc = 0, main = null;
  for (const p of seq) {
    const len = F.years[p];
    if (normAge < acc + len) { main = { planet: p, len, start: acc, end: acc + len }; break; }
    acc += len;
  }
  let sub = [];
  let activeSub = null;
  // 副周期：主周期（南北交点除外）分 7 段，段序=主周期序（去交点，7 政），每段 len=主周期/7
  // 注：昼/夜、Hand/Zoller 两版去交点后副段序一致（=7 政序）；规则原文"副周期顺序与主周期顺序一致"
  if (main.planet !== 'NorthNode' && main.planet !== 'SouthNode') {
    const subSeq = seq.filter(x => x !== 'NorthNode' && x !== 'SouthNode');
    const subLen = main.len / 7;
    for (let i = 0; i < 7; i++) {
      const seg = { planet: subSeq[i], zh: ZH[subSeq[i]], len: subLen, start: main.start + i * subLen, end: main.start + (i + 1) * subLen };
      sub.push(seg);
      if (normAge >= seg.start && normAge < seg.end) {
        activeSub = { ...seg, remainingYears: seg.end - normAge };
      }
    }
  }
  return {
    age: normAge,
    main: { planet: main.planet, zh: ZH[main.planet], len: main.len, start: main.start, end: main.end },
    sub,
    activeSub,
    version: isDay ? 'day' : `night_${version}`,
    note: F.note_versions,
  };
}

const ZH = {
  Sun: '太阳', Moon: '月亮', Mercury: '水星', Venus: '金星', Mars: '火星',
  Jupiter: '木星', Saturn: '土星', NorthNode: '北交点', SouthNode: '南交点',
};

/**
 * 小限：年龄 → 小限宫 + 小限星座 + 年主星（Lord of Year）
 * profected_house = (age mod 12) + 1；从上升星座起数（上升本身=第1宫）
 * @param {number} age 最近一个生日时的年龄
 * @param {object} chart natal chart
 */
function profectionAtAge(age, chart) {
  const rem = ((age % 12) + 12) % 12;
  const house = rem + 1;
  const ascSignIdx = Math.floor(chart.houses.angles.asc / 30);
  const profSignIdx = (ascSignIdx + rem) % 12;
  // 年主星=该星座传统主星（古典庙主；domicile 表）
  const DT = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/dignity_tables.json'), 'utf-8')).tables;
  const domTbl = DT.domicile;
  const lordIdx = domTbl[profSignIdx];
  const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
  const PLANET_ZH = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星'];
  const PL_GLYPH = ['☉', '☽', '☿', '♀', '♂', '♃', '♄'];
  // PF-005 年主星本命状态：庙旺宫强=吉年；落陷失势=难年（lordIdx 在本命盘的落座尊贵）
  let lordState = null;
  if (lordIdx != null && chart.planets) {
    const np = chart.planets.find(p => p.idx === lordIdx);
    if (np) {
      const nSign = Math.floor(((np.lon % 360) + 360) % 360 / 30);
      const exalTbl = DT.exaltation, fallTbl = DT.fall, detrTbl = DT.detriment;
      if (domTbl[nSign] === lordIdx) lordState = { kind: '庙', good: true };
      else if (exalTbl && exalTbl[nSign] === lordIdx) lordState = { kind: '擢升', good: true };
      else if (fallTbl && fallTbl[nSign] === lordIdx) lordState = { kind: '落陷', good: false };
      else if (detrTbl && detrTbl[nSign] === lordIdx) lordState = { kind: '失势', good: false };
      else lordState = { kind: '游走', good: null };
    }
  }
  return {
    age,
    house,
    signIdx: profSignIdx,
    signZh: SIGNS[profSignIdx],
    lordIdx,
    lordZh: lordIdx != null ? PLANET_ZH[lordIdx] : null,
    lordGlyph: lordIdx != null ? PL_GLYPH[lordIdx] : null,
    topic: LILLY_HOUSE_TOPICS[house] || null,
    lordState: lordState ? { ...lordState, note: lordState.good ? '年主庙旺宫强=吉年（PF-005）' : (lordState.good === false ? '年主落陷失势=难年（PF-005）' : '年主游走无尊（PF-005 未判吉凶，如实）') } : null,
    formula: P.formula,
    usage: P.usage,
  };
}

/**
 * PF-006/007 行运触发：行运吉星吉照年主=吉事、凶星凶照=挑战（PF-006）；行运行星入小限宫=激活该宫主题（PF-007）
 * @param {object} transit 行运盘（computeChart 结果）
 * @param {object} prof profectionAtAge 输出
 * @param {object} natal 本命盘（用于宫位映射）
 * @returns {Array} 判据列表 [{w, f, d, s}]
 */
function transitChecks(transit, prof, natal) {
  const out = [];
  if (!transit || !transit.planets || prof.lordIdx == null) return out;
  const ORB = 8;
  const trine = (a, b) => Math.abs(dif(a, b)) <= ORB || Math.abs(Math.abs(dif(a, b)) - 120) <= ORB;
  const bad = (a, b) => Math.abs(dif(a, b)) <= ORB || Math.abs(Math.abs(dif(a, b)) - 90) <= ORB || Math.abs(Math.abs(dif(a, b)) - 180) <= ORB;
  const PL_ZH = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星', '天王星', '海王星', '冥王星'];
  for (const p of transit.planets) {
    if (BEN.includes(p.idx) && trine(p.lon, transit.planets[prof.lordIdx] ? transit.planets[prof.lordIdx].lon : NaN)) {
      out.push({ w: 1, f: `行运${PL_ZH[p.idx]}吉照年主（${PL_ZH[prof.lordIdx]}）`, d: '吉星行运年主=该年吉事应验（PF-006）', s: 'PF-006' });
    }
    if (MAL.includes(p.idx) && transit.planets[prof.lordIdx] && bad(p.lon, transit.planets[prof.lordIdx].lon)) {
      out.push({ w: -1, f: `行运${PL_ZH[p.idx]}凶照年主（${PL_ZH[prof.lordIdx]}）`, d: '凶星行运年主=该年挑战/阻碍（PF-006）', s: 'PF-006' });
    }
    // PF-007 行运行星入小限宫（用本命宫位 cusps 映射）
    if (natal && natal.houses && natal.houses.cuspsRaw) {
      const h = houseOfLon0(p.lon, natal.houses.cuspsRaw);
      if (h + 1 === prof.house) {
        out.push({ w: 0, f: `行运${PL_ZH[p.idx]}入小限${prof.house}宫`, d: `行运入小限宫=激活该宫年度主题（PF-007，主题见 PF-008 宫映射表）`, s: 'PF-007' });
      }
    }
  }
  return out;
}
function houseOfLon0(lon, cusps) {
  const n = norm(lon);
  for (let i = 0; i < 12; i++) {
    const a = cusps[i], b = cusps[(i + 1) % 12];
    const inR = a <= b ? (n >= a && n < b) : (n >= a || n < b);
    if (inR) return i;
  }
  return 0;
}

/**
 * 推运组合入口：给定目标年龄，返回 法达 + 小限。
 */
function computeProgression(chart, age, firdariaVersion = 'hand', transit) {
  const isDay = chart.meta.isDay === 'day';
  const prof = profectionAtAge(age, chart);
  return {
    firdaria: firdariaAtAge(age, isDay, firdariaVersion),
    profection: prof,
    transitHits: transit ? transitChecks(transit, prof, chart) : [],
    sources: ['firdaria.json（Zoller 教学口径/Hand 替代序，已固定 hand 版）', 'profections.json（Valens Anthology IV.11）', 'PF-005 年主星本命状态（dignity_tables.json 庙/擢升/落陷/失势）', 'PF-006/007 行运触发（行运盘=用户输入时间的天象盘）', 'PF-008 宫年度主题（Lilly 基础教程卷·十二宫总表）'],
  };
}

module.exports = { firdariaAtAge, profectionAtAge, computeProgression, transitChecks };
