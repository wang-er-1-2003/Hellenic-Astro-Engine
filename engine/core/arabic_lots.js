// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 阿拉伯点全表（AlBiruni：映射-宫位点 / 映射-其他点 / 映射-卜卦点）
// 数据源：rule_tables.json 子表（规则库-AlBiruni阿拉伯点.xlsx）
// 公式 token 实现集：Asc / cuspN / lordN / lord(星) / deg(星) / 行星 / Fortune / Spirit / 固定度（10Gemini=双子10°）
// 未实现 token（跳过并列出）：disp(...) / lord(hour) / lord(affair) / prev syzygy / exalt lord / II(歧义) / 转录缺公式
'use strict';
const { norm, houseOf } = require('./ecliptic');
const sweCore = require('./swe');
const { planetaryHour } = require('./hours');

// 星座→宫主 planetIdx（白羊0..双鱼11；古典七政）
const RULER = [4, 3, 2, 1, 0, 2, 3, 4, 5, 6, 6, 5];
const PNAME = { Sun: 0, Moon: 1, Mercury: 2, Venus: 3, Mars: 4, Jupiter: 5, Saturn: 6 };
// 行星时主中文名 → planetIdx（hours.js hourLord 返回中文）
const HOURLORD_IDX = { '土': 6, '木': 5, '火': 4, '日': 0, '金': 3, '水': 2, '月': 1 };
// 固定度基数（度+星座 → 黄经）
const FIXDEG = { Gemini: 60, Cancer: 90 };
// 行星擢升度（度，AlBiruni 古典擢升表）——贵胄点 deg(exalt lord time)
const EXALT_DEG = { '日': 19, '月': 3, '水': 15, '金': 27, '火': 28, '木': 15, '土': 21 };

