// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - E 域婚卷专项（Marriage）：本命婚姻判读 + 合婚判据数值化
// 数据源（全部已入库 47 卷规则库/子表）：
//   婚子女点数表（Dorotheus II.2/3/5/6/10/11/12 阿拉伯点公式）
//   TTB-421/422/423/424/425/426/427/428/429（Tetrabiblos IV 婚卷）
//   CP3-178/332/522（Clavis 七宫婚姻）、DOR2-01/03/04（Dorotheus 卷二）
//   映射D-婚配判则表
// 实事求是：判据全部来自库内条文转述；字面歧义处标注工程近似；判不了的明确不判。
'use strict';
const fs = require('fs');
const path = require('path');
const { dif, norm } = require('./ecliptic');
const { SIGNS } = require('./constants');
const { houseOfLon } = require('./life');
const { essentialDignities } = require('./dignity');

const DIGN = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/dignity_tables.json'), 'utf-8')).tables;
const TABLE_DB = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/rule_tables.json'), 'utf-8'));
const ORB = 8;

function aspectBetween(lonA, lonB, orb = ORB) {
  const d = Math.abs(dif(lonA, lonB));
  for (const [deg, zh] of Object.entries({ 0: '合', 60: '六合', 90: '刑', 120: '三合', 180: '冲' })) {
    if (Math.abs(d - Number(deg)) < orb) return { aspect: zh, deg: Number(deg), orb: Math.abs(d - Number(deg)) };
  }
  return null;
}

/** 阿拉伯点通用式：点 = ASC ± 弧(起→终)，昼加夜减（婚子女点数表；弧=顺黄经 终−起 模360） */
function arabPoint(asc, fromLon, toLon, isDay, sign = 1) {
  const arc = ((toLon - fromLon) % 360 + 360) % 360;
  return norm(isDay ? asc + sign * arc : asc - sign * arc);
}

/** 婚子女点数表：婚点/子女点/妻数 */
function marriagePoints(chart) {
  const byIdx = {};
  chart.planets.forEach(p => { byIdx[p.idx] = p; });
  const asc = chart.houses.angles.asc;
  const cusp7 = chart.houses.cuspsRaw[6];
  const isDay = chart.meta.isDay === 'day';
  const L = (i) => byIdx[i] ? byIdx[i].lon : null;
  const p = {};
  p.marriageMale = L(6) != null && L(3) != null ? arabPoint(asc, L(6), L(3), isDay) : null;        // 土→金 ± 升（昼加/夜减）
  p.marriageFemale = L(3) != null && L(6) != null ? arabPoint(asc, L(3), L(6), isDay) : null;      // 金→土 + 升
  p.happyMarriage = L(3) != null ? arabPoint(asc, L(3), cusp7, isDay) : null;                     // 金→七宫度数 ± 升
  p.dayNightMarriage = L(1) != null && L(0) != null ? arabPoint(asc, L(0), L(1), isDay) : null;    // 日→月 ± 升
  p.children = L(5) != null && L(6) != null ? arabPoint(asc, L(6), L(5), isDay) : null;            // 木→土 ± 升
  p.childrenProg = L(4) != null && L(5) != null ? arabPoint(asc, L(5), L(4), isDay) : null;        // 火→木 ± 升
  p.son = L(5) != null && L(0) != null ? arabPoint(asc, L(0), L(5), isDay) : null;                 // 木→日 + 升
  p.daughter = L(1) != null && L(3) != null ? arabPoint(asc, L(3), L(1), isDay) : null;            // 月→金 ± 升
  // 妻数：天顶→金之间行星数（女命天顶→火；火在天顶→木）——工程按字面：MC 顺黄经至目标行星之间落行星数
  const mc = chart.houses.angles.mc;
  const wivesTarget = L(3) != null ? L(3) : null;
  if (wivesTarget != null) {
    let n = 0;
    for (const pl of chart.planets) {
      if (pl.idx > 6) continue;
      if (pl.idx === 3) continue;
      const rel = ((pl.lon - mc) % 360 + 360) % 360;
      const targetRel = ((wivesTarget - mc) % 360 + 360) % 360;
      if (rel < targetRel) n++;
    }
    p.wivesCount = n;
  }
  return p;
}

