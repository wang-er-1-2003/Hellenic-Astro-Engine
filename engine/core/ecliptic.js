// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 度数/黄道工具（黄经 → 星座°′、宫位区间、黄道差）
'use strict';
const { SIGNS } = require('./constants');

/** 黄经归一化到 [0,360) */
function norm(deg) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** 最短有符号黄道差 a→b（结果 ∈ [-180,180]） */
function dif(a, b) {
  let d = (b - a) % 360;
  if (d < -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

/** 黄经 → {sign, signDeg, degMin} 描述 */
function formatEcliptic(deg) {
  const d = norm(deg);
  let signIdx = Math.floor(d / 30);
  let signDeg = d - signIdx * 30;
  let degInt = Math.floor(signDeg);
  let min = Math.round((signDeg - degInt) * 60);
  if (min === 60) { degInt += 1; min = 0; }
  if (degInt === 30) { degInt = 0; signIdx = (signIdx + 1) % 12; }
  return {
    signIdx,
    signEn: SIGNS[signIdx].en,
    signZh: SIGNS[signIdx].zh,
    signGlyph: SIGNS[signIdx].glyph,
    signDeg: degInt + min / 60,
    text: `${SIGNS[signIdx].zh} ${degInt}°${min === 0 ? '' : min + '′'}`,
    raw: d,
  };
}

/**
 * 行星落宫：黄经与宫尖数组比较。
 * 约定：cusps 为 0-based 数组、cusps[0]=1 宫头（chart.js 由 swe_houses 的 cusps[1..12] 复制而来）。
 * 修复记录（第四十六段）：此前用 1-based 索引读 0-based 数组导致全部行星落宫错位 1 宫（如太阳真实 10 宫显示 9）；
 * 现改为 0-based 区间 [cusps[i], cusps[i+1])，与 life.js houseOfLon 语义一致。
 */
function houseOf(lon, cusps) {
  const d = norm(lon);
  for (let i = 0; i < 12; i++) {
    const a = norm(cusps[i]);
    const b = norm(cusps[(i + 1) % 12]);
    if (a < b) {
      if (d >= a && d < b) return i + 1;
    } else {
      if (d >= a || d < b) return i + 1;
    }
  }
  return 1;
}

module.exports = { norm, dif, formatEcliptic, houseOf };
