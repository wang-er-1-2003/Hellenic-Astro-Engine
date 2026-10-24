// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - E 合盘域（Synastry）：双盘比较
// 数据源：Tetrabiblos Book IV 财官婚旅卷（两盘光体相位→婚持久/离异 等判据）+ 通用相位吉凶
// 第二版新增：接纳/互溶（庙/擢互认）+ 组合盘中点（composite midpoint）
// 实事求是：相位吉凶按行星性质+相位类型判读；复合盘（时间中点盘）未计（需时间中点重排盘）。
'use strict';
const fs = require('fs');
const path = require('path');
const { houseOfLon } = require('./life');

const ORB = 8; // 相位容许度（工程默认，古典未统一）
const ANGLES = { 0: '合', 60: '六合', 90: '刑', 120: '三合', 180: '冲' };
const ASPECT_BONUS = { 60: 1, 120: 1, 90: -1, 180: -1, 0: 0 }; // 吉凶基础分（合相按行星性质另判）
const BENEFIC = new Set([3, 5]); // 金木
const MALEFIC = new Set([4, 6]); // 火土
const LIGHTS = new Set([0, 1]); // 日月

// 尊贵表（庙/擢，用于接纳互溶）：domicile[signIdx]=庙主行星 idx；exaltation[signIdx]=擢行星 idx
const DIGN = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/dignity_tables.json'), 'utf-8')).tables;
const DOMICILE = DIGN.domicile;
const EXALT = DIGN.exaltation.map(e => (e ? e.planet : null));

function dif(a, b) {
  let d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
}

function aspectBetween(lonA, lonB) {
  const d = Math.abs(dif(lonA, lonB));
  for (const [deg, zh] of Object.entries(ANGLES)) {
    if (Math.abs(d - Number(deg)) < ORB) return { aspect: zh, deg: Number(deg), orb: Math.abs(d - Number(deg)) };
  }
  return null;
}

/** 组合盘中点（7 政黄经中点；处理 180° 环绕） */
function compositeMidpoints(chartA, chartB) {
  const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
  const PL_ZH = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星'];
  const mids = [];
  for (let i = 0; i <= 6; i++) {
    const a = chartA.planets[i], b = chartB.planets[i];
    if (!a || !b) continue;
    const raw = (a.lon + b.lon) / 2;
    // 环绕修正：若两点差 >180°，中点应跨 0° 界
    const d = dif(a.lon, b.lon);
    const mid = d > 0 ? (a.lon + d / 2 + 360) % 360 : raw;
    mids.push({ idx: i, zh: PL_ZH[i], lon: mid, sign: SIGNS[Math.floor(mid / 30)] });
  }
  return mids;
}

/** 接纳/互溶：行星 X 落行星 Y 的庙或擢座 */
function receptionPair(lonX, idxX, lonY, idxY) {
  const sx = Math.floor(lonX / 30), sy = Math.floor(lonY / 30);
  const xInYDom = DOMICILE[sy] === idxX, xInYEx = EXALT[sy] === idxX;
  const yInXDom = DOMICILE[sx] === idxY, yInXEx = EXALT[sx] === idxY;
  const xRecep = xInYDom || xInYEx, yRecep = yInXDom || yInXEx;
  if (xRecep && yRecep) return { kind: '互溶', detail: (xInYDom ? '庙' : '擢') + '/' + (yInXDom ? '庙' : '擢') };
  if (xRecep) return { kind: '接纳（X 被 Y 接纳）', detail: xInYDom ? 'X落Y庙' : 'X落Y擢' };
  if (yRecep) return { kind: '接纳（Y 被 X 接纳）', detail: yInXDom ? 'Y落X庙' : 'Y落X擢' };
  return null;
}

const PL_ZH = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星', '天王星', '海王星', '冥王星'];
const PL_GLYPH = ['☉', '☽', '☿', '♀', '♂', '♃', '♄', '♅', '♆', '♇'];

