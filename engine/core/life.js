// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - Hyleg（寿命主/给予生命者）与 Alcocoden（给予年份者）判定
// 数据源：astrology-resources/rules/hyleg_alcocoden.json（结构化自规则库）
// 核心事实（如实声明）：存世古籍无统一标准程序（Dorotheus/Ptolemy/Valens/Firmicus/Paulus 各有不同，
//   Demetra George 结论 no single standard procedure）。本实现默认采用 astroak 现代综合口径，
//   方法必须声明，不同程序同一张盘可能得出不同 hyleg/alcocoden。
// 候选序列（astroak 现代综合）：昼=太阳→月亮→上升→福点→产前朔望；夜=月亮→太阳→福点→上升→产前朔望
// 合格宫：1/7/10/11（9 宫有条件接受）；6/8/12 不合格
'use strict';
const fs = require('fs');
const path = require('path');
const { dif } = require('./ecliptic');
const { nearStars, isBenefic, isMalefic } = require('./fixed_stars');
const DEGREE_NATURES = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/degree_natures.json'), 'utf-8')).degrees;
// Clavis p30 度数性质表（深陷/Azimene/增财，第四十三段数字化）：增财度判据
const CLT_ROWS = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '../data/clavis_degree_table.json'), 'utf-8')).rows; }
  catch (e) { return {}; }
})();

const W = { domicile: 5, exaltation: 4, triplicity: 3, term: 2, face: 1 };
const CANDIDATES = {
  day: ['Sun', 'Moon', 'Ascendant', 'Fortune', 'PrenatalLunation'],
  night: ['Moon', 'Sun', 'Fortune', 'Ascendant', 'PrenatalLunation'],
};
const QUALIFY_HOUSES = new Set([1, 7, 10, 11]);

/** 任意黄经落宫（Placidus/通用：按 12 宫头分段，ASC=1宫头） */
function houseOfLon(lon, chart) {
  const cusps = chart.houses.cuspsRaw;
  const norm = ((lon % 360) + 360) % 360;
  for (let i = 0; i < 12; i++) {
    const a = cusps[i];
    const b = cusps[(i + 1) % 12];
    const inRange = a <= b ? (norm >= a && norm < b) : (norm >= a || norm < b);
    if (inRange) return i + 1;
  }
  return 1;
}

/** 福点（Lot of Fortune）：昼=ASC+月-日；夜=ASC+日-月（通用口径；
 *  Valens 宫位传递卷 VC-004 的"月未落时月→日距、月落后日→月距"细则未实现，记待办） */
function lotOfFortune(chart) {
  const asc = chart.houses.angles.asc;
  const sun = chart.planets.find(p => p.idx === 0).lon;
  const moon = chart.planets.find(p => p.idx === 1).lon;
  const isDay = chart.meta.isDay === 'day';
  const lot = isDay ? (asc + moon - sun) : (asc + sun - moon);
  return ((lot % 360) + 360) % 360;
}

/**
 * 产前朔望（出生前最近一次新月）：牛顿迭代求 日月黄经差=0 的时刻。
 * 依赖 swisseph 同步接口 swe.calc_ut（swe 实例由排盘流程传入）。
 * 朔望周期≈29.530588853 天；从 jd 往回一个周期内必有且只有一个朔。
 * @returns {{jd:number, lon:number, sunLon:number, iterations:number}}
 */
function prenatalLunation(swe, jd) {
  const flags = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED;
  const sunLonAt = (t) => swe.calc_ut(t, swe.SE_SUN, flags)[0];
  const moonLonAt = (t) => swe.calc_ut(t, swe.SE_MOON, flags)[0];
  // 相对黄经差 f(t)=月-日，映射到 [-180,180)
  const f = (t) => {
    let d = (moonLonAt(t) - sunLonAt(t)) % 360;
    return d > 180 ? d - 360 : d;
  };
  const RATE = 12.2; // 月日相对速度 ≈ 13.2-1.0 °/d（牛顿迭代用）
  const SYNC = 29.530588853;
  // 初始估计：jd 往回一个朔望周期
  let t = jd - SYNC;
  let iter = 0;
  for (let i = 0; i < 4; i++) {
    const v = f(t);
    if (Math.abs(v) < 1e-6) break;
    t -= v / RATE;
    iter++;
  }
  // 若迭代跑过头（>jd 或 <jd-周期），回退到区间内（工程保护）
  while (t >= jd) t -= SYNC;
  while (t < jd - SYNC) t += SYNC;
  const sl = sunLonAt(t);
  return { jd: t, lon: ((sl % 360) + 360) % 360, sunLon: sl, iterations: iter };
}

