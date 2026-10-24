// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - SwissEph wasm 单例封装（异步初始化，复用实例）
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

let _swePromise = null;

/**
 * 获取（并惰性初始化）SwissEph 实例。
 * wasm 库为 ESM，Windows 下须以 file:// URL 动态导入；Electron 内嵌 Node ≥20 支持。
 */
async function getSwe() {
  if (!_swePromise) {
    _swePromise = (async () => {
      const modUrl = pathToFileURL(
        path.join(__dirname, '../sweph-wasm/package/src/swisseph.js')
      ).href;
      const { default: SwissEph } = await import(modUrl);
      const swe = new SwissEph();
      await swe.initSwissEph();
      return swe;
    })();
  }
  return _swePromise;
}

/**
 * 本地时间 → 儒略日（UT）。
 * @param {object} t {year, month, day, hour(含小数), tzOffsetHours, calendar}
 *   calendar: 'g'=格里历(默认) | 'j'=儒略历（1582-10-15 前及古代判例用）
 * @returns {number} JD(UT)
 */
async function localToJd(t) {
  const swe = await getSwe();
  const utHour = t.hour - (t.tzOffsetHours || 0);
  if (t.calendar === 'j') {
    return swe.date_conversion(t.year, t.month, t.day, utHour, 'j');
  }
  return swe.julday(t.year, t.month, t.day, utHour);
}

/**
 * 关闭实例（进程退出时调用；重复调用安全）。
 */
async function close() {
  if (_swePromise) {
    const swe = await _swePromise;
    try { swe.close(); } catch (e) { /* ignore */ }
    _swePromise = null;
  }
}

module.exports = { getSwe, localToJd, close };