// 宫位点 90 个（子表逐行抄录；昼夜列 R=夜反转 / S=昼夜同式）
const HOUSE_POINTS = [
  ['1', 'Life', '生命', 'Asc + Saturn - Jupiter', 'R'], ['1', 'Pillar', '盘柱/恒久', 'Asc + Spirit - Fortune', 'R'], ['1', 'Reasoning', '推理与口才', 'Asc + Mars - Mercury', 'R'],
  ['2', 'Property', '财产', 'Asc + cusp2 - lord2', 'R'], ['2', 'Debt', '债务', 'Asc + Mercury - Saturn', 'R'], ['2', 'Treasure', '宝藏', 'Asc + Venus - Mercury', 'S'],
  ['3', 'Brothers', '兄弟', 'Asc + Jupiter - Saturn', 'S'], ['3', 'NoBrothers', '兄弟数', 'Asc + Saturn - Mercury', 'S'], ['3', 'DeathBrothers', '兄弟姊妹之死', 'Asc + 10Gemini - Sun', 'R'],
  ['4', 'Parents', '父母', 'Asc + Saturn - Sun', 'R'], ['4', 'DeathParents', '父母之死', 'Asc + Jupiter - Saturn', 'R'], ['4', 'Grandparents', '祖父母', 'Asc + Saturn - II', 'R'],
  ['4', 'Ancestors', '祖先与亲属', 'Asc + Mars - Saturn', 'R'], ['4', 'RealEstateH', '不动产(赫尔墨斯)', 'Asc + Moon - Saturn', 'R'], ['4', 'RealEstateP', '不动产(波斯诸贤)', 'Asc + Jupiter - Mercury', 'R'],
  ['4', 'Agriculture', '农耕', 'Asc + Saturn - Venus', 'S'], ['4', 'Issue', '事之结果', 'Asc + lord(last syzygy) - Saturn', 'S'],
  ['5', 'Children', '子女', 'Asc + Saturn - Jupiter', 'R'], ['5', 'SexTime', '性别之时与数', 'Asc + Jupiter - Mars', 'S'], ['5', 'Males', '男之状况', 'Asc + Jupiter - Mars', 'S'],
  ['5', 'Females', '女之状况', 'Asc + Venus - Moon', 'S'], ['5', 'SexBirth', '出生男女', 'Asc + Moon - lord(Moon)', 'R'],
  ['6', 'DiseaseH', '疾病(赫尔墨斯)', 'Asc + Mars - Saturn', 'R'], ['6', 'DiseaseA', '疾病(古人)', 'Asc + Mars - Mercury', 'S'], ['6', 'Captivity', '囚禁', 'Asc + disp(lord time) - lord time', 'S'],
  ['6', 'Slaves', '奴隶', 'Asc + Moon - Mercury', 'S'],
  ['7', 'MarriageMH', '男婚(赫尔墨斯)', 'Asc + Venus - Saturn', 'S'], ['7', 'MarriageMV', '男婚(Valens)', 'Asc + Venus - Sun', 'S'], ['7', 'Trickery', '男女之欺诈', 'Asc + Venus - Sun', 'S'],
  ['7', 'Intercourse', '交合', 'Asc + Venus - Sun', 'S'], ['7', 'MarriageWH', '女婚(赫尔墨斯)', 'Asc + Saturn - Venus', 'S'], ['7', 'MarriageWV', '女婚(Valens)', 'Asc + Mars - Moon', 'S'],
  ['7', 'Misconduct', '女之失行', 'Asc + Mars - Moon', 'S'], ['7', 'TrickeryWomen', '男被女欺', 'Asc + Mars - Moon', 'S'], ['7', 'IntercourseW', '交合(女)', 'Asc + Mars - Moon', 'S'],
  ['7', 'Unchastity', '女之淫佚', 'Asc + Mars - Moon', 'S'], ['7', 'Chastity', '女之贞洁', 'Asc + Venus - Moon', 'S'], ['7', 'MarriageH', '婚(赫尔墨斯)', 'Asc + cusp7 - Venus', 'S'],
  ['7', 'MarriageTime', '婚时(赫尔墨斯)', 'Asc + Moon - Sun', 'S'], ['7', 'FraudMarriage', '诈婚', 'Asc + Venus - Saturn', 'S'], ['7', 'SonsInLaw', '女婿', 'Asc + Venus - Saturn', 'R'],
  ['7', 'Lawsuits', '诉讼', 'Asc + Jupiter - Mars', 'R'],
  ['8', 'Death', '死亡', 'deg(Saturn) + cusp8 - Moon', 'S'], ['8', 'Anairetai', '夺命星', 'Asc + Moon - lord(Asc)', 'R'], ['8', 'YearFear', '忌年(死亡饥馑)', 'Asc + disp(last syzygy) - Saturn', 'S'],
  ['8', 'MurderSick', '谋杀与病位', 'deg(Mercury) + Mars - Saturn', 'R'], ['8', 'Violence', '暴行危险', 'Asc + Mercury - Saturn', 'R'],
  ['9', 'Journeys', '旅行', 'Asc + cusp9 - lord9', 'S'], ['9', 'ByWater', '水路', 'Asc + 15Cancer - Saturn', 'R'], ['9', 'Timidity', '怯懦与藏匿', 'Asc + Mercury - Moon', 'R'],
  ['9', 'Reflection', '深思', 'Asc + Moon - Saturn', 'R'], ['9', 'Wisdom', '理解与智慧', 'Asc + Sun - Saturn', 'R'], ['9', 'Traditions', '传统与知识', 'Asc + Jupiter - Sun', 'R'],
  ['9', 'Knowledge', '知识真伪', 'Asc + Moon - Mercury', 'S'],
  ['10', 'NobleBirths', '贵胄', 'Asc + deg(exalt lord time) - lord time', 'R'], ['10', 'Kings', '王与苏丹', '(转录缺公式)', 'R'], ['10', 'Vazirs', '行政官/大臣', 'Asc + Mars - Mercury', 'R'],
  ['10', 'SultansVictory', '苏丹之胜', 'Asc + Saturn - Sun', 'R'], ['10', 'RiseStation', '升迁者', 'Asc + Fortune - Saturn', 'R'], ['10', 'Rank', '显贵名流', 'Asc + Sun - Saturn', 'S'],
  ['10', 'Armies', '军队与警察', 'Asc + Saturn - Mars', 'R'], ['10', 'SultanNativ', '本命之苏丹', 'Asc + Moon - Saturn', 'S'], ['10', 'Merchants', '商人与其业', 'Asc + Venus - Mercury', 'R'],
  ['10', 'BuySell', '买卖', 'Asc + Fortune - Spirit', 'R'], ['10', 'Medical', '医疗处置', 'Asc + Jupiter - Sun', 'R'], ['10', 'Mothers', '母亲', 'Asc + Moon - Venus', 'R'],
  ['11', 'Glory', '荣耀', 'Asc + Spirit - Fortune', 'R'], ['11', 'FriendsEnmity', '友与敌', 'Asc + Spirit - Fortune', 'R'], ['11', 'KnownRevered', '为人所知敬', 'Asc + Sun - Fortune', 'R'],
  ['11', 'Success', '成功', 'Asc + Jupiter - Fortune', 'R'], ['11', 'Worldliness', '世俗', 'Asc + Venus - Fortune', 'R'], ['11', 'Hope', '希望', 'Asc + Mercury - Jupiter', 'R'],
  ['11', 'Friends', '友人', 'Asc + Mercury - Moon', 'S'], ['11', 'Violence11', '暴力', 'Asc + Mercury - Spirit', 'S'], ['11', 'Abundance', '家之丰饶', 'Asc + Sun - Moon', 'S'],
  ['11', 'Liberty', '人身自由', 'Asc + Sun - Mercury', 'R'], ['11', 'Praise', '赞美与接纳', 'Asc + Venus - Jupiter', 'R'],
  ['12', 'EnmityA', '仇敌(古人)', 'Asc + Mars - Saturn', 'S'], ['12', 'EnmityH', '仇敌(赫尔墨斯)', 'Asc + cusp12 - lord12', 'S'], ['12', 'BadLuck', '厄运', 'Asc + Fortune - Spirit', 'S'],
];