/**
 * Hyleg 判定（默认 astroak 现代综合）。
 * @returns {{found:null|{name,label,lon,house,qualify}, skipped:string[], method:string, isDay:string}}
 */
function findHyleg(chart, method = 'astroak') {
  const isDay = chart.meta.isDay === 'day';
  const seq = isDay ? CANDIDATES.day : CANDIDATES.night;
  const sun = chart.planets.find(p => p.idx === 0).lon;
  const moon = chart.planets.find(p => p.idx === 1).lon;
  const asc = chart.houses.angles.asc;
  const preLun = chart.meta && chart.meta.prenatalLunation ? chart.meta.prenatalLunation.lon : null;
  const points = {
    Sun: { label: '太阳', lon: sun },
    Moon: { label: '月亮', lon: moon },
    Ascendant: { label: '上升', lon: asc },
    Fortune: { label: '福点', lon: lotOfFortune(chart) },
    PrenatalLunation: { label: '产前朔望', lon: preLun },
  };
  let found = null;
  const skipped = [];
  for (const name of seq) {
    const pt = points[name];
    if (pt.lon == null) { skipped.push(`${pt.label}（未实现，跳过）`); continue; }
    const h = houseOfLon(pt.lon, chart);
    const ok = QUALIFY_HOUSES.has(h) || h === 9;
    if (ok) {
      found = { name, label: pt.label, lon: pt.lon, house: h, qualify: h === 9 ? '第9宫（有条件接受）' : '合格（角宫/续宫）' };
      break;
    }
    skipped.push(`${pt.label}(${h}宫不合格)`);
  }
  return { found, skipped, method, isDay: isDay ? 'day' : 'night' };
}

/** Alcocoden：hyleg 度数上拥有最强本然尊贵的行星（庙5/擢4/三分3/界2/面1）。
 *  并列裁定（有据）：CP3-305 吉照优先（吉星照者优先）→ 仍并列 TTB-307 取近角同宗者。 */
function findAlcocoden(chart, hylegResult) {
  const hy = hylegResult || findHyleg(chart);
  if (!hy.found) return { hyleg: null, alcocoden: null, note: '无合格 hyleg 候选（按 astroak 口径），alcochoden 无从谈起' };
  const { essentialDignities } = require('./dignity');
  const isDay = chart.meta.isDay === 'day';
  const seven = chart.planets.filter(p => p.idx <= 6);
  const scored = seven.map(p => {
    const ess = essentialDignities(p.idx, hy.found.lon, isDay);
    return {
      zh: p.zh, glyph: p.glyph, idx: p.idx, lon: p.lon,
      score: ess.reduce((t, d) => t + (W[d.dignity] || 0), 0),
      list: ess.map(d => d.dignity).join('/'),
    };
  });
  const max = Math.max(...scored.map(s => s.score));
  let top = scored.filter(s => s.score === max && max > 0);
  const note = [];
  if (top.length === 0) return { hyleg: hy.found, alcocoden: null, maxScore: 0, note: ['hyleg 度数上无本然尊贵行星（各行星 score=0），alcochoden 缺位'] };
  if (top.length > 1) {
    // CP3-305 吉照优先：并列者中，被吉星（木/金）合/六合/三合者优先
    const benAspectIdx = new Set();
    for (const a of chart.aspects || []) {
      const other = a.p1 === 3 || a.p1 === 5 || a.p2 === 3 || a.p2 === 5 ? (a.p1 === 3 || a.p1 === 5 ? a.p2 : a.p1) : null;
      if (other != null && [0, 60, 120].includes(a.aspect)) benAspectIdx.add(other);
    }
    const withBen = top.filter(s => benAspectIdx.has(s.idx));
    if (withBen.length === 1) {
      top = withBen;
      note.push('CP3-305 吉照优先：并列中取吉星照者');
    } else if (withBen.length > 1) {
      top = withBen;
      note.push('CP3-305 吉照优先：吉照者仍并列，继续按 TTB-307');
    }
  }
  if (top.length > 1) {
    // TTB-307 近角同宗：距 ASC/MC 更近者优先
    const asc = chart.houses.angles.asc, mc = chart.houses.angles.mc;
    const dAngle = (lon) => {
      const da = Math.abs(dif(lon, asc)), dm = Math.abs(dif(lon, mc));
      return Math.min(da, dm);
    };
    top.sort((a, b) => dAngle(a.lon) - dAngle(b.lon));
    const nearest = dAngle(top[0].lon);
    top = top.filter(s => Math.abs(dAngle(s.lon) - nearest) < 0.5);
    note.push('TTB-307 近角同宗：并列中取距四角最近者');
  }
  return {
    hyleg: hy.found,
    alcocoden: top, // 最终并列（近角同宗后仍并列则全列出，如实）
    maxScore: max,
    note: note.length ? note.join('；') : '双子擢水星0° 为 dignity_tables 存疑标注（见数据注释）',
  };
}