/** 双盘比较（Synastry） */
function synastryCompare(chartA, chartB) {
  const factors = [];
  const mutual = []; // 互落摘要
  const pa = chartA.planets.filter(p => p.idx <= 6); // 七政为主（古典口径）
  const pb = chartB.planets.filter(p => p.idx <= 6);
  const cuspsA = chartA.houses.cuspsRaw;
  const cuspsB = chartB.houses.cuspsRaw;

  // 1. 双盘行星相位（A×B）
  for (const a of pa) {
    for (const b of pb) {
      const asp = aspectBetween(a.lon, b.lon);
      if (!asp) continue;
      // 吉凶：六合三合=吉；刑冲=凶；合相按行星性质（吉星合=吉、凶星合=凶、日月中性）
      let w = ASPECT_BONUS[asp.deg];
      let tag;
      if (asp.deg === 0) {
        const bothBen = (BENEFIC.has(a.idx) && !MALEFIC.has(b.idx)) || (BENEFIC.has(b.idx) && !MALEFIC.has(a.idx));
        const bothMal = (MALEFIC.has(a.idx) && !BENEFIC.has(b.idx)) || (MALEFIC.has(b.idx) && !BENEFIC.has(a.idx));
        w = bothBen ? 1 : (bothMal ? -1 : 0);
        tag = `合相（${bothBen ? '吉星' : bothMal ? '凶星' : '中性'}）`;
      } else {
        tag = asp.aspect;
      }
      const isLightPair = LIGHTS.has(a.idx) && LIGHTS.has(b.idx);
      factors.push({ w, a: `${PL_GLYPH[a.idx]}${PL_ZH[a.idx]}`, b: `${PL_GLYPH[b.idx]}${PL_ZH[b.idx]}`, aspect: asp.aspect, orb: asp.orb, tag, lightPair: isLightPair });
    }
  }

  // 2. 双盘光体相位（Tetrabiblos IV：两盘光体相位→婚持久/离异）
  const lightPairs = factors.filter(f => f.lightPair);
  const lightJudgment = lightPairs.length
    ? lightPairs.map(f => `${f.a} ${f.aspect} ${f.b}（${f.tag}）`).join('；')
    : '无日月跨盘相位';
  // 光体相位吉凶汇总
  const lightScore = lightPairs.reduce((t, f) => t + f.w, 0);

  // 3. 互落：B 盘行星落 A 盘宫位 + A 落 B
  const bInA = pb.map(b => ({ who: `B${PL_ZH[b.idx]}`, house: houseOfLon(b.lon, chartA) }));
  const aInB = pa.map(a => ({ who: `A${PL_ZH[a.idx]}`, house: houseOfLon(a.lon, chartB) }));
  // 焦点宫（每宫落入对方行星数）
  const focusA = {};
  for (const x of bInA) focusA[x.house] = (focusA[x.house] || 0) + 1;
  const focusB = {};
  for (const x of aInB) focusB[x.house] = (focusB[x.house] || 0) + 1;
  const topA = Object.entries(focusA).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const topB = Object.entries(focusB).sort((x, y) => y[1] - x[1]).slice(0, 3);
  mutual.push({ dir: 'B→A（B 行星落 A 宫）', focus: topA });
  mutual.push({ dir: 'A→B（A 行星落 B 宫）', focus: topB });

  // 4. 升点互照：A 升点 vs B 行星、B 升点 vs A 行星
  const ascA = chartA.houses.angles.asc, ascB = chartB.houses.angles.asc;
  const ascHits = [];
  for (const b of pb) {
    const asp = aspectBetween(ascA, b.lon);
    if (asp) ascHits.push({ who: `B${PL_ZH[b.idx]}`, aspect: asp.aspect, orb: asp.orb });
  }
  for (const a of pa) {
    const asp = aspectBetween(ascB, a.lon);
    if (asp) ascHits.push({ who: `A${PL_ZH[a.idx]}`, aspect: asp.aspect, orb: asp.orb });
  }

  let score = factors.reduce((t, f) => t + f.w, 0);
  const verdict = score > 5 ? '和谐（吉相占优）' : score >= 0 ? '中性' : '紧张（凶相占优）';

  // 5. 接纳/互溶（第二版新增）：A×B 七政庙/擢互认
  const receptions = [];
  for (const a of pa) {
    for (const b of pb) {
      if (a.idx === b.idx) continue; // 同星互认无意义（同星必同座）
      const rp = receptionPair(a.lon, a.idx, b.lon, b.idx);
      if (rp) {
        receptions.push({ a: `${PL_GLYPH[a.idx]}${PL_ZH[a.idx]}`, b: `${PL_GLYPH[b.idx]}${PL_ZH[b.idx]}`, kind: rp.kind, detail: rp.detail });
        if (rp.kind === '互溶') score += 1; // 互溶为吉（行星互予力量）
      }
    }
  }

  // 6. 组合盘中点（第二版新增）：7 政黄经中点 + 中点内相位
  const mids = compositeMidpoints(chartA, chartB);
  const midAspects = [];
  for (let i = 0; i < mids.length; i++) {
    for (let j = i + 1; j < mids.length; j++) {
      const asp = aspectBetween(mids[i].lon, mids[j].lon);
      if (asp) midAspects.push({ a: mids[i].zh, b: mids[j].zh, aspect: asp.aspect, orb: asp.orb });
    }
  }

  const unscored = [
    '复合盘/关系盘（双出生时间中点重排全盘，非仅黄经中点）未计——需时间中点盘',
    '婚卷专项（婚点/婚时/婚数/伴侣质/婚龄差/亲族婚）已实现于 marriage.js（本模块仅光体相位判持久/离异）',
    '组合盘宫位未重算（中点仅黄经，宫位沿用 A/B 盘对照）',
  ];
  return {
    score, verdict,
    lightJudgment,
    lightScore,
    aspects: factors,
    mutual,
    ascHits,
    receptions,
    composite: { midpoints: mids, aspects: midAspects },
    unscored,
    sources: ['Tetrabiblos Book IV 财官婚旅卷', '通用相位吉凶（工程口径）', 'dignity_tables.json（庙/擢互认）'],
  };
}

module.exports = { synastryCompare, aspectBetween, compositeMidpoints, receptionPair };
