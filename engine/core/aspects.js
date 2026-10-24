// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 相位计算（黄经差 → 主相位/容许度/出入相位）
'use strict';
const { ASPECTS, MINOR_ASPECTS, LILLY_PLANET_ORB } = require('./constants');
const { dif, norm } = require('./ecliptic');

/**
 * 计算两行星相位。
 * @param {number} lonA 行星A黄经
 * @param {number} lonB 行星B黄经
 * @param {number} speedA 行星A日速（°）
 * @param {number} speedB 行星B日速
 * @param {string} orbSet 'modern' | 'lilly'
 * @param {boolean} includeMinor 是否含次要相位
 * @param {number} [idxA] 行星A索引（lilly 套用）
 * @param {number} [idxB] 行星B索引（lilly 套用）
 * @returns {object|null} {aspect, orb, applying, exactDiff}
 */
function aspectBetween(lonA, lonB, speedA, speedB, orbSet = 'modern', includeMinor = false, idxA, idxB) {
  const delta = Math.abs(dif(lonA, lonB)); // 0..180
  const list = includeMinor ? ASPECTS.concat(MINOR_ASPECTS) : ASPECTS;
  let best = null;
  for (const asp of list) {
    const orb = orbSet === 'lilly'
      ? lillyOrb(idxA == null ? 0 : idxA, idxB == null ? 1 : idxB)
      : asp.modern;
    const diff = Math.abs(delta - asp.angle);
    if (diff <= orb) {
      if (!best || diff < best.diff) {
        best = { aspect: asp, diff, orb };
      }
    }
  }
  if (!best) return null;
  const deltaSigned = dif(lonA, lonB);
  const relSpeed = speedB - speedA; // B 相对 A 的移动（黄经差变化率）
  const applying = (best.aspect.angle - delta) * relSpeed > 0;
  return {
    aspect: best.aspect,
    orb: best.orb,
    orbUsed: best.diff,
    applying,
    separating: !applying,
    exactDiff: best.diff,
  };
}

/**
 * 按行星索引取 Lilly 容许度均值（Lilly 有效度表）。
 */
function lillyOrb(idxA, idxB) {
  return (LILLY_PLANET_ORB[idxA] + LILLY_PLANET_ORB[idxB]) / 2;
}

/**
 * 星盘相位表生成：对行星位置数组两两计算。
 * @param {Array} positions [{idx, lon, speed}, ...]
 * @param {string} orbSet
 * @returns {Array} 相位列表（含行星名/相位/容许度/出入）
 */
function computeAspects(positions, orbSet = 'modern', includeMinor = false) {
  const out = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const A = positions[i], B = positions[j];
      const delta = Math.abs(dif(A.lon, B.lon));
      const list = includeMinor ? ASPECTS.concat(MINOR_ASPECTS) : ASPECTS;
      for (const asp of list) {
        const diff = Math.abs(delta - asp.angle);
        let orb;
        if (orbSet === 'lilly') orb = lillyOrb(A.idx, B.idx);
        else orb = asp.modern;
        if (diff <= orb) {
          const relSpeed = B.speed - A.speed;
          const applying = (asp.angle - delta) * relSpeed > 0;
          out.push({
            p1: A.idx, p2: B.idx,
            aspect: asp.en, aspectZh: asp.zh, glyph: asp.glyph,
            angle: asp.angle, orbUsed: diff, orb,
            applying, separating: !applying,
          });
          break;
        }
      }
    }
  }
  return out;
}

/**
 * 行星脱离判定（映射E-术语27项#3 + CE-014）：行星与所有他星的所有主相位距离——
 * 应用侧超标准容许、且分离侧超"双方轨道半径和"（映射E#3：分离后仍半径和内=platic 相连）→ 脱离。
 * 工程口径：半径和≈标准容许×2（lilly 为均值两倍；modern 为每相位固定值近似，标注）。
 * @param {Array} positions [{idx, lon, speed}, ...]
 * @param {string} orbSet
 * @param {boolean} includeMinor
 * @returns {Array} [{idx, detached, note}]
 */
function detachedPlanets(positions, orbSet = 'modern', includeMinor = false) {
  const list = includeMinor ? ASPECTS.concat(MINOR_ASPECTS) : ASPECTS;
  const res = [];
  for (const A of positions) {
    const connected = [];
    for (const B of positions) {
      if (A.idx === B.idx) continue;
      const delta = Math.abs(dif(A.lon, B.lon));
      for (const asp of list) {
        const orb = orbSet === 'lilly' ? lillyOrb(A.idx, B.idx) : asp.modern;
        const diff = Math.abs(delta - asp.angle);
        if (diff <= orb) { connected.push(`${B.idx}:${asp.zh}(标准)`); break; }
        if (diff <= orb * 2) { connected.push(`${B.idx}:${asp.zh}分离(platic)`); break; }
      }
    }
    res.push({
      idx: A.idx,
      detached: connected.length === 0,
      note: connected.length ? `仍相连：${connected.join('、')}` : '与诸星全脱离（应用侧超标准容许、分离侧超轨道半径和；映射E#3/CE-014）',
    });
  }
  return res;
}

/**
 * 分离侧 platic 相位（映射E-术语27项#3：两星刚出相、仍在双方轨道半径和之内=platic 合相）。
 * 输出标准容许外、半径和内（orb, orb*2] 的分离相位附列表——判读模块可消费，不进主 aspects（零行为影响）。
 * 工程口径：半径和≈标准容许×2（lilly 均值两倍；modern 每相位固定值近似，标注）。
 */
function platicSeparations(positions, orbSet = 'modern', includeMinor = false) {
  const list = includeMinor ? ASPECTS.concat(MINOR_ASPECTS) : ASPECTS;
  const out = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const A = positions[i], B = positions[j];
      const delta = Math.abs(dif(A.lon, B.lon));
      for (const asp of list) {
        const orb = orbSet === 'lilly' ? lillyOrb(A.idx, B.idx) : asp.modern;
        const diff = Math.abs(delta - asp.angle);
        if (diff > orb && diff <= orb * 2) {
          out.push({ p1: A.idx, p2: B.idx, aspect: asp.en, aspectZh: asp.zh, glyph: asp.glyph, angle: asp.angle, orbUsed: diff, platicOrb: orb * 2 });
          break;
        }
      }
    }
  }
  return out;
}

module.exports = { aspectBetween, computeAspects, lillyOrb, detachedPlanets, platicSeparations };
