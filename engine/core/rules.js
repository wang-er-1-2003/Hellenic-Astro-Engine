// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 第4层规则库查询（47 卷 → rules_index.json → 按行星/星座/宫位/相位/关键词检索）
'use strict';
const fs = require('fs');
const path = require('path');

let _db = null;
let _idx = null;

function load() {
  if (_db) return _db;
  const p = path.join(__dirname, '../data/rules_index.json');
  _db = JSON.parse(fs.readFileSync(p, 'utf-8'));

  // 反向索引
  _idx = {
    byPlanet: {}, bySign: {}, byHouse: {}, byAspect: {},
    byType: {}, bySource: {},
  };
  for (const r of _db.rules) {
    for (const k of r.planets) (_idx.byPlanet[k] || (_idx.byPlanet[k] = [])).push(r);
    for (const k of r.signs) (_idx.bySign[k] || (_idx.bySign[k] = [])).push(r);
    for (const k of r.houses) (_idx.byHouse[k] || (_idx.byHouse[k] = [])).push(r);
    for (const k of r.aspects) (_idx.byAspect[k] || (_idx.byAspect[k] = [])).push(r);
    if (r.rule_type) (_idx.byType[r.rule_type] || (_idx.byType[r.rule_type] = [])).push(r);
    (_idx.bySource[r.source] || (_idx.bySource[r.source] = [])).push(r);
  }
  _db._idx = _idx;
  return _db;
}

function brief(r, includeOriginal) {
  const o = { rule_id: r.rule_id, source: r.source, book: r.book, translation: r.translation };
  if (r.condition) o.condition = r.condition;
  if (r.result) o.result = r.result;
  if (r.rule_type) o.rule_type = r.rule_type;
  if (r.confidence) o.confidence = r.confidence;
  if (r.houses.length) o.houses = r.houses;
  if (includeOriginal && r.original_text) o.original_text = r.original_text;
  return o;
}

/**
 * 通用查询。filters: {planet, sign, house, aspect, keyword, source, type, max}
 * 标签过滤是 OR 组内、AND 组间；keyword 在 translation+original_text 里全文搜。
 */
function query(filters = {}, includeOriginal = false) {
  const db = load();
  const f = filters;
  let pool = db.rules;

  if (f.keyword) {
    const kw = String(f.keyword).trim().toLowerCase();
    pool = pool.filter(r => r.translation.toLowerCase().includes(kw) ||
                             (r.original_text || '').toLowerCase().includes(kw));
  }
  const hit = (r) => {
    if (f.planet && !r.planets.includes(f.planet)) return false;
    if (f.sign && !r.signs.includes(f.sign)) return false;
    if (f.house && !r.houses.includes(String(f.house))) return false;
    if (f.aspect && !r.aspects.includes(f.aspect)) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.type && r.rule_type !== f.type) return false;
    return true;
  };
  const out = pool.filter(hit);
  const max = f.max || 40;
  return out.slice(0, max).map(r => brief(r, includeOriginal));
}

/** 统计 */
function stats() {
  const db = load();
  const tagged = db.rules.filter(r => r.planets.length || r.signs.length || r.houses.length || r.aspects.length).length;
  return {
    total: db.rules.length,
    tagged,
    sources: Object.keys(db._idx.bySource).length,
    byType: Object.fromEntries(Object.entries(db._idx.byType).map(([k, v]) => [k, v.length])),
  };
}

/**
 * 整盘规则解读：对盘上每个行星，按 落座/落宫/相位/行星本体 命中规则（去重、评分排序）。
 * 语义修正：
 *  - 传统七政(idx<=6)全渠道匹配；现代点(天海冥/交点)只做行星本体匹配（古典规则库无其释义，落座匹配必错配）
 *  - 落座命中做"行星名共现"检查：规则文本涉他星且不含本行星 → 降为"落座(涉他星)"低分
 *  - 通用参数类(data/parameter/algorithm)降权后置
 * @param {object} chart 引擎 chart.js 输出
 * @param {object} opts {includeOriginal, maxPerPlanet}
 * @returns {object} { meta, planets: [{zh, glyph, position, house, retrograde, dignityScore, hitCount, hits: []}] }
 */
