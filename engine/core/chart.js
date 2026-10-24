// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 排盘编排（输入 → 行星/宫位/落宫/相位/尊贵 → 结构化星盘）
// 支持盘型: natal | transit | progressed | tertiary | solar-return | solar-arc
'use strict';
const sweCore = require('./swe');
const { PLANETS, PLANET_LIST, HOUSE_SYSTEMS } = require('./constants');
const { norm, dif, formatEcliptic, houseOf } = require('./ecliptic');
const { computeAspects, detachedPlanets, platicSeparations } = require('./aspects');
const { essentialDignities, dignityScore, termsCompare } = require('./dignity');
const { planetaryConditions, accidentalScore } = require('./conditions');
const { findAlmuten } = require('./almuten');
const { findHyleg, findAlcocoden, prenatalLunation, fixedStarNativity, ascDegreeNature, fortuneDegreeHit, eyeDisease, NEBULOUS_STARS, longevitySigns, parentHonor, planetaryJoys, sevenLots } = require('./life');
const { computeArabicPoints } = require('./arabic_lots');
const { progressedJd, tertiaryJd, solarReturnJd, lunarReturnJd, solarArc } = require('./progress');

const TYPES = ['natal', 'transit', 'progressed', 'tertiary', 'solar-return', 'lunar-return', 'solar-arc'];

/**
 * 排盘。
 * @param {object} input
 *  基线(本命): {year, month, day, hour, minute, tzOffsetHours, lat, lon, calendar}
 *  盘型: type='natal'
 *    transit:      {txYear..txMinute 或 useNow:true}
 *    progressed:   {years} 次限（行星推进入本命宫位，默认；useProgressedHouses=true 则宫位也按推进时刻）
 *    tertiary:     {years} 三限（同上）
 *    solar-return: {returnYear} 日返（全盘重排）
 *    solar-arc:    {years} 太阳弧（行星=本命+弧，宫位=本命，MC/ASC 同步加弧）
 *  显示: {houseSystem='P', orbSet='modern', includeMinor=false}
 */