/**
 * A 域本命固定星判据（CP3-316/317/326/381/385）
 * 富证：日月近善性恒星（CP3-316）；贫证：福点近凶暴恒星（CP3-317）；
 * 暴死证：日月近凶暴恒星（CP3-385）、1宫主/8宫主近凶暴恒星（CP3-385，原文分别要求落8宫/落升点，此处放宽记"近恒星"一证并标注）；
 * 健康反证：升主近凶暴恒星（CP3-326，与暴死证合并计）
 * 工程参数（标注）："近"=±2°（原文未给数值，与 BT-017 同口径）；
 *   凶暴恒星以 BO-100 表含 T 性条目 + Algol 代理（Ptolemy 完整凶暴星表未入库）
 * 返回 [{w, f, d, s}]；权重：证 +1 / 反证 -1
 */
function fixedStarNativity(chart) {
  const out = [];
  const orb = 2;
  const sun = chart.planets.find(p => p.idx === 0);
  const moon = chart.planets.find(p => p.idx === 1);
  const fortune = lotOfFortune(chart);
  const ascSignIdx = Math.floor(chart.houses.angles.asc / 30);
  const domTbl = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../data/dignity_tables.json'), 'utf-8')).tables.domicile;
  const ascRulerIdx = domTbl[ascSignIdx];
  const ascRuler = chart.planets.find(p => p.idx === ascRulerIdx);
  const cusp8 = chart.houses.cuspsRaw[7];
  const r8Idx = domTbl[Math.floor(cusp8 / 30)];
  const ruler8 = chart.planets.find(p => p.idx === r8Idx);

  const pushHits = (scope, planet, lon, kind, w, cp) => {
    for (const s of nearStars(lon, orb)) {
      const ben = isBenefic(s), mal = isMalefic(s);
      if (kind === '吉' && !ben) continue;
      if (kind === '凶' && !mal) continue;
      out.push({ w, f: `${scope}近${s.zh}（${ben && mal ? '吉凶混合' : (mal ? '凶性' : '吉性')}恒星）`, d: `距${Math.abs(dif(lon, s.lonModern)).toFixed(1)}°（"近"=±2°工程口径）`, s: cp });
    }
  };
  // 富证：日月近善性恒星（CP3-316）
  if (sun) pushHits('太阳', sun, sun.lon, '吉', 1, 'CP3-316');
  if (moon) pushHits('月亮', moon, moon.lon, '吉', 1, 'CP3-316');
  // 暴死证：日月近凶暴恒星（CP3-385）
  if (sun) pushHits('太阳', sun, sun.lon, '凶', -1, 'CP3-385');
  if (moon) pushHits('月亮', moon, moon.lon, '凶', -1, 'CP3-385');
  // 贫证：福点近凶暴恒星（CP3-317）
  pushHits('福点', null, fortune, '凶', -1, 'CP3-317');
  // 暴死/健康反证：升主近凶暴恒星（CP3-385 需1宫主落8宫才全验；CP3-326 健康反证）——合并计一条
  if (ascRuler && ascRulerIdx != null && ascRulerIdx <= 6) {
    for (const s of nearStars(ascRuler.lon, orb)) {
      if (isMalefic(s)) {
        out.push({ w: -1, f: `升主（${ascRuler.zh}）近凶暴恒星${s.zh}`, d: `距${Math.abs(dif(ascRuler.lon, s.lonModern)).toFixed(1)}°；CP3-385 原文需1宫主落8宫、CP3-326 健康反证，此处合并记一证（放宽标注）`, s: 'CP3-385/CP3-326' });
      }
    }
  }
  // 暴死证：8宫主近凶暴恒星（CP3-385 原文需8宫主弱落升点，此处放宽）
  if (ruler8 && r8Idx != null && r8Idx <= 6) {
    for (const s of nearStars(ruler8.lon, orb)) {
      if (isMalefic(s)) {
        out.push({ w: -1, f: `8宫主（${ruler8.zh}）近凶暴恒星${s.zh}`, d: `距${Math.abs(dif(ruler8.lon, s.lonModern)).toFixed(1)}°；CP3-385 原文需8宫主弱落升点，此处放宽记一证`, s: 'CP3-385' });
      }
    }
  }
  return out;
}

