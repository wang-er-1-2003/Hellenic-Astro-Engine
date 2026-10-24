// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 规则库子表查询（249 张子表 → rule_tables.json → 行星档案/三分主星/界/面/宫位/尊贵对照）
'use strict';
const fs = require('fs');
const path = require('path');

let _db = null;

function loadTables() {
  if (_db) return _db;
  const p = path.join(__dirname, '../data/rule_tables.json');
  _db = JSON.parse(fs.readFileSync(p, 'utf-8'));
  _db.byTag = {};
  for (const t of _db.tables) {
    (_db.byTag[t.tag] || (_db.byTag[t.tag] = [])).push(t);
  }
  _db.byTable = {};
  for (const t of _db.tables) _db.byTable[t.table] = t;
  return _db;
}

function rowsByTag(tag) {
  return loadTables().byTag[tag] || [];
}

function rowToObj(header, row) {
  const o = {};
  header.forEach((h, i) => { if (h) o[h] = (row[i] || '').toString().trim(); });
  return o;
}

// 行星别名归一（表里可能是 土星/Saturn/♄）
const ZH = { '太阳': '太阳', 'Sun': '太阳', '日': '太阳', '月亮': '月亮', 'Moon': '月亮', '月': '月亮', '水星': '水星', 'Mercury': '水星', '金星': '金星', 'Venus': '金星', '火星': '火星', 'Mars': '火星', '木星': '木星', 'Jupiter': '木星', '土星': '土星', 'Saturn': '土星' };
function normPlanet(v) {
  if (!v) return '';
  const s = v.trim().replace(/[♄♃♂♀☿☉☽]/g, '');
  return ZH[s] || s;
}

// 字段别名归一：各卷表头命名不一（planet/行星/item、greatest/大年/最大周期）
const ALIAS = {
  planet: ['planet', '行星', 'item'],
  greatest: ['greatest', '大年', '最大周期', '最大年'],
  greater: ['greater', '中年', '平均年'],
  mean: ['mean', '均年数', '平均周期'],
  least: ['least', '小年', '最小年', '最小周期'],
  friends: ['friends', '友'],
  enemies: ['enemies', '敌'],
};
function normRow(o) {
  const n = {};
  for (const k in o) n[k] = o[k];
  for (const key in ALIAS) {
    for (const a of ALIAS[key]) {
      if (o[a] !== undefined && o[a] !== '') { n[key] = o[a]; break; }
    }
  }
  return n;
}

/** 行星档案：要素 + 年数 + 友敌 + 运动参数（合并多来源） */
function planetaryProfile(zh) {
  const out = { planet: zh, elements: [], years: [], friendsEnemies: [], motion: [] };
  for (const t of rowsByTag('planetary_elements')) {
    if (!/行星要素/.test(t.table)) continue;
    for (const r of t.rows) {
      const o = normRow(rowToObj(t.header, r));
      if (normPlanet(o.planet) === zh) out.elements.push({ source: t.source, row: o });
    }
  }
  for (const t of rowsByTag('planetary_years')) {
    for (const r of t.rows) {
      const o = normRow(rowToObj(t.header, r));
      if (normPlanet(o.planet) === zh && (o.greatest || o.greater || o.mean || o.least)) {
        out.years.push({ source: t.source, table: t.table, row: o });
      }
    }
  }
  for (const t of rowsByTag('friends_enemies')) {
    for (const r of t.rows) {
      const o = normRow(rowToObj(t.header, r));
      if (normPlanet(o.planet) === zh) out.friendsEnemies.push({ source: t.source, row: o });
    }
  }
  for (const t of rowsByTag('planetary_motion')) {
    for (const r of t.rows) {
      const o = normRow(rowToObj(t.header, r));
      if (normPlanet(o.planet) === zh) out.motion.push({ source: t.source, row: o });
    }
  }
  return out;
}

/** 三分主星（多套）：signZh 星座中文 → 各套昼/夜主星 */
function triplicity(signZh) {
  const ELEM = { '白羊': '火', '狮子': '火', '射手': '火', '金牛': '土', '处女': '土', '摩羯': '土', '双子': '风', '天秤': '风', '宝瓶': '风', '巨蟹': '水', '天蝎': '水', '双鱼': '水' };
  const elem = ELEM[signZh];
  const out = [];
  for (const t of rowsByTag('triplicity')) {
    const rows = [];
    for (const r of t.rows) {
      const o = rowToObj(t.header, r);
      const cell = Object.values(o).join(' ');
      // 匹配：行内含该元素
      if (elem && (cell.includes(elem) || cell.includes(signZh) || cell.includes(ELEM[signZh]))) {
        rows.push(o);
      }
    }
    if (rows.length) out.push({ source: t.source, table: t.table, rows });
  }
  return out;
}

/** 十二宫总表（宫位事项/身体/共示义星/喜乐） */
function houseMeaning(n) {
  const out = [];
  for (const t of rowsByTag('houses_meaning')) {
    for (const r of t.rows) {
      const o = rowToObj(t.header, r);
      const cell = Object.values(o).join(' ');
      if (cell.includes(String(n) + '宫') || (o['宫位'] && String(o['宫位']).includes(String(n))) ||
          (o['宫'] && String(o['宫']).replace('第', '').replace('宫', '') === String(n))) {
        out.push({ source: t.source, table: t.table, row: o });
        break;
      }
    }
  }
  return out;
}

/** 界/面：signZh 星座中文 → 各段行星与度数（标准结构表） */
function termsFaces(signZh) {
  const out = { terms: [], faces: [] };
  const SIGN = { '白羊': 'Aries', '金牛': 'Taurus', '双子': 'Gemini', '巨蟹': 'Cancer', '狮子': 'Leo', '处女': 'Virgo', '天秤': 'Libra', '天蝎': 'Scorpio', '射手': 'Sagittarius', '摩羯': 'Capricorn', '宝瓶': 'Aquarius', '双鱼': 'Pisces' };
  for (const t of rowsByTag('terms')) {
    for (const r of t.rows) {
      const o = rowToObj(t.header, r);
      const signCell = (o.sign || o.signZh || '').trim();
      if (signCell === signZh || signCell === SIGN[signZh] || (o['星座'] && String(o['星座']).includes(signZh))) {
        out.terms.push({ source: t.source, table: t.table, row: o });
      }
    }
  }
  for (const t of rowsByTag('faces')) {
    for (const r of t.rows) {
      const o = rowToObj(t.header, r);
      const signCell = (o.sign || '').trim();
      if (signCell === signZh || signCell === SIGN[signZh]) out.faces.push({ source: t.source, row: o });
    }
  }
  return out;
}

/** 尊贵表对照：rule_tables 里的 dignity_table vs 现有 dignity_tables.json（列出两处 dubious 校验） */
function dignityVerify() {
  const core = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/dignity_tables.json'), 'utf-8'));
  const reports = [];
  for (const t of rowsByTag('dignity_table')) {
    const rows = [];
    for (const r of t.rows) {
      const o = rowToObj(t.header, r);
      if (o.planet) rows.push({ source: t.source, table: t.table, row: o });
    }
    reports.push(...rows);
  }
  return { core, tables: reports };
}

/** 通用：按 tag 取原始表 */
function queryTables(tag) {
  return rowsByTag(tag).map(t => ({ source: t.source, table: t.table, header: t.header, rows: t.rows.slice(0, 50) }));
}

/** 统计 */
function stats() {
  const db = loadTables();
  return { total: db.tables.length, tags: db.meta.tag_stats };
}

module.exports = { loadTables, planetaryProfile, triplicity, houseMeaning, termsFaces, dignityVerify, queryTables, stats };