// 其他点 10 个（映射-其他点）
const OTHER_POINTS = [
  ['Hailaj/Hyleg', '生命给予者', 'Asc + Moon - deg(prev syzygy)', 'S'], ['DebilitatedBodies', '衰弱之体', 'Asc + Mars - Fortune', 'R'], ['Horsemanship', '骑术与勇敢', 'Asc + Moon - Saturn', 'R'],
  ['Boldness', '胆大/暴力/谋杀', 'Asc + Moon - lord(Asc)', 'R'], ['TrickeryDeceit', '诡计与欺诈', 'Asc + Spirit - Mercury', 'R'], ['NecessityWish', '必需与愿望', 'Asc + Mars - Saturn', 'S'],
  ['RequirementsE', '需求(埃及人)', 'Asc + cusp3 - Mars', 'S'], ['Realisation', '需求愿望之实现', 'Asc + Mercury - Fortune', 'S'], ['Retribution', '报应', 'Asc + Sun - Mars', 'R'],
  ['Rectitude', '正直', 'Asc + Mars - Mercury', 'R'],
];

// 卜卦点 18 个（映射-卜卦点；name/zh/formula/昼夜）
const HORARY_POINTS = [
  ['Secret', '秘密', 'Asc + cusp10 - lord(Asc)', 'S'], ['UrgentWish', '急愿', 'Asc + lord(Asc) - lord(hour)', 'R'], ['TimeOfDone', '达成之时', 'Asc + lord10 - lord(hour)', 'R'], ['InfoTrue', '信息真伪', 'Asc + Moon - Mercury', 'R'],
  ['TradeLoss', '营业受损', 'Asc + Fortune - lord(Asc)', 'S'], ['SlaveFree', '解放民与仆役', 'Mercury + Saturn - Jupiter', 'S'], ['MasterServant', '主与主人', 'Moon - Saturn - Jupiter', 'S'], ['Marriage', '婚姻', 'Asc + cusp7 - Venus', 'S'],
  ['TimeOfAction', '行动之时', 'Asc + Jupiter - Sun', 'S'], ['TimeOfSpent', '所耗之时', 'Asc + Saturn - Sun', 'S'], ['Resignation', '免职或辞任', 'Jupiter + Jupiter - Sun', 'S'], ['When', '其时', 'cusp10 + Fortune - lord(affair)', 'S'],
  ['AbsentLife', '缺席者生死', 'Asc + Mars - Moon', 'S'], ['LostBeast', '失兽', 'Asc + Mars - Sun', 'S'], ['Lawsuit', '诉讼', 'Asc + Mercury - Mars', 'S'], ['Success', '成功结果', 'Asc + Jupiter - Sun', 'S'],
  ['Beheading', '斩首', 'cusp8 + Mars - Moon', 'S'], ['Torture', '酷刑', 'cusp9 + Saturn - Moon', 'S'],
];