// BO-129 云雾星眼疾（Bonatti 第129考量；辅证 42721 月亮体型目疾条 notes 鬼宿/昴宿）。
// 云雾星清单（原文例举+notes）：Althazaic=毕宿五、Head of Gemini=双子之首(北河二)、
//   drops of the Lion=狮心之滴(轩辕十四)、Place of Falling into the Water=宝瓶倾水之落水处
//   （工程口径：Situla 宝瓶κ 主判 + Sadachbia 宝瓶γ 区域候选）、Praesepe 鬼宿、Alcyone 昴宿。
const NEBULOUS_STARS = [
  { name: 'Aldebaran', zh: '毕宿五' },
  { name: 'Castor', zh: '双子之首·北河二' },
  { name: 'Regulus', zh: '狮心之滴·轩辕十四' },
  { name: 'Praesepe', zh: '鬼宿' },
  { name: 'Alcyone', zh: '昴宿' },
  { name: 'Situla', zh: '落水处·宝瓶κ' },
  { name: 'Sadachbia', zh: '落水处·宝瓶γ（区域候选）' },
];

/**
 * 云雾星眼疾判定（BO-129）：
 * 月冲日（对冲容许 8° 工程口径，原文未给数值）且光体距云雾星黄经黄纬均 10 分内 → 眼疾不可救；
 * 月西没角宫 + 土火亦西没不远离（8° 工程口径）/角宫冲日 → 临终双盲；
 * 只一光体合云雾星 → 失一目（日合：男右女左；月合：男左女右）。
 * 西没=行星在日东（BO-054 口径：晨升=在日西）。
 * @returns {{hit:boolean, level?:string, detail:string, moonHits:Array, sunHits:Array}}
 */
function eyeDisease(chart) {
  const byIdx = Object.fromEntries((chart.planets || []).map(p => [p.idx, p]));
  const moon = byIdx[1], sun = byIdx[0];
  if (!moon || !sun) return { hit: false, detail: '无日月数据' };
  const opp = Math.abs(dif(moon.lon, sun.lon + 180));
  if (opp > 8) return { hit: false, detail: `月亮未冲日（距对冲点 ${opp.toFixed(1)}°，对冲容许 8° 工程口径原文未给）` };
  const stars = (chart.meta && chart.meta.nebulousStars) || [];
  const near = (p, s) => Math.abs(dif(p.lon, s.lon)) <= 10 / 60 && Math.abs(p.lat - s.lat) <= 10 / 60;
  const moonHits = stars.filter(s => near(moon, s));
  const sunHits = stars.filter(s => near(sun, s));
  if (!moonHits.length && !sunHits.length) {
    return { hit: false, detail: '月冲日成立但光体距云雾星均超 10′（黄经+黄纬），不判眼疾', moonHits: [], sunHits: [] };
  }
  const isWest = p => dif(p.lon, sun.lon) > 0; // 西没=在日东
  const angle = p => [1, 4, 7, 10].includes(p.house);
  const mars = byIdx[4], sat = byIdx[6];
  const blind = !!mars && !!sat && isWest(moon) && angle(moon) && (
    (isWest(mars) && isWest(sat) && Math.abs(dif(mars.lon, moon.lon)) <= 8 && Math.abs(dif(sat.lon, moon.lon)) <= 8) ||
    ((angle(mars) && Math.abs(dif(mars.lon, sun.lon + 180)) <= 8) || (angle(sat) && Math.abs(dif(sat.lon, sun.lon + 180)) <= 8))
  );
  if (blind) return { hit: true, level: '双盲', detail: '月西没角宫且土火西没不远离/角宫冲日——临终双目皆盲', moonHits, sunHits };
  if (moonHits.length && !sunHits.length) return { hit: true, level: '失一目', detail: `月合云雾星（${moonHits.map(s => s.zh).join('、')}）黄经黄纬 10′内——失一目（男左眼、女右眼）`, moonHits, sunHits };
  if (!moonHits.length && sunHits.length) return { hit: true, level: '失一目', detail: `日合云雾星（${sunHits.map(s => s.zh).join('、')}）黄经黄纬 10′内——失一目（男右眼、女左眼）`, moonHits, sunHits };
  return { hit: true, level: '眼疾不可救', detail: `月冲日且光体合云雾星（月：${moonHits.map(s => s.zh).join('、')}；日：${sunHits.map(s => s.zh).join('、')}）——眼疾人力医药不可救`, moonHits, sunHits };
}

/**
 * 升点度数性质（映射H-度数性质表，Clavis 基础教义卷 Part I）：
 * 升度明=貌清、暗=肤晦、虚度=心智浅；问盗贼/胎儿性别看度数阴阳（表原注）。
 * 工程口径：度数区间含端点（如 1-3暗=度数1、2、3）；仅判升点，深陷/减损/增财为原文图像未数字化不判。
 * @returns {{sign:string, deg:number, 阴阳:string, 明暗:string, ascLon:number}}
 */