function lookupChart(chart, opts = {}) {
  const db = load();
  const maxPerPlanet = opts.maxPerPlanet || 10;
  const ZH = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星'];
  const GENERIC_TYPES = new Set(['data', 'parameter', 'algorithm']);
  // 卷级优先级：释义基座卷（专门讲行星/星座/相位/本命）> 判例/方向/总纲 > 通用格言
  const VOLUME_BONUS = {
    '规则库-Lilly行星释义卷.xlsx': 1.3,
    '规则库-Lilly星座释义卷.xlsx': 1.3,
    '规则库-Lilly相位状态卷.xlsx': 1.3,
    '规则库-Lilly基础教程卷.xlsx': 1.1,
    '规则库-Tetrabiblos本命卷(BookIII).xlsx': 1.0,
    '规则库-Tetrabiblos财官婚旅卷(BookIV).xlsx': 1.0,
    '规则库-Tetrabiblos本命基础卷(BookI).xlsx': 0.9,
    '规则库-Dorotheus卷一.xlsx': 1.0,
    '规则库-Dorotheus卷二.xlsx': 1.0,
    '规则库-Valens本命总论卷.xlsx': 0.9,
    '规则库-Valens本命判断卷.xlsx': 0.9,
    '规则库-Clavis本命方向卷.xlsx': 0.6,
    '规则库-Dariot卜卦总纲.xlsx': 0.6,
  };
  const planetsOut = [];
  let totalHits = 0;

  for (const p of chart.planets) {
    const isClassical = p.idx <= 6;
    const by = {
      planet: db._idx.byPlanet[p.zh] || [],
      sign: isClassical ? (db._idx.bySign[p.position.signZh] || []) : [],
      house: isClassical ? (db._idx.byHouse[String(p.house)] || []) : [],
    };
    // 相位命中（入相位方各算一次）
    const aspectRules = [];
    if (isClassical) {
      for (const a of chart.aspects) {
        if (a.p1 === p.idx) aspectRules.push(...(db._idx.byAspect[a.aspectZh] || []));
        if (a.p2 === p.idx) aspectRules.push(...(db._idx.byAspect[a.aspectZh] || []));
      }
    }

    const merged = new Map();
    const push = (r, via, score) => {
      const key = (r.rule_id || r.translation.slice(0, 40)) + '|' + via;
      if (!merged.has(key)) merged.set(key, { ...brief(r, opts.includeOriginal), via, score });
    };

    const text = (r) => ((r.translation || '') + ' ' + (r.condition || '')).replace(/\s+/g, '');
    const mentionsOther = (r) => {
      const t = text(r);
      if (t.includes(p.zh)) return false;
      return ZH.some(z => t.includes(z));
    };
    const scoreOf = (r, base) => {
      let s = base + (VOLUME_BONUS[r.source] || 0);
      // 通用参数降权仅对低优先卷生效（Lilly 释义卷 rule_type=data 是释义本体，不降）
      if (GENERIC_TYPES.has(r.rule_type) && (VOLUME_BONUS[r.source] || 0) < 0.9) s -= 1.2;
      // 多标签格言体（标了多个行星）＝通用格言，非单行星释义
      if (r.planets.length > 3) s -= 0.8;
      return s;
    };

    for (const r of by.planet) push(r, '行星', scoreOf(r, 4));
    for (const r of by.sign) {
      if (mentionsOther(r)) push(r, '落座(涉他星)', scoreOf(r, 1));
      else push(r, '落座', scoreOf(r, 4.2));   // 落座特性最直接 → 略高于行星本体
    }
    for (const r of by.house) push(r, '落宫', scoreOf(r, 3.5));
    for (const r of aspectRules) push(r, '相位', scoreOf(r, 2.5));

    const hits = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, maxPerPlanet)
      .map(({ score, ...rest }) => rest);
    totalHits += hits.length;
    planetsOut.push({
      zh: p.zh, glyph: p.glyph,
      position: p.position.text, house: p.house,
      retrograde: p.retrograde, dignityScore: p.dignityScore,
      hitCount: hits.length,
      hits,
    });
  }
  return {
    meta: { totalHits, tagged: db.rules.filter(r => r.planets.length || r.signs.length || r.houses.length || r.aspects.length).length },
    planets: planetsOut,
  };
}

module.exports = { load, query, stats, lookupChart };