async function computeArabicPoints(chart) {
  const swe = await sweCore.getSwe();
  const ctx = buildCtx(chart, swe);
  const day = chart.meta.isDay === 'day';
  const points = [];
  const skipped = [];
  for (const [house, name, zh, formula, dn] of HOUSE_POINTS) points.push(evalPoint({ name, zh, formula, house: Number(house), reverse: dn === 'R' ? !day : false }, ctx, 'AlBiruni-映射-宫位点', skipped));
  for (const [name, zh, formula, dn] of OTHER_POINTS) points.push(evalPoint({ name, zh, formula, reverse: dn === 'R' ? !day : false }, ctx, 'AlBiruni-映射-其他点', skipped));
  for (const [name, zh, formula, dn] of HORARY_POINTS) points.push(evalPoint({ name, zh, formula, reverse: dn === 'R' ? !day : false }, ctx, 'AlBiruni-映射-卜卦点', skipped));
  return { points: points.filter(Boolean), skipped };
}

function buildCtx(chart, swe) {
  const asc = chart.houses.cuspsRaw[0];
  const byIdx = Object.fromEntries(chart.planets.map(p => [p.idx, p.lon]));
  const cusps = chart.houses.cuspsRaw; // [0]=1宫头（第46段修复后 0-based 索引）
  const fortuneLon = (chart.meta.sevenLots && chart.meta.sevenLots[0]) ? chart.meta.sevenLots[0].lon : NaN;
  const spiritLon = (chart.meta.sevenLots && chart.meta.sevenLots[1]) ? chart.meta.sevenLots[1].lon : NaN;
  const lordOfSign = signIdx => RULER[signIdx] !== undefined ? byIdx[RULER[signIdx]] : NaN;
  return {
    asc, byIdx, cusps,
    getPlanet: name => byIdx[PNAME[name]] !== undefined ? byIdx[PNAME[name]] : NaN,
    getLord: n => lordOfSign(Math.floor(norm(cusps[n - 1] || 0) / 30)),
    getLordOfAsc: () => lordOfSign(Math.floor(norm(asc) / 30)),
    getLordOfPlanet: name => {
      const lon = byIdx[PNAME[name]];
      if (lon === undefined) return NaN;
      return lordOfSign(Math.floor(norm(lon) / 30));
    },
    // lord(hour)：行星时主（hours.js planetaryHour，CE-155）——急愿/达成之时用
    getLordOfHour: () => {
      if (!swe || !chart.meta) return NaN;
      const jd = chart.meta.natalJd;
      const inp = chart.meta.input || {};
      const ph = planetaryHour(jd, inp.lat, inp.lon, swe, inp.tzOffsetHours ?? 8);
      if (!ph) return NaN;
      const idx = HOURLORD_IDX[ph.hourLord];
      return idx === undefined ? NaN : (byIdx[idx] !== undefined ? byIdx[idx] : NaN);
    },
    // 按黄经求所在星座宫主（disp(X)/exalt 用）
    getLordOfPlanetByLon: lon => {
      if (isNaN(lon)) return NaN;
      return lordOfSign(Math.floor(norm(lon) / 30));
    },
    // 行星时主中文名（EXALT_DEG 键）
    getHourLordName: () => {
      if (!swe || !chart.meta) return null;
      const jd = chart.meta.natalJd;
      const inp = chart.meta.input || {};
      const ph = planetaryHour(jd, inp.lat, inp.lon, swe, inp.tzOffsetHours ?? 8);
      return ph ? ph.hourLord : null;
    },
    // 行星时主黄经（直接值，disp(lord time)/exalt 用）
    getHourLordLon: () => {
      if (!swe || !chart.meta) return NaN;
      const jd = chart.meta.natalJd;
      const inp = chart.meta.input || {};
      const ph = planetaryHour(jd, inp.lat, inp.lon, swe, inp.tzOffsetHours ?? 8);
      if (!ph) return NaN;
      const idx = HOURLORD_IDX[ph.hourLord];
      return idx === undefined ? NaN : (byIdx[idx] !== undefined ? byIdx[idx] : NaN);
    },
    // 产前朔望（natal 块已算）：黄经 / 所在星座宫主 / 所在星座庙主
    getSyzygyLon: () => (chart.meta.prenatalLunation && chart.meta.prenatalLunation.lon !== undefined) ? chart.meta.prenatalLunation.lon : NaN,
    getLordOfSyzygy: () => {
      const lon = (chart.meta.prenatalLunation && chart.meta.prenatalLunation.lon !== undefined) ? chart.meta.prenatalLunation.lon : NaN;
      if (isNaN(lon)) return NaN;
      return lordOfSign(Math.floor(norm(lon) / 30));
    },
    fortuneLon, spiritLon,
  };
}