function ascDegreeNature(chart) {
  const asc = chart.houses.angles.asc;
  const norm = ((asc % 360) + 360) % 360;
  const signIdx = Math.floor(norm / 30);
  const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '宝瓶', '双鱼'];
  const sign = SIGNS[signIdx];
  const deg = Math.floor(norm % 30) + 1; // 度数 1-30
  const n = DEGREE_NATURES[sign] || {};
  const parse = (spec) => {
    const out = [];
    for (const seg of spec.split('/')) {
      const m = /^(\d+)-(\d+)(.+)$/.exec(seg.trim());
      if (m) { for (let d = Number(m[1]); d <= Number(m[2]); d++) out[d] = m[3]; }
      else { const s = /^(\d+)(.+)$/.exec(seg.trim()); if (s) out[Number(s[1])] = s[2]; }
    }
    return out;
  };
  const yang = parse(n['阴阳度'] || '');
  const bright = parse(n['明暗度'] || '');
  return { sign, deg, 阴阳: yang[deg] || '—', 明暗: bright[deg] || '—', ascLon: asc, unscored: ['深陷/减损(Azimene)/增财度已数字化于 clavis_degree_table.json（第四十三段）；本判据仅貌相/心智，深陷减损见 C 域月亮阻碍或另行接入'] };
}

// 传统守护星映射（行星 index：0日 1月 2水 3金 4火 5木 6土）
const RULER_OF = { 白羊: 4, 金牛: 3, 双子: 2, 巨蟹: 1, 狮子: 0, 处女: 2, 天秤: 3, 天蝎: 4, 射手: 5, 摩羯: 6, 宝瓶: 6, 双鱼: 5 };
const SIGNS_ZH = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '宝瓶', '双鱼'];

/**
 * 增财度判据（Clavis p30 表用法第 6 条）：增财度临 2 宫头，或财帛征象星（2 宫主）落于增财度数 → 主富/聚财。
 * 来源：clavis_degree_table.json fortune 列（每座 Fortune 度数清单，数字化自 Clavis 原书）。
 * 工程口径：整度匹配（度 1-30）；2 宫主=2 宫头星座传统守护星。
 * @returns {{hits:Array<{where:string,sign:string,deg:number}>, note:string}}
 */
function fortuneDegreeHit(chart) {
  const hits = [];
  const cusps = chart.houses.cuspsRaw || [];
  const cusp2 = cusps[1];
  if (cusp2 != null) {
    const n2 = ((cusp2 % 360) + 360) % 360;
    const si = Math.floor(n2 / 30), deg = Math.floor(n2 % 30) + 1;
    const row = CLT_ROWS[SIGNS_ZH[si]];
    if (row && (row.Male.fortune.includes(deg) || row.Femi.fortune.includes(deg))) {
      hits.push({ where: '2宫头', sign: SIGNS_ZH[si], deg });
    }
  }
  // 2 宫主：2 宫头星座传统守护星，检查其落点度数
  if (cusp2 != null) {
    const si2 = Math.floor((((cusp2 % 360) + 360) % 360) / 30);
    const rulerIdx = RULER_OF[SIGNS_ZH[si2]];
    const p = (chart.planets || []).find(x => x.idx === rulerIdx);
    if (p) {
      const np = ((p.lon % 360) + 360) % 360;
      const si = Math.floor(np / 30), deg = Math.floor(np % 30) + 1;
      const row = CLT_ROWS[SIGNS_ZH[si]];
      if (row && (row.Male.fortune.includes(deg) || row.Femi.fortune.includes(deg))) {
        hits.push({ where: '2宫主', sign: SIGNS_ZH[si], deg });
      }
    }
  }
  return { hits, note: hits.length ? '增财度临 2 宫头或财帛主落增财度：主富、聚财（Clavis 表用法#6；整度匹配）' : '无增财度命中（Clavis p30 fortune 列）' };
}

// 宫序环（1-12 循环，±1 得相邻宫）
const ringH = (h, d) => ((((h - 1 + d) % 12) + 12) % 12) + 1;

/**
 * 寿命长短五判据（CP3-303 / 规则库 20959 原文，Clavis CHAP X SECT I）：
 * I 升点或其主受凶星/8宫主克照，或1宫主焦伤/游走/逆行/落果宫；
 * II 土火合于升或自1-7对冲，或升度逢蚀、凶性恒星并升；
 * III 时主光体（日/夜生光体）于生时受克或蚀；
 * IV 月在4/6/8/12宫与土火成刑冲、或被土火（或日火）包围而无吉星吉照；
 * V 多星落6/8/12而1宫主不照，或日月升点无吉照。
 * 反证：五者皆不验且吉星吉照升点或其主 → 可望寿长。
 * 工程口径：克照/吉照=合/刑/冲（0/90/180±8°）、焦伤=合日 15° 内、包围=两侧 ±15°（与 conditions 夹限同）、
 *   果宫=3/6/9/12、游走=无本然尊贵（essential 空）、多星=≥2 行星；"升度逢蚀/光体受蚀"无蚀数据标注未实现。
 * @returns {{hits:Array<{n:string,detail:string}>, count:number, verdict:string, unscored:string[]}}
 */
