// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 固定星判据（Fixed Stars）
// 数据源：engine/data/fixed_stars.json（规则库 BO-100 助成恒星表，17世纪黄经；BO-132 Algol）
// 实事求是：恒星身份未逐一对应现代星名（原文仅给度数+性质）；现代黄经=17世纪+5.25°岁差工程校正；
//   本模块只做"表内度数直用 + 明确标注"，不做现代恒星身份匹配
'use strict';
const fs = require('fs');
const path = require('path');

const PRE = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/fixed_stars.json'), 'utf-8'));
const RECORDS = PRE.records;
// 现代黄经 = 17世纪黄经 + 岁差
RECORDS.forEach(r => { r.lonModern = ((r.sign * 30 + r.deg17 + 5.25) % 360 + 360) % 360; });

function dif(a, b) {
  let d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
}

function normLon(x) { return ((x % 360) + 360) % 360; }

/** 与某黄经距离 orb° 内的固定星条目（现代黄经比较） */
function nearStars(lon, orbDeg) {
  const out = [];
  for (const r of RECORDS) {
    if (Math.abs(dif(lon, r.lonModern)) <= orbDeg) out.push(r);
  }
  return out;
}

/** 吉性：含 V 且不含 T（VT 混合按吉凶皆涉，吉性计分仍给但标注混合） */
function isBenefic(r) { return r.nature.includes('V'); }
/** 凶性：含 T */
function isMalefic(r) { return r.nature.includes('T'); }

/**
 * 固定星判据总入口：
 * - ascCheck: 上升（及 4 宫头，BT-017 同法）±2° 内吉/凶性恒星
 * - significatorCheck: 指定行星与固定星实体合相（±1° 工程容许，BO-100 原文"实体合相"）
 * 返回 [{kind:'吉性'|'凶性'|'混合', star, planet?, scope, orb}]
 */
function fixedStarChecks(chart, opts = {}) {
  const out = [];
  const asc = chart.houses.angles.asc;
  const cusp4 = chart.houses.cuspsRaw[3];
  const ascOrb = opts.ascOrb || 2; // BT-017：防凶性固定星于上升度±2°（吉性同法对称工程取）
  const conOrb = opts.conOrb || 1; // BO-100：实体合相（工程容许，原文未给）

  // 上升 ±2°（择时 BT-011 置吉性恒星于上升 / BT-017 防凶性于上升±2°）
  for (const s of nearStars(asc, ascOrb)) {
    const ben = isBenefic(s), mal = isMalefic(s);
    out.push({ kind: ben && mal ? '混合' : (mal ? '凶性' : '吉性'), star: s.zh, scope: '上升', orb: Math.abs(dif(asc, s.lonModern)).toFixed(1), deg17: s.deg17, lonModern: s.lonModern, source: 'BT-011/BT-017' });
  }
  // 4 宫头 ±2°（BT-017：4宫同理）
  for (const s of nearStars(cusp4, ascOrb)) {
    const ben = isBenefic(s), mal = isMalefic(s);
    out.push({ kind: ben && mal ? '混合' : (mal ? '凶性' : '吉性'), star: s.zh, scope: '4宫头', orb: Math.abs(dif(cusp4, s.lonModern)).toFixed(1), deg17: s.deg17, lonModern: s.lonModern, source: 'BT-017' });
  }
  // 征象星实体合相（BO-100：凡征象星与其中任一实体合相——断幸福与善终）
  const sigs = opts.significators || [];
  for (const p of sigs) {
    if (!p || !p.planets) continue;
    for (const pl of p.planets) {
      for (const s of nearStars(pl.lon, conOrb)) {
        const ben = isBenefic(s), mal = isMalefic(s);
        out.push({ kind: ben && mal ? '混合' : (mal ? '凶性' : '吉性'), star: s.zh, planet: pl.zh, scope: p.scope, orb: Math.abs(dif(pl.lon, s.lonModern)).toFixed(1), deg17: s.deg17, lonModern: s.lonModern, source: 'BO-100' });
      }
    }
  }
  return out;
}

module.exports = { fixedStarChecks, nearStars, isBenefic, isMalefic, RECORDS };
