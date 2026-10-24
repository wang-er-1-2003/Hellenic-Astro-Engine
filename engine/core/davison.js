// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - E 合盘域第三版：复合盘（Davison Relationship Chart）
// 定义：取双出生时间的 UTC 中点时刻 + 出生地地理中点，重排一张完整本命盘。
// 实事求是：时间中点取到分钟级；跨 180° 经线/国际日期变更线的地理中点未特殊处理（简单平均）。
'use strict';
const { computeChart } = require('./chart');
const { progressedJd } = require('./progress');

function toUtcMs(input) {
  const h = (input.hour ?? 0) + (input.minute ?? 0) / 60;
  const tz = input.tzOffsetHours ?? 8;
  return Date.UTC(input.year, (input.month ?? 1) - 1, input.day ?? 1) + (h - tz) * 3600000;
}

/** 复合盘：inputA/inputB 两出生输入 → 中点时刻+地点重排盘 */
async function davisonChart(inputA, inputB) {
  const ms = (toUtcMs(inputA) + toUtcMs(inputB)) / 2;
  const mid = new Date(ms);
  return computeChart({
    type: 'natal',
    year: mid.getUTCFullYear(),
    month: mid.getUTCMonth() + 1,
    day: mid.getUTCDate(),
    hour: mid.getUTCHours(),
    minute: mid.getUTCMinutes(),
    tzOffsetHours: 0, // 已用 UTC 中点时刻，直接排
    lat: (inputA.lat + inputB.lat) / 2,
    lon: (inputA.lon + inputB.lon) / 2,
    houseSystem: inputA.houseSystem || 'P',
    orbSet: inputA.orbSet || 'modern',
  });
}

/**
 * 组合推运盘（Davison progressed）：组合盘时刻作"出生"时刻，按次限法推 years 年。
 * 组合盘 jd(UT) = 双出生 UTC 中点；次限：1 天 = 1 年 → jd + years（天）。
 * 排盘输入用 UTC 直接排（tzOffsetHours=0），与 davisonChart 口径一致。
 */
async function davisonProgressed(inputA, inputB, years) {
  const ms = (toUtcMs(inputA) + toUtcMs(inputB)) / 2;
  const midJd = ms / 86400000 + 2440587.5; // Date.UTC ms → JD(UT)：JD = ms/864e5 + 2440587.5
  const progJd = progressedJd(midJd, years);
  const jd = new Date((progJd - 2440587.5) * 86400000);
  return computeChart({
    type: 'natal',
    year: jd.getUTCFullYear(),
    month: jd.getUTCMonth() + 1,
    day: jd.getUTCDate(),
    hour: jd.getUTCHours(),
    minute: jd.getUTCMinutes(),
    tzOffsetHours: 0,
    lat: (inputA.lat + inputB.lat) / 2,
    lon: (inputA.lon + inputB.lon) / 2,
    houseSystem: inputA.houseSystem || 'P',
    orbSet: inputA.orbSet || 'modern',
  });
}

module.exports = { davisonChart, davisonProgressed, toUtcMs };