function longevitySigns(chart) {
  const byIdx = Object.fromEntries((chart.planets || []).map(p => [p.idx, p]));
  const sun = byIdx[0], moon = byIdx[1], mars = byIdx[4], sat = byIdx[5], jup = byIdx[2], ven = byIdx[3];
  const asc = chart.houses.angles.asc;
  const isDay = chart.meta.isDay === 'day';
  const lum = isDay ? sun : moon;
  const orb = 8, comb = 15, ring = 15;
  const domTbl = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../data/dignity_tables.json'), 'utf-8')).tables.domicile;
  const cusps = chart.houses.cuspsRaw || [];
  const rulerOf = (cuspLon) => domTbl[Math.floor((((cuspLon % 360) + 360) % 360) / 30)];
  const r1Idx = rulerOf(asc), r8Idx = rulerOf(cusps[7]);
  const r1 = byIdx[r1Idx], r8 = byIdx[r8Idx];
  // 克照：与凶星（土火）或8宫主 合/刑/冲
  const afflicted = (p, extra) => {
    const foes = [mars, sat].filter(Boolean);
    if (extra) foes.push(extra);
    return foes.some(f => {
      const a = Math.abs(dif(p.lon, f.lon));
      return a <= orb || Math.abs(a - 90) <= orb || Math.abs(a - 180) <= orb;
    });
  };
  const goodAspect = (p, q) => {
    const a = Math.abs(dif(p.lon, q.lon));
    return a <= orb || Math.abs(a - 60) <= orb || Math.abs(a - 120) <= orb;
  };
  const hits = [];
  const unscored = [];
  // I
  const iBads = [];
  if (r1) {
    if (afflicted({ lon: asc }, null)) iBads.push('升点受克照');
    if (afflicted(r1, r8)) iBads.push('升主受克照');
    if (r1Idx != null && r1Idx <= 6) {
      if (Math.abs(dif(r1.lon, sun.lon)) <= comb) iBads.push(`1宫主焦伤（合日 ${Math.abs(dif(r1.lon, sun.lon)).toFixed(1)}°）`);
      if (!r1.essential || r1.essential.length === 0) iBads.push('1宫主游走（无本然尊贵）');
      if (r1.retrograde) iBads.push('1宫主逆行');
      if ([3, 6, 9, 12].includes(r1.house)) iBads.push(`1宫主落果宫（${r1.house}宫）`);
    }
  }
  if (iBads.length) hits.push({ n: 'I', detail: iBads.join('；') });
  // II
  const iiBads = [];
  for (const f of [mars, sat].filter(Boolean)) {
    const a = Math.abs(dif(f.lon, asc));
    if (a <= orb) iiBads.push(`${f.zh}合升（${a.toFixed(1)}°）`);
    if (Math.abs(a - 180) <= orb || Math.abs(a - 90) <= orb) iiBads.push(`${f.zh}自1/7对冲升点`);
  }
  for (const s of nearStars(asc, 2)) if (isMalefic(s)) iiBads.push(`升度并凶性恒星${s.zh}`);
  if (iiBads.length) hits.push({ n: 'II', detail: iiBads.join('；') });
  if (!iiBads.length) unscored.push('II 升度逢蚀子项未实现（本命盘无蚀数据）');
  // III
  if (lum) {
    const iiiBads = [];
    if (afflicted(lum, null)) iiiBads.push(`时主光体（${lum.zh}）受克照`);
    if (iiiBads.length) hits.push({ n: 'III', detail: iiiBads.join('；') });
    unscored.push('III 光体受蚀子项未实现（无蚀数据）');
  }
  // IV
  if (moon) {
    const ivBads = [];
    if ([4, 6, 8, 12].includes(moon.house)) {
      if (afflicted(moon, null)) ivBads.push(`月在${moon.house}宫与土火刑冲`);
      // 被土火（或日火）包围：两侧 ±15° 各有凶（夹限工程口径与 conditions 同）
      const around = [mars, sat, sun].filter(Boolean).map(f => ({ f, d: dif(f.lon, moon.lon) }));
      const neg = around.filter(x => x.d < 0), pos = around.filter(x => x.d > 0);
      if (neg.length && pos.length) ivBads.push(`月被${around.map(x => x.f.zh || '行星' + x.f.idx).join('、')}包围（±${ring}° 夹限工程口径）`);
    }
    if (ivBads.length) {
      const hasGood = [jup, ven].filter(Boolean).some(b => goodAspect(moon, b));
      if (!hasGood) hits.push({ n: 'IV', detail: ivBads.join('；') + '；且无吉星吉照' });
      else hits.push({ n: 'IV', detail: ivBads.join('；') + '（有吉星吉照，从轻）' });
    }
  }
  // V
  const cadent = chart.planets.filter(p => [6, 8, 12].includes(p.house));
  if (cadent.length >= 2) {
    const vBads = [];
    if (r1) {
      const noBehold = cadent.every(p => !goodAspect(r1, p));
      if (noBehold) vBads.push(`多星（${cadent.map(p => p.zh).join('、')}）落6/8/12且1宫主不照`);
    }
    const lumGood = (lum && [jup, ven].filter(Boolean).some(b => goodAspect(lum, b)));
    const ascGood = [jup, ven].filter(Boolean).some(b => goodAspect({ lon: asc }, b));
    if (!lumGood && !ascGood) vBads.push('日月/升点无吉星吉照');
    if (vBads.length) hits.push({ n: 'V', detail: vBads.join('；') });
  }
  // 反证：五者皆不验 + 吉星吉照升点或其主
  let verdict;
  if (hits.length === 0) {
    const ascGood = [jup, ven].filter(Boolean).some(b => goodAspect({ lon: asc }, b));
    const r1Good = r1 ? [jup, ven].filter(Boolean).some(b => goodAspect(r1, b)) : false;
    verdict = (ascGood || r1Good) ? '长寿望（五判据皆不验且吉星吉照升点或其主）' : '五判据皆不验（无吉照反证，寿元中性）';
  } else {
    verdict = `短寿险（五判据验 ${hits.length}/5）`;
  }
  return { hits, count: hits.length, verdict, unscored, source: 'CP3-303（Clavis CHAP X SECT I 寿命五判据）' };
}

