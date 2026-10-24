// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
/**
 * 行星时（Planetary Hours）——规则库 CE-155（Clavis Astrologiae Elimata 1676, CHAP XIV SECT I）
 * 判据原文：人造日（日出至日落）均分十二等份为行星时（昼行星时=日长/12）；夜亦均分十二等份（夜行星时=夜长/12）。
 * 轮值：行星时序列从"行星日守护星"起按卡尔代亚序（土木火日金水月）循环。
 * Clavis 示例校验（轮值逻辑）：周三=水星日，昼序列 水(1)月(2)土(3)木(4) → 第 4 行星时=木星 ✓
 * 算法（第四十七段重写）：rise_trans 返回"搜索时刻之后的下一次事件"，用四事件包围：
 *   rNext=jd 后下一次日出、sNext=jd 后下一次日落、rPrev=rise(rNext-1.5)、sPrev=set(sNext-1.5)（1.5 天窗口确保取到前一次）；
 *   isDay = sPrev < rPrev（当前在日出后日落前）；
 *   昼段 [rPrev, sNext)、夜段 [sPrev, rNext)；行星日（人造日从日出起算）= rPrev 所在当地日（星期基准 JD 2415020.5=1900-01-01 周一，0=周一）。
 */
'use strict';

const CHALDEAN = ['土', '木', '火', '日', '金', '水', '月']; // 卡尔代亚序（远→近）
const WEEKDAY_LORDS = ['月', '火', '水', '木', '金', '土', '日']; // 0=周一→行星日守护
const WEEKDAY_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const JD_1900 = 2415020.5; // 1900-01-01 00:00（周一）
const SEFLG_SWIEPH = 2, SE_SUN = 0, SE_CALC_RISE = 1, SE_CALC_SET = 2;

/**
 * 计算某 UT 时刻（jdUt）在给定地点的行星时主星。
 * @param {number} jdUt  目标时刻（UT，儒略日）
 * @param {number} lat   纬度
 * @param {number} lon   经度
 * @param {object} swe   swisseph 实例（getSwe 返回）
 * @param {number} [tzOffsetHours] 当地时区（小时）；默认 Math.round(lon/15) 近似（工程口径）
 * @returns {null|{isDay, hourIndex1, hourLord, dayLord, weekdayZh, riseCST, setCST, nextRiseCST, hourLenMin, note, seq}}
 */
function planetaryHour(jdUt, lat, lon, swe, tzOffsetHours) {
  if (!swe || !jdUt || !isFinite(lat) || !isFinite(lon)) return null;
  const tz = isFinite(tzOffsetHours) ? tzOffsetHours : Math.round(lon / 15);
  const geo = [lon, lat, 0];
  const rise = (jd) => swe.rise_trans(jd, SE_SUN, '', SEFLG_SWIEPH, SE_CALC_RISE, geo, 0, 0);
  const set = (jd) => swe.rise_trans(jd, SE_SUN, '', SEFLG_SWIEPH, SE_CALC_SET, geo, 0, 0);
  const rNextA = rise(jdUt), sNextA = set(jdUt);
  if (!rNextA || !sNextA) return null;
  const rNext = rNextA[0], sNext = sNextA[0];
  const rPrevA = rise(rNext - 1.5), sPrevA = set(sNext - 1.5);
  const rPrev = rPrevA && rPrevA[0] ? rPrevA[0] : rNext - 1.0;
  const sPrev = sPrevA && sPrevA[0] ? sPrevA[0] : sNext - 1.0;
  // 昼判定与分段
  const isDay = sPrev < rPrev;
  const start = isDay ? rPrev : sPrev;
  const end = isDay ? sNext : rNext;
  let hourLen = (end - start) / 12;
  if (!(hourLen > 0) || !isFinite(hourLen)) hourLen = 1 / 12; // 兜底（不应发生）
  let hourIdx = Math.floor((jdUt - start) / hourLen);
  if (hourIdx < 0) hourIdx = 0;
  if (hourIdx > 11) hourIdx = 11;
  // 行星日（人造日从日出起算）= rPrev 所在当地日
  const dayStartJd = rPrev;
  const wd = ((Math.floor(dayStartJd + tz / 24 - JD_1900)) % 7 + 7) % 7; // 0=周一
  const dayLord = WEEKDAY_LORDS[wd];
  const seqStart = CHALDEAN.indexOf(dayLord);
  // 轮值：行星时序列连续循环（昼 0-11、夜 12-23 全局序号），从行星日守护星起
  const globalIdx = hourIdx + (isDay ? 0 : 12);
  const hourLord = CHALDEAN[(seqStart + globalIdx) % 7];
  const toCST = (jd) => {
    const ms = (jd - 2440587.5) * 86400000 + 8 * 3600000;
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  };
  return {
    isDay,
    hourIndex1: globalIdx + 1,
    hourLord,
    dayLord,
    weekdayZh: `周${WEEKDAY_ZH[wd]}`,
    riseCST: toCST(rPrev), setCST: toCST(sNext), nextRiseCST: toCST(rNext),
    hourLenMin: hourLen * 24 * 60,
    note: isDay ? `昼行星时（日长/12，${(hourLen * 24 * 60).toFixed(1)} 分/时）` : `夜行星时（夜长/12，${(hourLen * 24 * 60).toFixed(1)} 分/时）`,
    seq: Array.from({ length: 12 }, (_, i) => CHALDEAN[(seqStart + i) % 7]),
  };
}

module.exports = { planetaryHour, CHALDEAN, WEEKDAY_LORDS };
