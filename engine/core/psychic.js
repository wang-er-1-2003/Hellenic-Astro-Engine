// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 现代心理(esoteric)释义层（马克思盘/心理占星释义数据源）
// 数据来源：Astrolog 开源软件（Walter Pullen，MIT）source/intrpret.cpp 内嵌 esoteric 释义数组，
//   经 _extract_eso.py 提取为 engine/data/modern_psychic_astrolog.json（全英文原文，未改写）。
// 结构：eso_obj[天体]=行星灵魂义（顺序=SE 天体号：0太阳…9冥王，10+小行星/节点）；
//       eso_lesson[星座]=心理功课；eso_mantra1/2[星座]=咒语；eso_light[星座]=光；
//       eso_labor[星座]=劳役；eso_house1/2[宫]=宫位灵魂义；house_tradition[宫]=传统宫位义。
// 实事求是：本层为现代神秘学释义文本（非古典判据），供马克思盘/心理层参考展示；
//   不作吉凶计分，仅文本释义。来源标注 Astrolog MIT。
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/modern_psychic_astrolog.json'), 'utf-8')
).arrays;

/** 本命盘心理释义：行星灵魂义 + 星座功课/咒语/光/劳役 + 宫位灵魂义 */
function psychicMeanings(chart) {
  const byIdx = Object.fromEntries((chart.planets || []).map(p => [p.idx, p]));
  const SIGNS_ZH = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];

  const planets = (chart.planets || []).filter(p => p.idx <= 9).map(p => {
    const sign = Math.floor(p.lon / 30);
    const house = p.house || 1;
    return {
      idx: p.idx, zh: p.zh, en: p.en, glyph: p.glyph,
      signZh: SIGNS_ZH[sign], house,
      esotericMeaning: DATA.eso_obj[p.idx] || '',
    };
  });

  // 各行星所在星座的功课/咒语/光/劳役（按行星落座给出）
  const planetLessons = planets.map(p => {
    const sign = Math.floor((byIdx[p.idx] || { lon: 0 }).lon / 30);
    return {
      idx: p.idx, zh: p.zh, glyph: p.glyph, signZh: SIGNS_ZH[sign],
      lesson: DATA.eso_lesson[sign] || '',
      mantra: DATA.eso_mantra1[sign] || '',
      light: DATA.eso_light[sign] || '',
      labor: DATA.eso_labor[sign] || '',
    };
  });

  // 十二宫灵魂义（1-12）
  const houses = [];
  for (let h = 0; h < 12; h++) {
    houses.push({
      house: h + 1,
      tradition: DATA.house_tradition[h] || '',
      soulLevel: DATA.eso_house1[h] || '',
      soulPurpose: DATA.eso_house2[h] || '',
    });
  }

  return { planets, planetLessons, houses, source: DATA.source };
}

// Astrolog 相位枚举号（aCon=1…aUd5=24）与引擎相位英文名映射
const ASPECT_IDX = {
  Conjunction: 1, Opposition: 2, Square: 3, Trine: 4, Sextile: 5,
  Inconjunct: 6, SemiSextile: 7, SemiSquare: 8, SesquiQuadrate: 9,
  Quintile: 10, BiQuintile: 11, SemiQuintile: 12, Septile: 13, Novile: 14,
  BiNovile: 15, BiSeptile: 16, TriSeptile: 17, QuatroNovile: 18, TreDecile: 19,
};

/**
 * 相位心理释义（Astrolog szInteract/szModify/szTherefore 口径）：
 * 修饰词三档 = 相位偏差/2.5′：<2.5′→加强（always 等）、2.5′-5′→中性、≥5′→减弱（somewhat 等）。
 * @param {object} chart computeChart 输出（含 chart.aspects）
 * @returns {Array} [{p1, p2, zh1, zh2, aspectZh, modifier, therefore, orbUsed}]
 */
function aspectPsychic(chart) {
  const byIdx = Object.fromEntries((chart.planets || []).map(p => [p.idx, p]));
  return (chart.aspects || []).map(a => {
    const idx = ASPECT_IDX[a.aspect];
    if (!idx) return null;
    const nOrb = Math.min(Math.floor(a.orbUsed / (2.5 / 60)), 2); // 2.5′ = 0.041667°
    const modRow = DATA.aspect_modifier_rows ? DATA.aspect_modifier_rows[nOrb] : [];
    const mod = (modRow[idx - 1] || '').trim();
    const therefore = DATA.aspect_therefore[idx] || '';
    const p1 = byIdx[a.p1], p2 = byIdx[a.p2];
    return {
      p1: a.p1, p2: a.p2, zh1: p1 ? p1.zh : '', zh2: p2 ? p2.zh : '',
      aspectZh: a.aspectZh, aspect: a.aspect, orbUsed: a.orbUsed,
      modifier: mod, therefore,
    };
  }).filter(Boolean);
}

/** Sabian 度数符号：每行星黄经整数度 → szSabian[deg]（0-359，Aries 0° 起） */
function sabianSymbols(chart) {
  const SIGNS_ZH = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
  return (chart.planets || []).map(p => {
    const deg = ((p.lon % 360) + 360) % 360;
    const dInt = Math.floor(deg);
    return {
      idx: p.idx, zh: p.zh, glyph: p.glyph,
      degree: dInt,
      sign: SIGNS_ZH[Math.floor(dInt / 30)], degInSign: dInt % 30,
      symbol: DATA.sabian_symbols[dInt] || '',
    };
  });
}

module.exports = { psychicMeanings, aspectPsychic, sabianSymbols };