/**
 * 父母荣华（TTB-311 / 规则库 50194 原文）：
 * 光体被同宗吉星环绕（同宫或次宫）＝父母处境显耀——尤以晨星侍日、昏星侍月且光体自身佳位；
 * 又土金皆东出且在其正面或角位＝父母显赫幸福。
 * 工程口径：同宗吉星=木/金（吉性）；环绕=与光体同宫或相邻宫（±1 宫）有木/金；东出=晨升（dif<0，BO-054 口径）；角位=1/4/7/10。
 * @returns {{hit:boolean, moonHonor:boolean, sunHonor:boolean, satVenHonor:boolean, detail:string}}
 */
function parentHonor(chart) {
  const byIdx = Object.fromEntries((chart.planets || []).map(p => [p.idx, p]));
  const sun = byIdx[0], moon = byIdx[1], jup = byIdx[2], ven = byIdx[3], sat = byIdx[5];
  const ben = [jup, ven].filter(Boolean);
  const around = (h) => [h, ringH(h, 1), ringH(h, -1)];
  const moonHonor = !!moon && ben.some(b => b.house != null && around(moon.house).includes(b.house));
  const sunHonor = !!sun && ben.some(b => b.house != null && around(sun.house).includes(b.house));
  const east = p => p && dif(p.lon, sun.lon) < 0; // 东出=晨升（dif<0）
  const angle = p => p && [1, 4, 7, 10].includes(p.house);
  const satVenHonor = !!sat && !!ven && east(sat) && east(ven) && angle(sat) && angle(ven);
  const bits = [];
  if (moonHonor) bits.push('月亮（昏星）同宫/次宫有吉星环绕');
  if (sunHonor) bits.push('太阳（晨星）同宫/次宫有吉星环绕');
  if (satVenHonor) bits.push('土金皆东出且落角位');
  return {
    hit: moonHonor || sunHonor || satVenHonor,
    moonHonor, sunHonor, satVenHonor,
    detail: bits.length ? '父母处境显耀：' + bits.join('；') : '无父母荣华命中（光体同宫/次宫无吉星环绕，土金不同时东出角位）',
    source: 'TTB-311（Tetrabiblos Book III 父母卷）',
  };
}

module.exports = { findHyleg, findAlcocoden, lotOfFortune, houseOfLon, prenatalLunation, fixedStarNativity, ascDegreeNature, fortuneDegreeHit, eyeDisease, NEBULOUS_STARS, longevitySigns, parentHonor, planetaryJoys, sevenLots };

