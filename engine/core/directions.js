// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 主限向运（Primary Directions）
// 口径声明（实事求是）：采用 Rob Hand《Essays on Astrology》归纳的通用赤经投影简化法——
//   in mundo 方向弧：
//     到中天(MC)：arc = |RA(行星) − RA(MC)|
//     到升点(ASC)：arc = |OA(行星) − OA(ASC)|，OA = RA − AD（升点一侧）
//     到降点(DSC)：arc = |OA'(行星) − OA'(DSC)|，OA' = RA + AD
//   AD（赤经上升差）= asin(tan φ × tan δ)；φ=地理纬度，δ=赤纬
//   RA/Dec 由黄道坐标经 swe.cotrans（黄赤转换）得到
// 年化口径给出两档：
//   ptol  Ptolemaic 1°=1年（arc 度数即年数）
//   prec 现代岁差速率 50.29"/年 → 年 = arc° / (50.29/3600)
// 方向合相（应期）：行星 A 的方向推进至与本命行星 B 黄道位置重合——
//   arc = |OA(B) − OA(A)|（中天侧用 RA 差）——输出各对的方向弧与应期年。
// 未实现（如实）：in zodiaco 投影、under-the-pole 多纬度修正、月球等快速天体高阶项。
'use strict';
const { norm } = require('./ecliptic');

/** 黄道点(黄经 lon, 赤纬近似0) → 赤道坐标 {ra, dec}（度）
 *  黄赤交角取 J2000 均值 23.4392911°（1980-2040 年间真交角 23.44±0.01°，
 *  对方向弧 0.5° 精度影响 <0.01°，可接受；未做章动/交角周期修正——如实标注）。 */
function eqOfLon(swe, jd, lon) {
  const eps = 23.4392911;
  const [ra, dec] = swe.cotrans([norm(lon), 0, 1], eps);
  return { ra: norm(ra), dec };
}

/** 赤经上升差 AD = asin(tan φ × tan δ)（度） */
function ascDiff(latDeg, decDeg) {
  const t = Math.tan(latDeg * Math.PI / 180) * Math.tan(decDeg * Math.PI / 180);
  return Math.asin(Math.max(-1, Math.min(1, t))) * 180 / Math.PI;
}

/**
 * 计算本命盘主限向运方向表。
 * @param {object} chart 已算好的本命盘（computeChart 输出）
 * @param {object} swe SwissEph 实例
 * @param {number} jd 本命 JD(UT)（= chart.meta.chartJd）
 * @returns {{directions:Array, angles:object, method:string}}
 *   directions: [{from, fromIdx, to, toIdx, arc, yearP, yearPrec, type:'mc'|'asc'|'dsc', hit:'conj'}]
 */
function computeDirections(chart, swe, jd) {
  const lat = chart.meta.input.lat || 39.9042;
  const ang = chart.houses.angles;
  const ascLon = ang.asc, mcLon = ang.mc, dcLon = ang.dc;

  // 四角赤道坐标
  const ascEq = eqOfLon(swe, jd, ascLon);
  const mcEq = eqOfLon(swe, jd, mcLon);
  const dcEq = eqOfLon(swe, jd, dcLon);

  const adAsc = ascDiff(lat, ascEq.dec); // 升点赤经上升差
  const oaAsc = norm(ascEq.ra - adAsc);  // 升点斜升
  const adDc = ascDiff(lat, dcEq.dec);
  const oaDc = norm(dcEq.ra + adDc);     // 降点西落斜升

  const raMC = mcEq.ra;

  const dirs = [];
  const planets = chart.planets.filter(p => p.idx <= 9); // 传统七星 + 三王星
  for (const a of planets) {
    const aEq = eqOfLon(swe, jd, a.lon);
    const adA = ascDiff(lat, aEq.dec);
    const oaA = norm(aEq.ra - adA); // 升点侧
    const oaA2 = norm(aEq.ra + adA); // 降点侧

    // 到四角的方向弧（取最短弧）
    const arcMC = Math.min(difAbs(raMC, aEq.ra), 360 - difAbs(raMC, aEq.ra));
    const arcAsc = Math.min(difAbs(oaAsc, oaA), 360 - difAbs(oaAsc, oaA));
    const arcDsc = Math.min(difAbs(oaDc, oaA2), 360 - difAbs(oaDc, oaA2));
    dirs.push({
      from: a.zh, fromIdx: a.idx, arcMC, arcAsc, arcDsc,
      yearP_asc: arcAsc, yearP_mc: arcMC, yearP_dsc: arcDsc,
      yearPrec_asc: arcAsc / (50.29 / 3600), yearPrec_mc: arcMC / (50.29 / 3600), yearPrec_dsc: arcDsc / (50.29 / 3600),
    });

    // 方向合相：a 的方向推进至与本命行星 b 重合
    for (const b of planets) {
      if (a.idx === b.idx) continue;
      const bEq = eqOfLon(swe, jd, b.lon);
      const adB = ascDiff(lat, bEq.dec);
      const oaB = norm(bEq.ra - adB);
      const oaB2 = norm(bEq.ra + adB);
      // 同体系方向弧：升点侧 |OA(b)−OA(a)|，中天侧 |RA(b)−RA(a)|
      const arcAscB = Math.min(difAbs(oaB, oaA), 360 - difAbs(oaB, oaA));
      const arcMcB = Math.min(difAbs(bEq.ra, aEq.ra), 360 - difAbs(bEq.ra, aEq.ra));
      const arcDscB = Math.min(difAbs(oaB2, oaA2), 360 - difAbs(oaB2, oaA2));
      // 取最小弧的方向类型作为该对主方向
      const pairs = [
        { type: 'asc', arc: arcAscB }, { type: 'mc', arc: arcMcB }, { type: 'dsc', arc: arcDscB },
      ].sort((x, y) => x.arc - y.arc)[0];
      dirs.push({
        from: a.zh, fromIdx: a.idx, to: b.zh, toIdx: b.idx,
        arc: pairs.arc, type: pairs.type, hit: 'conj',
        yearP: pairs.arc, yearPrec: pairs.arc / (50.29 / 3600),
      });
    }
  }
  return {
    directions: dirs,
    angles: { raMC, oaAsc, oaDc, ascDec: ascEq.dec, mcDec: mcEq.dec },
    method: 'RA/OA 赤经投影（in mundo 简化）；年化：ptol=1°=1年，prec=50.29"/年',
  };
}

function difAbs(x, y) { return Math.abs(norm(x) - norm(y)); }

module.exports = { computeDirections, eqOfLon, ascDiff };