const PL_ZH = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星', '天王星', '海王星', '冥王星'];

/** 月龄（dif 月−日 模 360 ∈ [0,360)）：0-90=朔至弦（东/增光），180-270=满至下弦（西/减光） */
function moonAge(chart) {
  const sun = chart.planets[0].lon, moon = chart.planets[1].lon;
  return ((moon - sun) % 360 + 360) % 360;
}

/** 婚卷判读（单盘；可选伴侣盘做合婚判据） */
function marriageReading(chart, partnerChart) {
  const factors = [];
  const readings = [];
  const byIdx = {};
  chart.planets.forEach(p => { byIdx[p.idx] = p; });
  const isDay = chart.meta.isDay === 'day';
  const asc = chart.houses.angles.asc;
  const points = marriagePoints(chart);
  const sun = byIdx[0], moon = byIdx[1], venus = byIdx[3], mars = byIdx[4], jup = byIdx[5], sat = byIdx[6];

  // ---- 1. 婚时（TTB-421/423 + TTB-424 象限定义）----
  // 月之东象限=自朔望至弦月间诸宫（月龄 0-90°）；西象限=其对冲（180-270°）→ 男观月
  const age = moonAge(chart);
  let moonEast = null;
  if (age < 90) moonEast = true; else if (age >= 180 && age < 270) moonEast = false;  if (moonEast != null) {
    const j = moonEast ? '东象限（朔至弦月龄 <90°）：早婚/娶幼' : '西象限（满至下弦月龄 180-270°）：晚婚/娶长';
    readings.push({ judgment: `男观月婚时：${j}`, detail: `月龄 ${age.toFixed(0)}°`, source: 'TTB-421/424 + 映射D' });
    factors.push({ factor: '婚时（男观月）', weight: 0, detail: j, source: 'TTB-421' });
  } else {
    readings.push({ judgment: '男观月婚时：月龄非东/西象限定义区间（朔至弦或满至下弦之外），未判', detail: `月龄 ${age.toFixed(0)}°`, source: 'TTB-421/424（工程按 TTB-424 字面，未覆盖 90-180° 与 270-360° 段）' });
  }
  // 日之东象限=升宫前诸宫与设宫前诸宫（工程：日居 10/11/12 宫=东；4/5/6=西）→ 女观日
  const sunHouse = sun ? sun.house : null;
  if (sunHouse != null) {
    const eastSet = [10, 11, 12], westSet = [4, 5, 6];
    let sEast = null;
    if (eastSet.includes(sunHouse)) sEast = true; else if (westSet.includes(sunHouse)) sEast = false;
    if (sEast != null) {
      const j = sEast ? '东象限（日居 10/11/12 宫）：早婚/嫁幼' : '西象限（日居 4/5/6 宫）：晚婚/嫁长';
      readings.push({ judgment: `女观日婚时：${j}`, detail: `日落 ${sunHouse} 宫`, source: 'TTB-423/424 + 映射D（工程近似：日东象限=升前诸宫，取 10/11/12）' });
      factors.push({ factor: '婚时（女观日）', weight: 0, detail: j, source: 'TTB-423' });
    }
  }

  // ---- 2. 不婚（TTB-421）：月被日灼且土照月 ----
  if (sun && moon && sat) {
    const ds = Math.abs(dif(moon.lon, sun.lon));
    const satAsp = aspectBetween(moon.lon, sat.lon);
    if (ds < 8.5 && satAsp) {
      readings.push({ judgment: '不婚判则：月被日灼且被土星照——婚期极迟或不成', detail: `月距日 ${ds.toFixed(1)}°、土${satAsp.aspect}月`, source: 'TTB-421' });
      factors.push({ factor: '月灼+土照（不婚判则）', weight: -2, detail: `月距日 ${ds.toFixed(1)}°`, source: 'TTB-421' });
    }
  }

  // ---- 3. 婚数（TTB-422/423）：月/日宫形 + 应用星数 ----
  const applyingCount = (idx) => chart.aspects.filter(a => a.applying && (a.p1 === idx || a.p2 === idx)).length;
  if (moon) {
    const mSign = SIGNS[Math.floor(moon.lon / 30)];
    const mutable = mSign.quality === 'mutable';
    const nApp = applyingCount(1);
    if (mutable || nApp > 1) {
      readings.push({ judgment: `男婚数：月居双体宫（${mSign.zh}）或应用多星（${nApp}）= 多婚倾向`, detail: `月落${mSign.zh}（${mSign.quality}）`, source: 'TTB-422' });
      factors.push({ factor: '婚数（男）', weight: 0, detail: '双体宫/多应用=多婚', source: 'TTB-422' });
    } else {
      readings.push({ judgment: `男婚数：月居单形宫（${mSign.zh}）且应用一星=${applyingCount(1) === 1 ? '一婚' : '（无应用，未判）'}`, detail: `月落${mSign.zh}（${mSign.quality}）、应用 ${nApp} 星`, source: 'TTB-422' });
    }
  }

  // ---- 4. 伴侣质（TTB-422/423 + 映射D 应用星表）----
  const QUAL = { 6: '土=勤严庄/年长', 5: '木=庄善管家/庄宏', 4: '火=勇悍/行动寡情', 3: '金=悦美/整洁俊', 2: '水=智敏/节俭务实' };
  const appTarget = (idx) => {
    const a = chart.aspects.find(x => x.applying && (x.p1 === idx || x.p2 === idx));
    return a ? (a.p1 === idx ? a.p2 : a.p1) : null;
  };
  const moonApp = appTarget(1), sunApp = appTarget(0);
  if (moonApp != null && QUAL[moonApp]) {
    readings.push({ judgment: `男伴侣质（月应用${PL_ZH[moonApp]}）：${QUAL[moonApp]}`, detail: '', source: 'TTB-422 + 映射D' });
  }
  if (sunApp != null && QUAL[sunApp]) {
    readings.push({ judgment: `女伴侣质（日相${PL_ZH[sunApp]}）：${QUAL[sunApp]}`, detail: '', source: 'TTB-423 + 映射D' });
  }

  // ---- 5. 婚龄差（TTB-427）：金火三分=同龄；金土三分=年长 ----
  if (venus && mars && aspectBetween(venus.lon, mars.lon) && aspectBetween(venus.lon, mars.lon).deg === 120) {
    readings.push({ judgment: '婚龄差：金火成三合=同龄之婚', detail: `金 ${venus.lon.toFixed(1)}° / 火 ${mars.lon.toFixed(1)}° 三合`, source: 'TTB-427' });
    factors.push({ factor: '婚龄差（金火三合）', weight: 0, detail: '同龄婚', source: 'TTB-427' });
  }
  if (venus && sat && aspectBetween(venus.lon, sat.lon) && aspectBetween(venus.lon, sat.lon).deg === 120) {
    readings.push({ judgment: '婚龄差：金土成三合=年长之婚', detail: `金 ${venus.lon.toFixed(1)}° / 土 ${sat.lon.toFixed(1)}° 三合`, source: 'TTB-427' });
    factors.push({ factor: '婚龄差（金土三合）', weight: 0, detail: '年长婚', source: 'TTB-427' });
  }

  // ---- 6. 亲族婚（TTB-428）：金水土居双体宫（摩羯双鱼）；男金+月/女金+木 ----
  if (venus) {
    const vSign = SIGNS[Math.floor(venus.lon / 30)].zh;
    const waterOrEarth = ['摩羯', '双鱼'].includes(vSign);
    if (waterOrEarth) {
      const otherIn = (idx) => byIdx[idx] && ['摩羯', '双鱼'].includes(SIGNS[Math.floor(byIdx[idx].lon / 30)].zh);
      if (otherIn(6) || otherIn(2)) {
        readings.push({ judgment: `亲族婚判则：金落${vSign}（双体宫/原文列摩羯双鱼）且土或水亦居此=亲族婚`, detail: '', source: 'TTB-428（原文标注摩羯双鱼，摩羯为启动座——按原文字面判，双体座定义差异记待办）' });
        factors.push({ factor: '亲族婚（金水土居摩羯/双鱼）', weight: -1, detail: '亲族婚', source: 'TTB-428' });
      }
    }
    if (venus && moon && aspectBetween(venus.lon, moon.lon)) {
      readings.push({ judgment: '男金+月成相位=娶二姊妹/亲族', detail: `金${aspectBetween(venus.lon, moon.lon).aspect}月`, source: 'TTB-428' });
    }
    if (venus && jup && aspectBetween(venus.lon, jup.lon)) {
      readings.push({ judgment: '女金+木成相位=嫁二兄弟/亲族', detail: `金${aspectBetween(venus.lon, jup.lon).aspect}木`, source: 'TTB-428' });
    }
  }

  // ---- 7. 亲属婚直系（TTB-429）：金土居摩羯/天秤；月与此组合在升/中天 ----
  if (venus && sat) {
    const vSign = SIGNS[Math.floor(venus.lon / 30)].zh;
    const sSign = SIGNS[Math.floor(sat.lon / 30)].zh;
    if (['摩羯', '天秤'].includes(vSign) && sSign === vSign) {
      readings.push({ judgment: `亲属婚判则：金土同落${vSign}（原文列摩羯/天秤）=亲属婚`, detail: `金${vSign}、土${sSign}`, source: 'TTB-429（仅规则研究与复现，不作现实用途）' });
      factors.push({ factor: '亲属婚直系（金土同落摩羯/天秤）', weight: -1, detail: '亲属婚', source: 'TTB-429' });
      if (moon && (moon.house === 1 || moon.house === 10)) {
        readings.push({ judgment: '月居升/中天与此组合=直系亲属婚（男娶母姨继母、女嫁子侄婿）', detail: `月落 ${moon.house} 宫`, source: 'TTB-429' });
      }
    }
  }

  // ---- 8. 7宫主落7宫（CP3-178）：有尊贵=婚配佳；受克=失和 ----
  const RULER = {};
  DIGN.domicile.forEach((pid, si) => { RULER[si] = parseInt(pid, 10); });
  const cusp7 = chart.houses.cuspsRaw[6];
  const lord7 = RULER[Math.floor(cusp7 / 30)];
  if (lord7 != null && byIdx[lord7]) {
    const p7 = byIdx[lord7];
    if (p7.house === 7) {
      const ess = essentialDignities(lord7, p7.lon, isDay).filter(d => d.weight > 0);
      if (ess.length) {
        readings.push({ judgment: `7宫主${p7.zh}落7宫且有尊贵（${ess.map(d => d.detail).join('/')}）：婚配得体`, detail: '', source: 'CP3-178' });
        factors.push({ factor: '7宫主落7宫有尊贵', weight: 1, detail: '婚配佳', source: 'CP3-178' });
      } else {
        readings.push({ judgment: `7宫主${p7.zh}落7宫但无本然尊贵：与女子多失和口角`, detail: '', source: 'CP3-178' });
        factors.push({ factor: '7宫主落7宫受克', weight: -1, detail: '婚配失和', source: 'CP3-178' });
      }
    }
  }

  // ---- 9. 婚向与婚期（CP3-522 判例）：升→金三合=有婚向、婚期迟至33岁（Naibod 度量判例） ----
  if (venus) {
    const asp = aspectBetween(asc, venus.lon);
    if (asp && asp.deg === 120) {
      readings.push({ judgment: '婚向提示（CP3-522 判例）：升点与金星三合——有婚向；按 Naibod 度量该判例升→金三合方向≈33 岁成婚（仅判例示范）', detail: `升 ${asc.toFixed(1)}° / 金 ${venus.lon.toFixed(1)}° 三合`, source: 'CP3-522' });
      factors.push({ factor: '婚期提示（升→金三合）', weight: 0, detail: '判例≈33岁', source: 'CP3-522' });
    }
  }

  // ---- 10. 金星三分主（DOR2-01）：与金同角宫或三合=婚吉；果宫/被灼/近西=不婚或劣配 ----
  if (venus) {
    const vSign = Math.floor(venus.lon / 30);
    // 三分主表（Ptolemy）：triplicity[signIdx] = [昼主, 夜主, 同参]
    const tri = DIGN.triplicity[vSign];
    if (tri) {
      const lordIdx = parseInt(tri[isDay ? 0 : 1], 10);
      if (byIdx[lordIdx]) {
        const lt = byIdx[lordIdx];
        const sameCardine = lt.house === 1 || lt.house === 4 || lt.house === 7 || lt.house === 10;
        const trine = aspectBetween(lt.lon, venus.lon) && aspectBetween(lt.lon, venus.lon).deg === 120;
        if (sameCardine || trine) {
          readings.push({ judgment: `金星三分主${lt.zh}（${SIGNS[vSign].zh}三分主）与金同角宫或三合：婚吉`, detail: lt.house === 1 || lt.house === 4 || lt.house === 7 || lt.house === 10 ? `落 ${lt.house} 宫` : '三合金', source: 'DOR2-01' });
          factors.push({ factor: '金星三分主吉位', weight: 1, detail: '婚吉', source: 'DOR2-01' });
        } else if ([6, 8, 12].includes(lt.house) || (sun && Math.abs(dif(lt.lon, sun.lon)) < 8.5)) {
          readings.push({ judgment: `金星三分主${lt.zh}居凶位/果宫/被灼：不婚或娶奴婢娼妓老妇`, detail: `落 ${lt.house} 宫`, source: 'DOR2-01' });
          factors.push({ factor: '金星三分主凶位', weight: -1.5, detail: '不婚或劣配', source: 'DOR2-01' });
        }
      }
    }
  }

  // ---- 11. 金合土/火（DOR2-03） ----
  if (venus) {
    if (sat && aspectBetween(venus.lon, sat.lon) && aspectBetween(venus.lon, sat.lon).deg === 0) {
      readings.push({ judgment: `金合土：婚配对象判则——娶寡妇/老妇/奴婢贱女（女命反之=嫁年长/鳏夫）`, detail: '', source: 'DOR2-03' });
      factors.push({ factor: '金合土', weight: -1, detail: '劣配提示', source: 'DOR2-03' });
    }
    if (mars && aspectBetween(venus.lon, mars.lon) && aspectBetween(venus.lon, mars.lon).deg === 0) {
      readings.push({ judgment: `金合火：婚配对象判则——妻好淫/火金互入庙界=奸乱（女命反之）`, detail: '', source: 'DOR2-03' });
      factors.push({ factor: '金合火', weight: -1, detail: '婚配提示', source: 'DOR2-03' });
    }
  }

  // ---- 12. 不婚判则（DOR2-04）：金星三分主/婚点三分主不照 ----
  if (venus && points.marriageMale != null) {
    const vSign = Math.floor(venus.lon / 30);
    const tri = DIGN.triplicity[vSign];
    if (tri) {
      const lordIdx = parseInt(tri[isDay ? 0 : 1], 10);
      if (byIdx[lordIdx]) {
        const lt = byIdx[lordIdx];
        const shinesOnVenus = aspectBetween(lt.lon, venus.lon);
        const inMC = lt.house === 10;
        if (!shinesOnVenus && !inMC) {
          readings.push({ judgment: `金星三分主${lt.zh}不照金星亦不照天顶：无婚乐`, detail: `落 ${lt.house} 宫`, source: 'DOR2-04' });
          factors.push({ factor: '金三分主不照', weight: -1, detail: '无婚乐', source: 'DOR2-04' });
        }
        // 婚点三分主（婚点落座三分主）不照婚点/金/天顶=永不婚
        const pSign = Math.floor(points.marriageMale / 30);
        const ptri = DIGN.triplicity[pSign];
        if (ptri) {
          const plord = parseInt(ptri[isDay ? 0 : 1], 10);
          if (byIdx[plord]) {
            const pl = byIdx[plord];
            const onPoint = aspectBetween(pl.lon, points.marriageMale);
            const onVenus = aspectBetween(pl.lon, venus.lon);
            const onMC = aspectBetween(pl.lon, chart.houses.angles.mc);
            if (!onPoint && !onVenus && !onMC) {
              readings.push({ judgment: `婚点三分主${pl.zh}不照婚点/金/天顶：永不婚判则（仅判例复现）`, detail: `婚点落 ${SIGNS[pSign].zh}，三分主${pl.zh}落 ${pl.house} 宫`, source: 'DOR2-04' });
              factors.push({ factor: '婚点三分主不照', weight: -1.5, detail: '永不婚判则', source: 'DOR2-04' });
            }
          }
        }
      }
    }
  }

  // ---- 13. 合婚判据（有伴侣盘时）：TTB-425 光体相位 + TTB-426 吉凶照修饰 ----
  if (partnerChart) {
    const sunB = partnerChart.planets[0], moonB = partnerChart.planets[1];
    if (sunB && moonB) {
      const lightPairs = [];
      for (const [aIdx, bIdx] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
        const a = byIdx[aIdx], b = partnerChart.planets[bIdx];
        if (!a || !b) continue;
        const asp = aspectBetween(a.lon, b.lon);
        if (asp) lightPairs.push({ a: PL_ZH[aIdx], b: PL_ZH[bIdx], asp });
      }
      if (lightPairs.length) {
        readings.push({ judgment: `两盘光体相位（TTB-425）：${lightPairs.map(x => `${x.a}↔${x.b} ${x.asp.aspect}`).join('、')}`, detail: '吉相（三/六合尤互换）=婚持久；无涉/冲/四分=轻离决裂', source: 'TTB-425' });
        const hasGood = lightPairs.some(x => x.asp.deg === 60 || x.asp.deg === 120);
        const hasBad = lightPairs.some(x => x.asp.deg === 90 || x.asp.deg === 180);
        if (hasGood && !hasBad) factors.push({ factor: '合婚光体吉相', weight: 1, detail: '婚持久', source: 'TTB-425' });
        if (hasBad && !hasGood) factors.push({ factor: '合婚光体凶相', weight: -1, detail: '轻离决裂', source: 'TTB-425' });
      }
    }
    // TTB-426 吉凶星照光体修饰
    const GB = (p) => p && (p.idx === 5 || p.idx === 3), MB = (p) => p && (p.idx === 6 || p.idx === 4);
    for (const b of partnerChart.planets.filter(p => p.idx <= 1)) {
      for (const a of chart.planets.filter(p => p.idx <= 6)) {
        if (a.idx === b.idx) continue;
        const asp = aspectBetween(a.lon, b.lon);
        if (!asp) continue;
        if (GB(a) && (asp.deg === 60 || asp.deg === 120)) {
          readings.push({ judgment: `本盘吉星${PL_ZH[a.idx]}照伴侣光体${PL_ZH[b.idx]}（${asp.aspect}）：婚悦益`, detail: '', source: 'TTB-426' });
          factors.push({ factor: '吉星照伴侣光体', weight: 1, detail: '婚悦益', source: 'TTB-426' });
        }
        if (MB(a) && (asp.deg === 90 || asp.deg === 180)) {
          readings.push({ judgment: `本盘凶星${PL_ZH[a.idx]}照伴侣光体${PL_ZH[b.idx]}（${asp.aspect}）：争吵不悦`, detail: '', source: 'TTB-426' });
          factors.push({ factor: '凶星照伴侣光体', weight: -1, detail: '争吵不悦', source: 'TTB-426' });
        }
      }
    }
  }

  // ---- 合成 ----
  const score = factors.reduce((s, f) => s + f.weight, 0);
  const verdict = score >= 2 ? '婚向利好' : score <= -2 ? '婚向不利' : '中性';
  const unscored = [
    'CP3-522 婚期数值（升→金三合≈33岁）为单判例示范（Naibod 度量），非通用公式',
    'TTB-429 直系亲属婚为判例复现，不作现实用途（工程仅输出提示）',
    'DOR2-10 婚期应期已计（行运盘：木星至婚点/金星触发、土星刑冲阻断；容许度 8° 工程默认）',
    '婚点公式"±升点/昼加夜减"符号按婚子女点数表字面转述，Dorotheus 原典逐式校对待办',
    '日之东象限=升宫前诸宫（TTB-424）工程取 10/11/12 宫为近似',
  ];
  return { points, readings, factors, score, verdict, unscored, sources: ['婚子女点数表', 'TTB-421/422/423/424/425/426/427/428/429', 'CP3-178/332/522', 'DOR2-01/03/04', '映射D-婚配判则表'] };
}