// ---- 行星点 7 个（AlBiruni 映射-行星点，昼/夜公式反转；子表原文逐式）----
// Fortune 福点: 昼 Asc+月-日 / 夜 Asc+日-月；Spirit 灵点: 昼 Asc+日-月 / 夜 Asc+月-日；
// Friendship 友谊: Asc±(Spirit-Fortune)；Despair 绝望: Asc±(Fortune-Spirit)；
// Captivity 囚禁: Asc±(Fortune-Saturn)；Victory 胜利: Asc±(Jupiter-Spirit)；Valour 勇气: Asc±(Fortune-Mars)
function sevenLots(chart) {
  const asc = chart.houses.cuspsRaw[0];
  const lon = idx => { const p = chart.planets.find(x => x.idx === idx); return p ? p.lon : 0; };
  const sun = lon(0), moon = lon(1), sat = lon(6), jup = lon(5), mars = lon(4);
  const day = chart.meta.isDay === 'day';
  const fortune = day ? asc + moon - sun : asc + sun - moon;
  const spirit = day ? asc + sun - moon : asc + moon - sun;
  const mk = (name, zh, lonRaw, formula) => ({ name, zh, lon: normLon(lonRaw), formula });
  return [
    mk('Fortune', '福点', fortune, `Asc+${day ? 'Moon-Sun' : 'Sun-Moon'}（昼/夜反转）`),
    mk('Spirit', '灵点', spirit, `Asc+${day ? 'Sun-Moon' : 'Moon-Sun'}（昼/夜反转）`),
    mk('Friendship', '友谊点', day ? asc + spirit - fortune : asc + fortune - spirit, 'Asc±(Spirit-Fortune)'),
    mk('Despair', '绝望点', day ? asc + fortune - spirit : asc + spirit - fortune, 'Asc±(Fortune-Spirit)'),
    mk('Captivity', '囚禁点', day ? asc + fortune - sat : asc + sat - fortune, 'Asc±(Fortune-Saturn)'),
    mk('Victory', '胜利点', day ? asc + jup - spirit : asc + spirit - jup, 'Asc±(Jupiter-Spirit)'),
    mk('Valour', '勇气点', day ? asc + fortune - mars : asc + mars - fortune, 'Asc±(Fortune-Mars)'),
  ];
}
// Bonatti 宫位喜乐：水星1/月亮3/金星5/火星6/太阳9/木星11/土星12
const JOY_HOUSE = { 2: 1, 1: 3, 3: 5, 4: 6, 0: 9, 5: 11, 6: 12 };
// Dorotheus 星座喜乐：土星水瓶10/木星射手8/火星天蝎7/金星金牛1/水星处女5（日/月无星座喜乐）
const JOY_SIGN = { 6: 10, 5: 8, 4: 7, 3: 1, 2: 5 };
// 日行星=日/水/木/土、夜行星=月/金/火（子表 映射-行星喜乐 附加列"昼夜喜乐"标注）
const DAY_PLANETS = new Set([0, 2, 5, 6]);
const NIGHT_PLANETS = new Set([1, 3, 4]);
function planetaryJoys(chart) {
  const out = [];
  const day = chart.meta.isDay === 'day';
  const sun = chart.planets.find(p => p.idx === 0);
  // 东出=晨升（dif(p.lon,sun.lon)<0，与 TTB-311 东出同口径）
  const east = p => !!sun && dif(p.lon, sun.lon) < 0;
  for (const p of chart.planets) {
    const jh = JOY_HOUSE[p.idx];
    if (jh && p.house === jh) out.push({ idx: p.idx, zh: p.zh, kind: '宫位喜乐', detail: `落喜乐宫 ${jh} 宫（Bonatti）`, source: 'Bonatti146-映射-行星喜乐', weight: 1 });
    const js = JOY_SIGN[p.idx];
    if (js !== undefined && Math.floor(normLon(p.lon) / 30) === js) out.push({ idx: p.idx, zh: p.zh, kind: '星座喜乐', detail: `落喜乐星座（第${js + 1}座，Dorotheus）`, source: 'Dorotheus卷一-庙与喜乐表', weight: 0.5 });
    // 昼夜喜乐（子表附加列）：日行星昼东出 / 夜行星夜西没
    if (DAY_PLANETS.has(p.idx) && day && east(p)) out.push({ idx: p.idx, zh: p.zh, kind: '昼夜喜乐', detail: '日行星昼生且东出（晨升）', source: 'Bonatti146-映射-行星喜乐-昼夜列', weight: 0.5 });
    if (NIGHT_PLANETS.has(p.idx) && !day && !east(p)) out.push({ idx: p.idx, zh: p.zh, kind: '昼夜喜乐', detail: '夜行星夜生且西没（晚落）', source: 'Bonatti146-映射-行星喜乐-昼夜列', weight: 0.5 });
  }
  return out;
}
function normLon(l) { return ((l % 360) + 360) % 360; }
