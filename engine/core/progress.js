// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 推运/盘型计算（次限、三限、日返、太阳弧）
'use strict';
const { norm } = require('./ecliptic');

/** 次限推运：出生后 1 天 = 1 年 → jd = natalJd + years（天） */
function progressedJd(natalJd, years) {
  return natalJd + years;
}

/** 三限推运：1 天 = 1 月（近似 30 天/月） → jd = natalJd + years*365.25/12 */
function tertiaryJd(natalJd, years) {
  return natalJd + years * (365.25 / 12);
}

/**
 * 日返盘时刻：太阳黄经回到本命太阳黄经的下一次时刻。
 * 迭代法：粗估 natalJd+365.25 → 逐次校正（太阳日速 ≈0.98°/天）。
 * @param {object} swe SwissEph 实例
 * @param {number} natalJd 本命 JD(UT)
 * @param {number} natalSunLon 本命太阳黄经
 * @returns {number} 日返 JD(UT)
 */
async function solarReturnJd(swe, natalJd, natalSunLon) {
  const FLAG = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED;
  let jd = natalJd + 365.25;
  for (let i = 0; i < 8; i++) {
    const sun = swe.calc_ut(jd, swe.SE_SUN, FLAG);
    const diff = norm(sun[0]) - norm(natalSunLon);
    // 太阳顺行：jd 增大 → 黄经增大；已越过目标(diff>0)则须往回减 jd
    const speed = Math.abs(sun[3]) > 0.1 ? sun[3] : 0.9856;
    const jdShift = -diff / speed;
    jd += jdShift;
    if (Math.abs(jdShift) < 1e-5) break;
  }
  // 确保在 natal 之后
  while (jd <= natalJd) jd += 0.5;
  return jd;
}

/**
 * 月返盘时刻：月亮黄经回到本命月亮黄经的下一次时刻（约 27.32 天）。
 * 迭代法：粗估 natalJd+27.32 → 逐次校正（月亮日速 ≈13.176°/天，最快可达 15°/d，取实时速）。
 * @param {object} swe SwissEph 实例
 * @param {number} natalJd 本命 JD(UT)
 * @param {number} natalMoonLon 本命月亮黄经
 * @returns {number} 月返 JD(UT)
 */
async function lunarReturnJd(swe, natalJd, natalMoonLon) {
  const FLAG = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED;
  let jd = natalJd + 27.32;
  for (let i = 0; i < 10; i++) {
    const moon = swe.calc_ut(jd, swe.SE_MOON, FLAG);
    const diff = norm(moon[0]) - norm(natalMoonLon);
    const speed = Math.abs(moon[3]) > 1 ? moon[3] : 13.176;
    const jdShift = -diff / speed;
    jd += jdShift;
    if (Math.abs(jdShift) < 1e-5) break;
  }
  while (jd <= natalJd) jd += 0.5;
  return jd;
}

/**
 * 太阳弧：次限太阳黄经 − 本命太阳黄经（推运盘全部点加此偏移）。
 * @returns {Promise<number>} 偏移度数
 */
async function solarArc(swe, natalJd, years) {
  const FLAG = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED;
  const progJd = progressedJd(natalJd, years);
  const sunProg = swe.calc_ut(progJd, swe.SE_SUN, FLAG);
  const sunNatal = swe.calc_ut(natalJd, swe.SE_SUN, FLAG);
  return norm(sunProg[0]) - norm(sunNatal[0]);
}

module.exports = { progressedJd, tertiaryJd, solarReturnJd, lunarReturnJd, solarArc };