function evalPoint(rec, ctx, source, skippedList) {
  const { ok, lon, reason } = evalFormula(rec.formula, ctx, rec.reverse);
  if (!ok) { skippedList.push({ name: rec.name, zh: rec.zh, house: rec.house, formula: rec.formula, reason }); return null; }
  const n = norm(lon);
  return { name: rec.name, zh: rec.zh, house: rec.house, lon: n, fallHouse: houseOf(n, ctx.cusps), formula: rec.formula, daynight: rec.reverse ? '夜反转' : '昼夜同', source };
}

// 公式求值：token 替换 → 数值加减。返回 {ok, lon, reason}
function evalFormula(f, ctx, reverse) {
  if (f.includes('转录')) return { ok: false, lon: 0, reason: '原书转录缺公式' };
  // Fortune/Spirit 特殊（先替换）
  let s = f
    .replace(/Fortune/g, 'FORT')
    .replace(/Spirit/g, 'SPIR');
  // lord(hour)（行星时主）
  s = s.replace(/lord\(hour\)/g, () => { const v = ctx.getLordOfHour(); return isNaN(v) ? 'UNKNOWN' : String(v); });
  // disp(lord time)：行星时主所在星座庙主黄经
  s = s.replace(/disp\(lord time\)/g, () => {
    const hl = ctx.getHourLordLon();
    if (isNaN(hl)) return 'UNKNOWN';
    return String(ctx.getLordOfPlanetByLon(hl));
  });
  // deg(exalt lord time)：行星时主的擢升度（EXALT_DEG 表）
  s = s.replace(/deg\(exalt lord time\)/g, () => {
    if (!ctx.getHourLordName) return 'UNKNOWN';
    const d = EXALT_DEG[ctx.getHourLordName()];
    return d === undefined ? 'UNKNOWN' : String(d);
  });
  // lord time：行星时主黄经
  s = s.replace(/lord time/g, () => { const v = ctx.getHourLordLon(); return isNaN(v) ? 'UNKNOWN' : String(v); });
  // 朔望系：lord(last syzygy) / disp(last syzygy) / deg(prev syzygy)
  s = s.replace(/lord\(last syzygy\)/g, () => { const v = ctx.getLordOfSyzygy(); return isNaN(v) ? 'UNKNOWN' : String(v); });
  s = s.replace(/disp\(last syzygy\)/g, () => { const v = ctx.getLordOfSyzygy(); return isNaN(v) ? 'UNKNOWN' : String(v); });
  s = s.replace(/deg\(prev syzygy\)/g, () => { const v = ctx.getSyzygyLon(); return isNaN(v) ? 'UNKNOWN' : String(v); });
  // lord(Asc)（升星座宫主）
  s = s.replace(/lord\(Asc\)/g, () => { const v = ctx.getLordOfAsc(); return isNaN(v) ? 'UNKNOWN' : String(v); });
  // lord(星) / deg(星)
  s = s.replace(/lord\(([A-Za-z]+)\)/g, (_, p) => {
    const v = ctx.getLordOfPlanet(p);
    return isNaN(v) ? 'UNKNOWN' : String(v);
  }).replace(/deg\(([A-Za-z]+)\)/g, (_, p) => {
    const v = ctx.getPlanet(p);
    return isNaN(v) ? 'UNKNOWN' : String(v);
  });
  // 固定度：数字+星座 → 黄经（10Gemini=70）
  s = s.replace(/(\d+)(Gemini|Cancer)/g, (_, d, sg) => String(FIXDEG[sg] + Number(d)));
  // lordN → n 宫主黄经
  s = s.replace(/lord(\d+)/g, (_, n) => {
    const v = ctx.getLord(Number(n));
    return isNaN(v) ? 'UNKNOWN' : String(v);
  });
  // cuspN → 宫头黄经
  s = s.replace(/cusp(\d+)/g, (_, n) => String(ctx.cusps[Number(n) - 1] || 'UNKNOWN'));
  // Asc / 行星
  s = s.replace(/Asc/g, String(ctx.asc));
  for (const name of Object.keys(PNAME)) s = s.replace(new RegExp('\\b' + name + '\\b', 'g'), () => { const v = ctx.getPlanet(name); return isNaN(v) ? 'UNKNOWN' : String(v); });
  s = s.replace(/FORT/g, () => isNaN(ctx.fortuneLon) ? 'UNKNOWN' : String(ctx.fortuneLon))
       .replace(/SPIR/g, () => isNaN(ctx.spiritLon) ? 'UNKNOWN' : String(ctx.spiritLon));
  if (/UNKNOWN|[A-Za-z(]/.test(s)) return { ok: false, lon: 0, reason: '未实现 token：' + (s.match(/[A-Za-z][A-Za-z0-9 ()]*/g) || []).join('、') };
  // 数值加减
  const terms = s.replace(/\s+/g, '').match(/[+-]?[\d.]+/g);
  if (!terms || !terms.length) return { ok: false, lon: 0, reason: '公式空' };
  // 夜反转（R 且夜生）：Asc 之后的项符号取反（Asc+A-B → Asc-A+B = Asc+B-A）
  if (reverse) for (let i = 1; i < terms.length; i++) {
    const t = terms[i];
    terms[i] = t[0] === '-' ? '+' + t.slice(1) : '-' + t.replace(/^\+/, '');
  }
  let total = 0;
  for (const t of terms) total += parseFloat(t);
  return { ok: true, lon: ((total % 360) + 360) % 360, reason: '' };
}

module.exports = { computeArabicPoints, evalFormula, buildCtx, HOUSE_POINTS, OTHER_POINTS, HORARY_POINTS };