async function computeChart(input) {
  const swe = await sweCore.getSwe();
  const type = TYPES.includes(input.type) ? input.type : 'natal';

  const tz = input.tzOffsetHours ?? 8;
  const hour = (input.hour ?? 0) + (input.minute ?? 0) / 60;
  const utHour = hour - tz;
  const natalJd = await sweCore.localToJd({
    year: input.year, month: input.month, day: input.day,
    hour: utHour, calendar: input.calendar,
  });

  // ---- 确定排盘时刻 jd 与 宫位时刻 houseJd ----
  let jd = natalJd;
  let houseJd = natalJd;
  let years = input.years ?? 30;
  let arc = 0;

  if (type === 'transit') {
    if (input.useNow) {
      const n = new Date();
      jd = swe.julday(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(),
        n.getUTCHours() + n.getUTCMinutes() / 60);
    } else {
      const txHour = (input.txHour ?? 12) + (input.txMinute ?? 0) / 60;
      const txUt = txHour - (input.txTzOffsetHours ?? tz);
      jd = await sweCore.localToJd({
        year: input.txYear ?? input.year, month: input.txMonth ?? input.month,
        day: input.txDay ?? input.day, hour: txUt, calendar: input.calendar,
      });
    }
    houseJd = jd;
  } else if (type === 'progressed') {
    jd = progressedJd(natalJd, years);
    houseJd = input.useProgressedHouses ? jd : natalJd;
  } else if (type === 'tertiary') {
    jd = tertiaryJd(natalJd, years);
    houseJd = input.useProgressedHouses ? jd : natalJd;
  } else if (type === 'solar-return') {
    const natalSun = swe.calc_ut(natalJd, swe.SE_SUN, swe.SEFLG_SWIEPH | swe.SEFLG_SPEED);
    jd = await solarReturnJd(swe, natalJd, natalSun[0]);
    houseJd = jd;
  } else if (type === 'lunar-return') {
    const natalMoon = swe.calc_ut(natalJd, swe.SE_MOON, swe.SEFLG_SWIEPH | swe.SEFLG_SPEED);
    jd = await lunarReturnJd(swe, natalJd, natalMoon[0]);
    houseJd = jd;
  } else if (type === 'solar-arc') {
    arc = await solarArc(swe, natalJd, years);
    jd = natalJd;
    houseJd = natalJd;
  }

  // ---- 行星位置 ----
  const SIDEREAL = input.zodiac === 'sidereal';
  if (SIDEREAL) {
    // 恒星黄道：先设岁差模式（Lahiri=SE_SIDM_LAHIRI=1，印度通行），行星计算加 SEFLG_SIDEREAL
    try { swe.set_sid_mode(swe.SE_SIDM_LAHIRI); } catch (e) { /* wasm 低版本忽略 */ }
  }
  const BFLAG = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED | (SIDEREAL ? swe.SEFLG_SIDEREAL : 0);
  const planets = [];
  for (const p of PLANET_LIST) {
    let lon, lat, dist, speed;
    if (type === 'solar-arc') {
      // 太阳弧：本命位置整体加弧；速度取本命速度（近似）
      const r0 = swe.calc_ut(natalJd, p.idx, BFLAG);
      lon = norm(r0[0] + arc); lat = r0[1]; dist = r0[2]; speed = r0[3];
    } else {
      const r = swe.calc_ut(jd, p.idx, BFLAG);
      lon = r[0]; lat = r[1]; dist = r[2]; speed = r[3];
    }
    planets.push({
      idx: p.idx, en: p.en, zh: p.zh, glyph: p.glyph,
      lon, lat, dist, speed,
      retrograde: speed < 0,
      position: formatEcliptic(lon),
    });
  }
  const byIdx = Object.fromEntries(planets.map(p => [p.idx, p]));

  // ---- 宫位（按 houseJd）----
  const hs = input.houseSystem || 'P';
  const h = swe.houses(houseJd, input.lat, input.lon, hs);
  let cusps = [];
  for (let i = 1; i <= 12; i++) cusps.push(h.cusps[i]);
  let asc = h.ascmc[0], mc = h.ascmc[1];
  if (SIDEREAL) {
    // 恒星黄道：宫位角度同步减岁差（行星已用 SEFLG_SIDEREAL；宫位无 flag，手动减 ayanamsa）
    const ayan = swe.get_ayanamsa_ut ? swe.get_ayanamsa_ut(houseJd) : swe.get_ayanamsa(houseJd);
    cusps = cusps.map(c => norm(c - ayan));
    asc = norm(asc - ayan); mc = norm(mc - ayan);
  }
  const dc = norm(asc + 180), ic = norm(mc + 180);
  const houses = {
    system: hs, systemName: HOUSE_SYSTEMS[hs] || hs,
    basedOn: houseJd === natalJd ? 'natal' : (houseJd === jd ? 'chart-time' : 'natal'),
    cusps: cusps.map(formatEcliptic),
    cuspsRaw: cusps,
    angles: {
      asc, mc, dc, ic,
      ascF: formatEcliptic(asc), mcF: formatEcliptic(mc),
      dcF: formatEcliptic(dc), icF: formatEcliptic(ic),
    },
  };

  // ---- 落宫 ----
  for (const p of planets) p.house = houseOf(p.lon, cusps);

  // ---- 昼/夜（按本盘太阳 vs 本盘升点）----
  const sunLon = byIdx[0].lon;
  const sunArc = dif(asc, sunLon);
  const isDay = sunArc >= 0 && sunArc < 180;

  // ---- 相位 ----
  const aspectList = computeAspects(
    planets.map(p => ({ idx: p.idx, lon: p.lon, speed: p.speed })),
    input.orbSet || 'modern', input.includeMinor || false
  );
  // ---- 行星脱离判定（映射E-术语27项#3：应用侧超标准容许且分离侧超轨道半径和=全脱离）----
  const posLon = planets.map(p => ({ idx: p.idx, lon: p.lon, speed: p.speed }));
  for (const d of detachedPlanets(posLon, input.orbSet || 'modern', input.includeMinor || false)) {
    const p = planets.find(x => x.idx === d.idx);
    if (p) { p.detached = d.detached; p.detachNote = d.note; }
  }
  // ---- 分离侧 platic 相位附列表（映射E#3：半径和内仍相连；判读模块可消费，不进主 aspects）----
  const platicAspects = platicSeparations(posLon, input.orbSet || 'modern', input.includeMinor || false);

  // ---- 尊贵（传统七政 0-6）----
  for (const p of planets) {
    if (p.idx <= 6) {
      p.essential = essentialDignities(p.idx, p.lon, isDay);
      p.dignityScore = dignityScore(p.idx, p.lon, isDay);
      p.termsCompare = termsCompare(p.lon); // Lilly vs Valens 五十界对照
    } else {
      p.essential = [];
      p.dignityScore = 0;
    }
  }

  const chartObj = {
    meta: {
      type,
      input: { ...input, hour, utHour },
      natalJd, chartJd: jd, houseJd,
      years: (type === 'progressed' || type === 'tertiary' || type === 'solar-arc') ? years : undefined,
      solarArcDeg: type === 'solar-arc' ? arc : undefined,
      isDay: isDay ? 'day' : 'night',
      engine: { swisseph: swe.version(), note: 'Swiss Ephemeris wasm 移植' },
    },
    planets, houses, aspects: aspectList, platicAspects,
  };
  // 产前朔望（仅本命盘：出生前最近一次新月，hyleg 候选链末端；牛顿迭代 swe 计算）
  if (type === 'natal') {
    chartObj.meta.prenatalLunation = prenatalLunation(swe, natalJd);
    // BO-129 云雾星眼疾：swe_fixstar 按名查云雾星黄经黄纬（绕开 fixed_stars.json 无星名）→ 判定
    chartObj.meta.nebulousStars = [];
    for (const s of NEBULOUS_STARS) {
      const r = swe.fixstar(s.name, natalJd, swe.SEFLG_SWIEPH);
      if (r) chartObj.meta.nebulousStars.push({ name: s.name, zh: s.zh, lon: r[0], lat: r[1] });
    }
    chartObj.meta.eyeDisease = eyeDisease(chartObj);
    // CP3-303 寿命五判据 + TTB-311 父母荣华（A 域本命健康/父母）
    chartObj.meta.longevitySigns = longevitySigns(chartObj);
    chartObj.meta.parentHonor = parentHonor(chartObj);
    // 行星喜乐（Bonatti146 宫位版 + Dorotheus卷一 星座版）——A 域行星状态增强
    chartObj.meta.planetaryJoys = planetaryJoys(chartObj);
    // 行星点 7 个（AlBiruni 映射-行星点，昼/夜反转）——A 域阿拉伯点
    chartObj.meta.sevenLots = sevenLots(chartObj);
    // 阿拉伯点全表（宫位点 90 + 其他点 10 + 卜卦点 18，AlBiruni；公式解析器，不可算 token 跳过）
    chartObj.meta.arabicPoints = await computeArabicPoints(chartObj);
  }
  // 行星条件（偶然状态）——需完整 chart 后计算
  chartObj.conditions = planetaryConditions(chartObj);
  // 偶然尊贵计分（Clavis CE-042/043）——七政逐颗
  for (const p of chartObj.planets) {
    if (p.idx <= 6) {
      p.accidental = accidentalScore(p, chartObj);
      p.totalScore = (p.dignityScore || 0) + p.accidental.score;
    }
  }
  // Almuten 命主判定（Clavis CP3-504/307）
  chartObj.almuten = findAlmuten(chartObj);
  // Hyleg（寿命主）与 Alcocoden（年限主）：默认 astroak 现代综合口径（方法已声明）
  chartObj.hyleg = findHyleg(chartObj);
  chartObj.alcocoden = findAlcocoden(chartObj, chartObj.hyleg);
  // A 域本命固定星判据（CP3-316/317/326/381/385：富/贫/暴死/健康证）
  if (type === 'natal') {
    chartObj.meta.fixedStars = fixedStarNativity(chartObj);
    chartObj.meta.ascNature = ascDegreeNature(chartObj); // 升点度数性质（映射H：貌相/心智）
    chartObj.meta.fortuneDegrees = fortuneDegreeHit(chartObj); // 增财度（Clavis 表用法#6：临2宫头/财帛主）
  }
  return chartObj;
}

module.exports = { computeChart, TYPES };