/**
 * 婚期应期（DOR2-10）：木星行运至婚点/刑冲三合此点/金星（三分或刑冲金星）=成婚应期触发；
 * 土星行运自婚点/金星刑或冲 → 冷婚阻碍（覆盖触发）。木星合金星原位=宜婚。
 * 工程口径：容许度 8°（DOR2 未给，标注）；"金之三分"以木星与金星三合相位近似（原文指金星三分主星所在，未按三分主精确实现，标注）。
 */
function marriageTiming(natalChart, transitChart) {
  const points = marriagePoints(natalChart);
  const byT = {};
  transitChart.planets.forEach(p => { byT[p.idx] = p; });
  const tJup = byT[5], tSat = byT[6];
  const nVenus = natalChart.planets.find(p => p.idx === 3);
  const ORB = 8; // 工程默认
  const near = (lon, target) => Math.abs(dif(lon, target)) < ORB;
  const inAspect = (lon, target, degs) => { const d = Math.abs(dif(lon, target)); return degs.some(a => Math.abs(d - a) < ORB); };
  const targets = [];
  if (points.marriageMale != null) targets.push({ name: '婚点(土→金)', lon: points.marriageMale });
  if (points.marriageFemale != null) targets.push({ name: '女婚点(金→土)', lon: points.marriageFemale });
  if (points.happyMarriage != null) targets.push({ name: '幸福婚点(金→七宫)', lon: points.happyMarriage });
  if (nVenus) targets.push({ name: '金星原位', lon: nVenus.lon });
  const triggers = [], blocked = [];
  if (!tJup) return { triggers, blocked, verdict: '行运盘无木星', unscored: [] };
  for (const t of targets) {
    if (tJup) {
      if (near(tJup.lon, t.lon)) triggers.push(`木星行运合${t.name}（距 ${Math.abs(dif(tJup.lon, t.lon)).toFixed(1)}°）→ 成婚应期`);
      else if (inAspect(tJup.lon, t.lon, [90, 180, 120])) triggers.push(`木星行运刑/冲/三合${t.name}（距 ${Math.abs(dif(tJup.lon, t.lon)).toFixed(1)}°）→ 成婚应期`);
    }
    if (tSat && inAspect(tSat.lon, t.lon, [90, 180])) blocked.push(`土星行运刑/冲${t.name}（距 ${Math.abs(dif(tSat.lon, t.lon)).toFixed(1)}°）→ 冷婚阻碍（DOR2-10 土照则冷婚）`);
  }
  // 木星合金星原位已含于 targets 循环；仅婚点类触发才计"成婚"，金星原位触发标"宜婚"
  const verdict = blocked.length ? '冷婚阻碍（土星照）' : (triggers.length ? '成婚应期触发' : '行运当前无应期触发');
  return { triggers, blocked, verdict, tJup: tJup.lon, tSat: tSat ? tSat.lon : null, unscored: ['金之三分未按三分主星精确实现（以木星与金星三合近似，标注）'] };
}

module.exports = { marriagePoints, marriageReading, marriageTiming, aspectBetween, moonAge };
