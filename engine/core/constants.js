// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 常量定义（行星/星座/宫位/相位/分宫制）
'use strict';

// 行星（Swiss Ephemeris 索引）
const PLANETS = {
  SUN: { idx: 0, en: 'Sun', zh: '太阳', glyph: '☉' },
  MOON: { idx: 1, en: 'Moon', zh: '月亮', glyph: '☽' },
  MERCURY: { idx: 2, en: 'Mercury', zh: '水星', glyph: '☿' },
  VENUS: { idx: 3, en: 'Venus', zh: '金星', glyph: '♀' },
  MARS: { idx: 4, en: 'Mars', zh: '火星', glyph: '♂' },
  JUPITER: { idx: 5, en: 'Jupiter', zh: '木星', glyph: '♃' },
  SATURN: { idx: 6, en: 'Saturn', zh: '土星', glyph: '♄' },
  URANUS: { idx: 7, en: 'Uranus', zh: '天王星', glyph: '♅' },
  NEPTUNE: { idx: 8, en: 'Neptune', zh: '海王星', glyph: '♆' },
  PLUTO: { idx: 9, en: 'Pluto', zh: '冥王星', glyph: '♇' },
  MEAN_NODE: { idx: 10, en: 'Mean Node', zh: '平均月交点', glyph: '☊' },
  TRUE_NODE: { idx: 11, en: 'True Node', zh: '真月交点', glyph: '☊' },
};
const PLANET_LIST = Object.values(PLANETS);

// 星座（0=白羊 … 11=双鱼）
const SIGNS = [
  { en: 'Aries', zh: '白羊', glyph: '♈', element: 'fire', quality: 'cardinal' },
  { en: 'Taurus', zh: '金牛', glyph: '♉', element: 'earth', quality: 'fixed' },
  { en: 'Gemini', zh: '双子', glyph: '♊', element: 'air', quality: 'mutable' },
  { en: 'Cancer', zh: '巨蟹', glyph: '♋', element: 'water', quality: 'cardinal' },
  { en: 'Leo', zh: '狮子', glyph: '♌', element: 'fire', quality: 'fixed' },
  { en: 'Virgo', zh: '处女', glyph: '♍', element: 'earth', quality: 'mutable' },
  { en: 'Libra', zh: '天秤', glyph: '♎', element: 'air', quality: 'cardinal' },
  { en: 'Scorpio', zh: '天蝎', glyph: '♏', element: 'water', quality: 'fixed' },
  { en: 'Sagittarius', zh: '射手', glyph: '♐', element: 'fire', quality: 'mutable' },
  { en: 'Capricorn', zh: '摩羯', glyph: '♑', element: 'earth', quality: 'cardinal' },
  { en: 'Aquarius', zh: '宝瓶', glyph: '♒', element: 'air', quality: 'fixed' },
  { en: 'Pisces', zh: '双鱼', glyph: '♓', element: 'water', quality: 'mutable' },
];

// 相位（黄经差主相位 + 两套容许度）
// lilly 套：Lilly《基督教占星学》行星"有效度"平均法（值来自规则库-Lilly相位状态卷，待全量校准）
// modern 套：现代通行固定容许度
const LILLY_PLANET_ORB = { 0: 15, 1: 12, 2: 7, 3: 8, 4: 7.5, 5: 9, 6: 9, 7: 7, 8: 7, 9: 7, 10: 7, 11: 7 };
const ASPECTS = [
  { angle: 0, en: 'Conjunction', zh: '合相', glyph: '☌', modern: 8, lilly: 'avg', nature: 'neutral' },
  { angle: 60, en: 'Sextile', zh: '六合', glyph: '⚹', modern: 6, lilly: 'avg', nature: 'benefic' },
  { angle: 90, en: 'Square', zh: '刑', glyph: '□', modern: 7, lilly: 'avg', nature: 'malefic' },
  { angle: 120, en: 'Trine', zh: '三合', glyph: '△', modern: 8, lilly: 'avg', nature: 'benefic' },
  { angle: 180, en: 'Opposition', zh: '对冲', glyph: '☍', modern: 8, lilly: 'avg', nature: 'malefic' },
];
// 次要相位（可选，默认关闭）
const MINOR_ASPECTS = [
  { angle: 30, en: 'Semisextile', zh: '半六合', modern: 2 },
  { angle: 45, en: 'Semisquare', zh: '半刑', modern: 2 },
  { angle: 135, en: 'Sesquiquadrate', zh: '补八分', modern: 2 },
  { angle: 150, en: 'Quincunx', zh: '梅花', modern: 2 },
];

// 分宫制（Swiss Ephemeris 代码）
const HOUSE_SYSTEMS = {
  P: 'Placidus', O: 'Porphyry', W: 'Whole Sign', R: 'Regiomontanus',
  K: 'Koch', A: 'Equal (Asc)', X: 'Meridian', M: 'Morinus', H: 'Horizon/Azimuth',
};

// 尊贵权重（规则库 essential_dignity_weights.json: Lilly/Bonatti 5/4/3/2/1）
const DIGNITY_WEIGHTS = {
  domicile: 5, exaltation: 4, triplicity: 3, term: 2, face: 1,
  detriment: -5, fall: -4,
};

module.exports = {
  PLANETS, PLANET_LIST, SIGNS, ASPECTS, MINOR_ASPECTS,
  HOUSE_SYSTEMS, DIGNITY_WEIGHTS, LILLY_PLANET_ORB,
};
