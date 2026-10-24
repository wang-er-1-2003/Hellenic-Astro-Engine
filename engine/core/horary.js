// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 卜卦问答（Horary）结果目的域 C 第二版
// 判据链基座：Bonatti146 判断方法论 + Dariot Almuten 判序 + MashallahReception 接纳；
// 第二版新增：Bonatti 月亮17阻碍 + 行星10阻碍（子表 映射-月亮17阻碍 / 映射-行星10阻碍）
// 专项：盗窃失物（Griffin 方位/相貌 + Gadbury 方位/距离/应期 + Bonatti 龙尾损害）
// 原则：所有判据来自已入库的 47 卷规则库/子表；判不了的明确不判，不编造。
// 阻碍权重为工程默认（high=-1、medium=-0.5），Bonatti 表未给数值，已标注。
'use strict';
const path = require('path');
const fs = require('fs');
const { dif } = require('./ecliptic');
const { SIGNS } = require('./constants');

const DIGNITY = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/dignity_tables.json'), 'utf-8'));
const TABLE_DB = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/rule_tables.json'), 'utf-8'));
// Clavis p30 度数性质表（深陷 Pitted / Azimene）：月亮阻碍 #14/#15 判据（每座不同，数字化自原书）
const CLT_ROWS = (() => {
  try {
    const t = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/clavis_degree_table.json'), 'utf-8'));
    return t.rows || {};
  } catch (e) { return {}; }
})();
const { fixedStarChecks, nearStars, isMalefic } = require('./fixed_stars');

function tableByName(name) {
  const t = TABLE_DB.tables.find(x => x.table === name);
  return t || null;
}
function rowToObj(header, row) {
  const o = {};
  header.forEach((h, i) => { if (h) o[h] = String(row[i] || '').trim(); });
  return o;
}

// 星座中文→英文→动势（启动/固定/双体）
const SIGN_OF = (zh) => SIGNS.find(s => s.zh === zh) || null;
const QUALITY_ZH = { cardinal: '启动', fixed: '固定', mutable: '双体' };

// 星座 ruler（庙主）：dignity_tables.domicile[signIdx] = planetIdx(string)
const RULER = {};
DIGNITY.tables.domicile.forEach((pid, si) => { RULER[si] = parseInt(pid, 10); });

// 擢升/落陷星座（古典七政；擢升对面=落陷）
const EXALT_SIGNS = { 0: 0, 1: 1, 2: 5, 3: 11, 4: 9, 5: 3, 6: 6 }; // 日白羊/月金牛/水处女/金双鱼/火摩羯/木巨蟹/土天秤
const FALL_SIGNS = { 0: 6, 1: 7, 2: 11, 3: 5, 4: 3, 5: 9, 6: 0 };

// 行星时主（CE-155 hours.js）——赛马问判用
const { planetaryHour } = require('./hours');
const HOURLORD_IDX = { '土': 6, '木': 5, '火': 4, '日': 0, '金': 3, '水': 2, '月': 1 };
function hourLordIdx(chart, byIdx, swe) {
  if (!swe || !chart || !chart.meta || !chart.meta.input) return null;
  const ph = planetaryHour(chart.meta.natalJd, chart.meta.input.lat, chart.meta.input.lon, swe, chart.meta.input.tzOffsetHours ?? 8);
  if (!ph) return null;
  const idx = HOURLORD_IDX[ph.hourLord];
  return idx === undefined ? null : idx;
}

// 问事方/应事方宫位映射（古典约定：1=问者, 7=对方/配偶/对手, 2=财/动产, 4=房屋/藏物, 8=他人之财/贼? 按 Bonatti: 8宫主=小偷, 10=法官/职位, 9=远方/诉讼, 3=短途/兄弟, 5=子女/娱乐, 6=疾病/仆人, 12=暗敌/囚禁）
const Q_MAP = {
  '盗窃失物': { querent: [1], lost: [4, 2], thief: [7, 8], extra: ['房屋藏处=4宫主', '小偷=7宫主或8宫主'] },
  '买卖': { querent: [1], matter: [2], other: [7], extra: ['货物=2宫主', '买方=7宫主', '成交价=10宫?'] },
  '婚姻': { querent: [1], matter: [7], other: [7], extra: ['配偶=7宫主', '婚姻本身=7宫'] },
  '诉讼': { querent: [1], matter: [9], other: [7], extra: ['对方=7宫主', '法官=10宫主', '诉讼=9宫'] },
  '被控': { querent: [1], matter: [8], other: [7], extra: ['指控=8宫', '法官=10宫主', '囚禁=12宫', '同伙=1宫内别星'] },
  '航海': { querent: [1], matter: [9], other: [7], extra: ['航行=9宫', '9宫主=航程征象', '龙尾=南交点'] },
  '得位': { querent: [1], matter: [10], other: [7], extra: ['所求之位=10宫', '10宫主/日=职位征象', '所谋职位之利=11宫主'] },
  '去职': { querent: [1], matter: [10], other: [7], extra: ['职位=10宫', '逐之者=克问主征象之星所表之人'] },
  '囚释': { querent: [1], matter: [12], other: [7], extra: ['囚禁=12宫', '12宫主=牢狱征象'] },
  '获所求': { querent: [1], matter: [11], other: [7], extra: ['所求=11宫', '11宫主=所问之事', '指名物（金钱等）察对应宫主'] },
  '出行': { querent: [1], matter: [9], other: [7], extra: ['远方=9宫', '短途=3宫', '目的地=7宫'] },
  '比赛': { querent: [1], other: [7], matter: [7], extra: ['我方=1宫主+月', '对方=7宫主'] },
  '求职': { querent: [1], matter: [10], other: [6], extra: ['职位=10宫主', '雇主=10宫', '薪资=2宫'] },
  '妆奁': { querent: [1], matter: [8], other: [7], extra: ['妻之产业=8宫/8宫主', '女问夫之产业同理', '龙尾=南交点'] },
  '暗敌': { querent: [1], matter: [12], other: [7], extra: ['暗敌=12宫/12宫主', '别宫之主克月/1宫主亦然'] },
  '友真伪': { querent: [1], matter: [11], other: [7], extra: ['友=11宫', '升内之星=1宫内行星'] },
  '赛马': { querent: [1], matter: [7], other: [7], extra: ['依问时小时主星落宫定名次', '落陷=骑者恐坠', '凶照冲=死险'] },
  '死之种类': { querent: [1], matter: [8], other: [7], extra: ['8宫/8宫主=死征', '吉星居8宫/升点=免暴死', '凶暴星座/凶暴恒星工程口径'] },
  '蛊': { querent: [1], matter: [12], other: [7], extra: ['12宫=暗敌/蛊', '1宫主居12宫克12宫主=被蛊'] },
  '隐疾': { querent: [1], matter: [12], other: [7], extra: ['凶星弱居12宫/12宫主居升/月居12宫克=隐疾超自然'] },
  '进财时机': { querent: [1], matter: [2], other: [7], extra: ['度距法：1宫主/月距吉星六合三合成相度数按比例计时', '定座迟/双体中/动座速', '升向2宫主冲=身财损'] },
  '流言真伪': { querent: [1], matter: [], other: [7], extra: ['1宫主与月及月Dispositor', '10/4宫头双体座益验其伪'] },
  '公敌讼战': { querent: [1], matter: [7], other: [7], extra: ['升主强本尊+月居升六合升主 vs 7宫主无尊=问主胜', '10宫主□升主=法官不利', '7宫主入相升主六合=和解'] },
  '藏失物': { querent: [1], matter: [4], other: [7], extra: ['2宫主居角或月角宫=在屋内', '2宫主居7+月居升=夫妇常室'] },
  '长寿': { querent: [1], matter: [8], other: [7], extra: ['升主/月受克或弱=非长寿多病', '土金互容+月居升六合升主=缓释'] },
  '缺席者死活': { querent: [1], matter: [8], other: [7], extra: ['升主本尊六合月=今康', '升主□8宫主/居卑宫=近历死险', '月受9/2宫主克=忧心'] },
  '突发事吉凶': { querent: [1], matter: [], other: [7], extra: ['升主强六合月=无大惧有小损', '升主兼12宫主□10宫主自角宫=慎权贵流言'] },
  '讨债': { querent: [1], matter: [2], other: [7], extra: ['8宫主=债务人财（有偿债能）', '8宫主□升主=无愿付', '升主-8宫主互容=费力得部分'] },
  '逃犯': { querent: [1], matter: [7], other: [7], extra: ['日水合+在升主容许=今无归意', '月六合升主=将再闻讯', '方向判据原文未给（南/西南仅判例结论）'] },
  '失物盗贼': { querent: [1], matter: [2], other: [7], extra: ['7宫主冲2宫主=真盗征（中龄）', '盗2宫主（8宫主）居8宫冲2宫主=难追回', '福点判据原文含但工程未接入'] },
  '合伙': { querent: [1], matter: [7], other: [7], extra: ['1宫主与7宫主恶照+性相反=勿合伙'] },
  '夫妻寿序': { querent: [1], matter: [7], other: [7], extra: ['升主强于7宫主=问主寿长', '7宫主先合8宫主=配偶先逝', 'Coley按语：此类刁问当极慎'] },
  '胎记': { querent: [1], matter: [], other: [7], extra: ['宫位胎记法：星居升=头面、2宫=颈喉依宫位类推', '判例：土摩羯受金□=膝记、月双鱼=左足、巨蟹临6宫头=胸'] },
  '藏宝': { querent: [1], matter: [4], other: [7], extra: ['龙头4宫+月六合4宫头=有藏宝', '4宫主灼日/□土=甚难寻'] },
  '攻城': { querent: [1], matter: [4], other: [7], extra: ['4/5宫主=守将（灼8宫+入相土六合=终降）', '□土=非即降', '与火互容=受贿弃守'] },
  '致富': { querent: [1], matter: [2], other: [7], extra: ['木/金居2宫、月入2宫、福点六合2宫主=按身份才具可致富'] },
  '致富之法': { querent: [1], matter: [2], other: [7], extra: ['2宫主居7宫=赌博/五宫事/妻财', '2宫主与水星互容=以才智成富', '金强居8宫=妻财为证'] },
  '人在家否': { querent: [1], matter: [7], other: [7], extra: ['7宫主不居角=不在家而近家（☌水=同伴）', '月6宫主刚离火冲=由女仆引至'] },
  '子女': { querent: [1], matter: [5], other: [7], extra: ['正反证多数决：月/5宫主居多产座、福点5宫=有子', '5宫头荒芜+火□5宫头+5宫主□土=无子'] },
  '怀孕': { querent: [1], matter: [5], other: [7], extra: ['月六合5宫头、福点5宫、5宫主☌金=已受孕', '金□土+木金冲+5宫主☌日=伪孕流产'] },
  '病者': { querent: [1], matter: [6], other: [7], extra: ['6宫主受克星=病位（克星居座定部位）', '8宫主□升主=甚危', '月六合土升主=或终愈'] },
  '婚否': { querent: [1], matter: [7], other: [7], extra: ['月居多产座六合土升主=婚证', '金□土+土□7宫主+火居7宫荒芜=罕婚', '若婚=异质多憎恶'] },
  '产业持久': { querent: [1], matter: [2], other: [7], extra: ['2宫头动座/木逆2宫=不持久', '木居2宫□土升主=奢靡渐损', '8宫主□升主=债务损慎信托'] },
  '购房地': { querent: [1], matter: [4], other: [7], extra: ['4宫主灼日+□升主=费力高价', '龙头4宫+福点Dispositor=地良', '月土吉照4宫头=有意终得'] },
  '搬迁': { querent: [1], matter: [4], other: [7], extra: ['龙头4宫+升主月吉照4宫头=宜留', '月将Void=更宜留'] },
  '信使': { querent: [1], matter: [7], other: [7], extra: ['水□土升主=信使不诚', '水☌金+入相合日（7宫主）=已递信', '月吉照水=可望回音'] },
  '赌运': { querent: [1], matter: [5], other: [7], extra: ['5宫主☌金/福点5宫=大体佳', '火□5宫头/5宫主灼日=不能大富时损'] },
  '仆役': { querent: [1], matter: [6], other: [7], extra: ['月6宫主居升六合升主=忠仆利畜', '月刚冲火2宫主=慎过信须严管'] },
  '俸禄': { querent: [1], matter: [9], other: [7], extra: ['升主与9宫主无相=甚难', '木□土升主=徒劳利微不必求'] },
  '贸易': { querent: [1], matter: [10], other: [7], extra: ['龙尾10宫=贸易不佳', '10宫主逆2宫□土=左手进右手出不致富'] },
  '海船': { querent: [1], matter: [7], other: [7], extra: ['土强六合月=今安无险', '土□金8宫主/月刚离火冲=近历覆船海盗之险'] },
  '亲邻相合': { querent: [1], matter: [3], other: [7], extra: ['3宫主□升主=少爱几近憎恶', '双方俱本尊=各守其荣互不相让'] },
  '内陆旅行': { querent: [1], matter: [3], other: [7], extra: ['3宫主□土/冲木=盗身之险不宜行', '3宫主本然强=途本身吉'] },
  '朋友建议': { querent: [1], matter: [10], other: [7], extra: ['龙尾10宫+10宫主逆□土升主=谏非善意不可从'] },
  '父产': { querent: [1], matter: [4], other: [7], extra: ['水（父征）□升主=父子少爱', '2宫主与5宫主互容+六合=可得父产', '福点5宫=产业可观'] },
  '大牲畜': { querent: [1], matter: [12], other: [7], extra: ['土居12宫□两吉星=所得甚微'] },
  '一般': { querent: [1], matter: [], other: [], extra: [] },
};

// 行星吉凶（Lilly 行星要素总表 fortune 列简化）
const BENEFIC = [5, 3];   // 木星、金星（大吉/小吉）
const MALEFIC = [6, 4];   // 土星、火星
const NEUTRAL = [0, 1, 2];

function signIdxOfLon(lon) { return Math.floor(normLon(lon) / 30); }
function houseOfLon0(lon, cusps) { // 0-based 落宫（与 chart.js houseOf 口径一致）
  const n = normLon(lon);
  for (let i = 0; i < 12; i++) {
    const a = cusps[i], b = cusps[(i + 1) % 12];
    const inR = a <= b ? (n >= a && n < b) : (n >= a || n < b);
    if (inR) return i;
  }
  return 0;
}
function normLon(l) { return ((l % 360) + 360) % 360; }

function analyzeHorary(chart, questionType = '一般', swe) {
  const factors = [];
  const byIdx = {};
  chart.planets.forEach(p => { byIdx[p.idx] = p; });
  const sun = byIdx[0], moon = byIdx[1];
  const isDay = chart.meta.isDay === 'day';

  const ascLon = chart.houses.cuspsRaw[0];
  const ascSign = signIdxOfLon(ascLon);
  const ascRuler = RULER[ascSign]; // 问事方主星

  // ---- 1. 月亮状态（卜卦之钥）----
  const moonAspects = chart.aspects.filter(a => a.p1 === 1 || a.p2 === 1);
  const moonApplying = moonAspects.filter(a => a.applying);
  if (moonApplying.length === 0) {
    factors.push({ factor: '月亮空亡(void of course)', weight: -2, detail: '月离末相位后不再入任何新相位，事难成', source: 'Bonatti146/Clavis卜卦判例' });
  } else {
    const t = moonApplying[0];
    const otherIdx = t.p1 === 1 ? t.p2 : t.p1;
    const other = byIdx[otherIdx];
    const nature = BENEFIC.includes(otherIdx) ? '吉星' : (MALEFIC.includes(otherIdx) ? '凶星' : '中性星');
    factors.push({ factor: '月亮应用' + nature, weight: BENEFIC.includes(otherIdx) ? 1 : (MALEFIC.includes(otherIdx) ? -1 : 0.5),
      detail: `月入相位 ${other ? other.zh : otherIdx}（${nature}）`, source: '通用判据' });
  }
  // 月亮燃烧（距日 < 8.5°，Lilly 燃烧限）
  const moondist = Math.abs(dif(moon.lon, sun.lon));
  if (moondist < 8.5) {
    factors.push({ factor: '月亮燃烧', weight: -1.5, detail: `月距日 ${moondist.toFixed(1)}°（<8.5°）`, source: 'Lilly相位状态卷/通用判据' });
  }
  // 月亮速度过速/过慢（新月界：日合相前后 12h 内月速>14.2°/d 或<12°/d 不利）
  if (moon.speed > 14.2 || moon.speed < 12) {
    factors.push({ factor: '月亮速率异常', weight: -0.5, detail: `月速 ${moon.speed.toFixed(2)}°/d（常态 12-14.2）`, source: '通用判据' });
  }

  // ---- 2. 升点主星状态（问事方）----
  const qr = byIdx[ascRuler];
  if (qr) {
    if (qr.retrograde) factors.push({ factor: '问事方主星逆行', weight: -1, detail: `${qr.zh}逆行，问者心意反复`, source: '通用判据' });
    if (qr.house === 6 || qr.house === 8 || qr.house === 12) {
      factors.push({ factor: '问事方主星入凶宫', weight: -1.5, detail: `${qr.zh}落${qr.house}宫（6/8/12）`, source: 'Bonatti146 宫位判据' });
    }
    if (qr.house === 1) factors.push({ factor: '问事方主星入1宫', weight: 1, detail: `${qr.zh}落1宫，问者掌控力强`, source: 'Bonatti146 判断14点' });
    const dq = Math.abs(dif(qr.lon, sun.lon));
    if (dq < 8.5) factors.push({ factor: '问事方主星燃烧', weight: -2, detail: `${qr.zh}距日 ${dq.toFixed(1)}°`, source: '通用判据' });
  }

  // ---- 3. 空亡（示义星无入相位；月亮已在步骤1判过，不重复）----
  {
    const p = byIdx[ascRuler];
    if (p) {
      const applies = chart.aspects.some(a => a.applying && (a.p1 === ascRuler || a.p2 === ascRuler));
      if (!applies) {
        factors.push({ factor: `升主空亡`, weight: -1.5, detail: `${p.zh}无入相位`, source: '通用判据' });
      }
    }
  }

  // ---- 4. 接纳（MashallahReception + 赠赐世代）----
  const receptions = [];
  for (const a of chart.aspects) {
    if (![0, 60, 90, 120, 180].includes(a.aspect)) continue;
    const pA = byIdx[a.p1], pB = byIdx[a.p2];
    if (!pA || !pB) continue;
    const rAB = reception(a.p1, a.p2, pB.lon); // B 是否在 A 的庙/擢
    const rBA = reception(a.p2, a.p1, pA.lon);
    if (rAB || rBA) {
      receptions.push({ a: pA.zh, b: pB.zh, ab: rAB, ba: rBA });
    }
  }
  if (receptions.length) {
    const mutual = receptions.filter(r => r.ab && r.ba);
    factors.push({ factor: mutual.length ? '互容(reception)' : '接纳(reception)', weight: mutual.length ? 2 : 1,
      detail: mutual.length ? `${mutual.map(r => r.a + '↔' + r.b).join('、')} 互容，事有强助` : `${receptions.map(r => r.a + '纳' + r.b).join('、')}`,
      source: 'MashallahReception/通用判据' });
  }

  // ---- 5. 相位吉凶（示义星相关）----
  for (const a of chart.aspects) {
    if (a.p1 > 6 || a.p2 > 6) continue;
    if (![0, 60, 90, 120, 180].includes(a.aspect)) continue;
    if (a.p1 === ascRuler || a.p2 === ascRuler || a.p1 === 1 || a.p2 === 1) {
      const other = byIdx[a.p1 === ascRuler || a.p1 === 1 ? a.p2 : a.p1];
      if (other && BENEFIC.includes(other.idx)) {
        factors.push({ factor: `示义星受吉星${a.aspectZh || ''}`, weight: 1, detail: `${byIdx[a.p1].zh}${a.aspectZh || ''}${byIdx[a.p2].zh}（吉星${other.zh}）`, source: '通用判据' });
      } else if (other && MALEFIC.includes(other.idx) && (a.aspect === 90 || a.aspect === 180)) {
        factors.push({ factor: `示义星受凶星刑冲`, weight: -1.5, detail: `${byIdx[a.p1].zh}${a.aspectZh || ''}${byIdx[a.p2].zh}（凶星${other.zh}）`, source: '通用判据' });
      }
    }
  }

  // ---- 6. 成事四法（Dariot）----
  // 1) 升主与事主合相/相位，尤在升点
  const qc = Q_MAP[questionType] || Q_MAP['一般'];
  const matterIdxs = qc.matter || [];
  const cuspLon = (i) => chart.houses.cuspsRaw[i - 1];
  for (const mIdx of matterIdxs) {
    const mRuler = RULER[signIdxOfLon(cuspLon(mIdx))];
    const pM = byIdx[mRuler];
    if (!pM || !qr) continue;
    const d = Math.abs(dif(pM.lon, qr.lon));
    const a = chart.aspects.find(x => (x.p1 === ascRuler && x.p2 === mRuler) || (x.p1 === mRuler && x.p2 === ascRuler));
    if (a && a.applying) {
      factors.push({ factor: '光线合相/相位(成事一法)', weight: 2, detail: `升主${qr.zh}与事主${pM.zh}${a.aspectZh || ''}（入相位），尤其落升点则无疑成`, source: 'Dariot卜卦总纲 成事四法与时限' });
    } else if (Math.abs(d) < 3 && !a) {
      factors.push({ factor: '同度近似(成事近兆)', weight: 1, detail: `升主${qr.zh}与事主${pM.zh}黄经差 ${d.toFixed(1)}°`, source: 'Dariot卜卦总纲' });
    }
  }
  // 4) 事征象入1宫
  if (matterIdxs.length) {
    const mIdx = matterIdxs[0];
    const mRuler = RULER[signIdxOfLon(cuspLon(mIdx))];
    const pM = byIdx[mRuler];
    if (pM && pM.house === 1) {
      factors.push({ factor: '事征象入1宫(成事四法)', weight: 1.5, detail: `事主${pM.zh}落1宫，无劳成`, source: 'Dariot卜卦总纲 成事四法与时限' });
    }
  }
  // 5) 传递之光（LIL-APL-10/IE-056/DART-17/BO-098）：轻星（月/水）离一重星随即与另一重星成相（合或任意相位±8°）=经中介而成
  {
    const inAspect8 = (a, b) => { const d = Math.abs(dif(a, b)); return d <= 8 || Math.abs(d - 60) <= 8 || Math.abs(d - 90) <= 8 || Math.abs(d - 120) <= 8 || Math.abs(d - 180) <= 8; };
    const lights = [byIdx[1], byIdx[2]].filter(Boolean);
    const matterRulers = matterIdxs.map(m => RULER[signIdxOfLon(cuspLon(m))]).map(i => byIdx[i]).filter(Boolean);
    for (const l of lights) {
      for (const pM of matterRulers) {
        if (!pM || !qr || l.idx === qr.idx || l.idx === pM.idx) continue;
        if (inAspect8(l.lon, qr.lon) && inAspect8(l.lon, pM.lon)) {
          factors.push({ factor: `传递之光：${l.zh}离${qr.zh}随即合${pM.zh}`, weight: 1.5, detail: `轻星离一重星随即与另一重星成相（合相或任何相位皆可），经中介而成（中介=${l.zh}落${l.house}宫所征之人/物，依宫义）`, source: 'LIL-APL-10/IE-056/DART-17/BO-098' });
        }
      }
    }
  }

  // ---- 7. 时间提示（Dariot 时限判定：升点/示义星所在星座动势）----
  const timeHint = timeOf(chart, ascSign, ascRuler, moon);

  // ---- 7b. Bonatti 月亮17阻碍 + 行星10阻碍（第二版）----
  const obstructions = { moon: [], significators: [] };
  const obsMoon = moonObstructions(chart, byIdx);
  for (const o of obsMoon) {
    const w = o[2] === 'high' ? -1 : -0.5;
    factors.push({ factor: `月亮阻碍#${o[0]} ${o[1]}`, weight: w, detail: o[1], source: 'Bonatti 映射-月亮17阻碍' });
  }
  obstructions.moon = obsMoon.map(o => ({ n: o[0], name: o[1], sev: o[2] }));
  const sigIdxs = new Set([ascRuler]);
  for (const mIdx of (Q_MAP[questionType] || Q_MAP['一般']).matter || []) {
    sigIdxs.add(RULER[signIdxOfLon(chart.houses.cuspsRaw[mIdx - 1])]);
  }
  for (const si of sigIdxs) {
    if (si == null || si > 6 || si === ascRuler && false) continue;
    if (byIdx[si]) {
      const obs = planetObstructions(byIdx[si], chart, byIdx);
      for (const o of obs) {
        const w = o[2] === 'high' ? -1 : -0.5;
        factors.push({ factor: `${byIdx[si].zh}阻碍#${o[0]} ${o[1]}`, weight: w, detail: o[1], source: 'Bonatti 映射-行星10阻碍' });
      }
      if (obs.length) obstructions.significators.push({ planet: byIdx[si].zh, hits: obs.map(o => ({ n: o[0], name: o[1], sev: o[2] })) });
    }
  }
  // 升主自身（上面已并入 sigIdxs）——若升主超七政（现代点）不判，如实
  if (ascRuler > 6) {
    factors.push({ factor: '升主为现代点', weight: 0, detail: 'Bonatti 十阻碍仅对七政定义，未判', source: '数据限制' });
  }

  // ---- 7c. 固定星（第三版：BO-099 吉性恒星助成事/凶性恒星阻其完成；BO-100 征象星合吉性恒星=幸福善终）----
  {
    const sigPlanets = Array.from(sigIdxs).filter(i => i != null && i <= 6 && byIdx[i]).map(i => byIdx[i]);
    const fixedHits = fixedStarChecks(chart, {
      significators: [
        { scope: '月亮', planets: moon ? [moon] : [] },
        { scope: '征象星', planets: sigPlanets },
      ],
    });
    for (const c of fixedHits) {
      if (c.scope === '上升' || c.scope === '4宫头') continue; // 宫位固定星留择时域（BT-011/017），卜卦只看征象星实体合相
      if (c.kind === '吉性' || c.kind === '混合') {
        factors.push({ factor: `固定星助成：${c.star}合${c.planet}`, weight: 1, detail: `吉性恒星与征象星实体合相（距${c.orb}°）`, source: 'BO-099/BO-100' });
      } else if (c.kind === '凶性') {
        factors.push({ factor: `固定星阻碍：${c.star}合${c.planet}`, weight: -1, detail: `凶性恒星阻其完成（距${c.orb}°）`, source: 'BO-099' });
      }
    }
  }

  // ---- 8. 失物专项（Griffin + Gadbury + Bonatti）----
  let special = {};
  if (questionType === '盗窃失物') {
    special = lostObject(chart, byIdx, ascSign, ascRuler);
  }

  // ---- 8.5 被控专项（CE-218~221 第八宫被控卷四判）----
  if (questionType === '被控') {
    const cv = chargeVerdict(chart, byIdx, ascSign, ascRuler);
    factors.push(...cv.factors);
    special = { ...special, charge: cv };
  }

  // ---- 8.6 问判专项（航海/得位/去职/囚释/获所求/妆奁/暗敌/友真伪/赛马，Clavis CHAP IX-XII + CHAP XIII）----
  if (['航海', '得位', '去职', '囚释', '获所求', '妆奁', '暗敌', '友真伪', '赛马', '死之种类', '蛊', '隐疾', '进财时机', '流言真伪', '公敌讼战', '藏失物', '长寿', '缺席者死活', '突发事吉凶', '讨债', '逃犯', '失物盗贼', '合伙', '夫妻寿序', '胎记', '藏宝', '攻城', '致富', '致富之法', '人在家否', '子女', '怀孕', '病者', '婚否', '产业持久', '购房地', '搬迁', '信使', '赌运', '仆役', '俸禄', '贸易', '海船', '亲邻相合', '内陆旅行', '朋友建议', '父产', '大牲畜'].includes(questionType)) {
    const qv = questionVerdict(chart, byIdx, ascSign, ascRuler, questionType, swe);
    factors.push(...qv.factors);
    special = { ...special, question: qv };
  }

  // ---- 合成 ----
  const score = factors.reduce((s, f) => s + f.weight, 0);
  const verdict = score >= 2 ? '倾向成' : (score <= -2 ? '倾向败' : '中性');

  return {
    domain: 'horary',
    questionType,
    chartTime: chart.meta.chartJd,
    verdict,
    score: Math.round(score * 10) / 10,
    keyFactors: factors,
    timeHint,
    obstructions,
    special,
    sources: ['规则库-Bonatti146.xlsx', '规则库-Dariot卜卦总纲.xlsx', '规则库-MashallahReception.xlsx',
      ...(questionType === '盗窃失物' ? ['规则库-Griffin盗窃卜卦.xlsx', '规则库-Gadbury偷窃失物.xlsx'] : []),
      ...(questionType === '被控' ? ['规则库-Clavis补遗卷.xlsx（CE-218~221 第八宫被控）'] : []),
      ...(['航海', '得位', '去职', '囚释', '获所求'].includes(questionType) ? ['规则库-Clavis补遗卷.xlsx（CE-224~226 航海 / 230~233 得位去职 / 235~236 获所求 / 238~239 囚释）'] : [])],
  };
}

// ---- 五问判共用工具（工程口径与 chargeVerdict 一致）----
const FIXED_SIGNS = [1, 4, 7, 10];    // 金牛/狮子/天蝎/水瓶
const MUTABLE_SIGNS = [2, 5, 8, 11]; // 双子/处女/射手/双鱼
const ANGULAR_H = [1, 4, 7, 10];
const BAD_HOUSES = [4, 6, 8, 12];
const FERTILE_SIGNS = [3, 7, 11];    // 巨蟹/天蝎/双鱼（水象多产座，古典通行）
const BARREN_SIGNS = [2, 4, 5];      // 双子/狮子/处女（古典通行荒芜座）
const MASCULINE_PLANETS = [0, 4, 5, 6]; // 阳星：日/火/木/土（古典通行）
const CARDINAL_SIGNS = [0, 3, 6, 9];    // 白羊/巨蟹/天秤/摩羯（动座）
function mkQTools() {
  const orb = 8;
  const isMal = f => f && (f.idx === 4 || f.idx === 6);
  const badAspect = (p, q) => {
    const a = Math.abs(dif(p.lon, q.lon));
    if (Math.abs(a - 90) <= orb || Math.abs(a - 180) <= orb) return true;
    if (a <= orb && isMal(q)) return true;
    return false;
  };
  const goodAspect = (p, q) => { const a = Math.abs(dif(p.lon, q.lon)); return a <= orb || Math.abs(a - 60) <= orb || Math.abs(a - 120) <= orb; };
  const reception = (p, q) => RULER[signIdxOfLon(p.lon)] === q.idx && RULER[signIdxOfLon(q.lon)] === p.idx;
  return { orb, badAspect, goodAspect, reception };
}

/**
 * 五问判（Clavis CHAP IX-XII 问判卷）：
 * 航海（CE-224~226，9宫）/ 得位（CE-230~231，10宫）/ 去职（CE-232~233，10宫）/
 * 囚释（CE-238~239，12宫）/ 获所求（CE-235~236，11宫）。
 * 工程口径：吉照=合/六/三±8°；恶照=刑/冲或与土火合；互容=各落对方庙；行速=非逆行（未取日度速，如实）；
 *   龙尾=南交点（北交点 lon+180）；传光=轻星（月/水）介升主与事主之间成相（8°，见成事五法）；灼=合日15°内。
 * @returns {{verdict:string, score:number, factors:Array<{weight,factor,detail,source}>}}
 */
function questionVerdict(chart, byIdx, ascSign, ascRulerIdx, qtype, swe) {
  const t = mkQTools();
  const factors = [];
  const r1 = byIdx[ascRulerIdx];
  const moon = byIdx[1], sun = byIdx[0];
  const jup = byIdx[5], ven = byIdx[3], mars = byIdx[4], sat = byIdx[6];
  const ben = [jup, ven].filter(Boolean);
  const mal = [mars, sat].filter(Boolean);
  const cusps = chart.houses.cuspsRaw;
  const rulerOf = h => byIdx[RULER[signIdxOfLon(cusps[h - 1])]];
  t.combusted = p => p && sun && Math.abs(dif(p.lon, sun.lon)) <= 15;
  const nodeIdx = byIdx[11] ? 11 : 10; // 真交点优先
  const southNode = byIdx[nodeIdx] ? normLon(byIdx[nodeIdx].lon + 180) : null;
  const q9 = rulerOf(9), q10 = rulerOf(10), q11 = rulerOf(11), q12 = rulerOf(12);
  const q4 = rulerOf(4), q6 = rulerOf(6), q8 = rulerOf(8);

  if (qtype === '航海') {
    // 判一（CE-224 险）：9宫主/宫内星受恶照 或 月/1宫主受恶照 → 航程多险；土克=病失、火/龙尾克=盗骗
    const atSea = chart.planets.filter(p => p.house === 9);
    const southAfflict = p => southNode !== null && (Math.abs(dif(p.lon, southNode)) <= 8 || Math.abs(Math.abs(dif(p.lon, southNode)) - 90) <= 8 || Math.abs(Math.abs(dif(p.lon, southNode)) - 180) <= 8);
    const harmed = (q9 && mal.some(f => f.idx !== q9.idx && (t.badAspect(q9, f) || t.badAspect(q9, sun) || t.badAspect(q9, moon) || t.badAspect(q9, r1)))) ||
      atSea.some(p => mal.some(f => f.idx !== p.idx && t.badAspect(p, f))) ||
      (moon && (t.badAspect(moon, sat) || t.badAspect(moon, mars) || southAfflict(moon))) ||
      (r1 && (t.badAspect(r1, sat) || t.badAspect(r1, mars) || southAfflict(r1)));
    if (harmed) {
      const bySat = (moon && t.badAspect(moon, sat)) || (r1 && t.badAspect(r1, sat));
      const byFire = (moon && (t.badAspect(moon, mars) || southAfflict(moon))) || (r1 && (t.badAspect(r1, mars) || southAfflict(r1)));
      factors.push({ weight: -1, factor: '判一：航程多险', detail: `征象受克/大损=航程多险${bySat ? '；土克=久病或失货之危' : ''}${byFire ? '；火或龙尾克=盗贼海盗之害/诓骗' : ''}`, source: 'CE-224' });
    }
    // 判二（CE-225 成）：1宫主与9宫主吉照/互容、吉星相助 → 航行有成；9宫固定座或征象行迟=航程长
    const goodNav = (r1 && q9 && (t.goodAspect(r1, q9) || t.reception(r1, q9))) || (moon && ben.some(b => t.goodAspect(moon, b)));
    if (goodNav) {
      const long = FIXED_SIGNS.includes(signIdxOfLon(cusps[8])) || (q9 && !q9.retrograde && (q9.speed || 0) < 0.5);
      factors.push({ weight: 1, factor: '判二：航行有成', detail: `征象强而无损、1宫主与9宫主吉照/互容、吉星相助=航行幸福顺遂${long ? '；9宫固定座/征象行迟=航程长' : ''}`, source: 'CE-225' });
    }
    // 判三（CE-226 危）：1宫主受8/6/12/4宫主克
    if (r1) {
      if (q8 && t.badAspect(r1, q8)) factors.push({ weight: -2, factor: '判三：客死航途', detail: '1宫主受8宫主克=客死航途、不复归来', source: 'CE-226' });
      if (q6 && t.badAspect(r1, q6)) factors.push({ weight: -1, factor: '判三：途中病伤', detail: '受6宫主克或居6宫受土火克=途中病/伤', source: 'CE-226' });
      if (q12 && t.badAspect(r1, q12)) factors.push({ weight: -1, factor: '判三：囚禁之惧', detail: '受12宫主克=囚禁之惧', source: 'CE-226' });
      if (q4 && t.badAspect(r1, q4)) factors.push({ weight: -2, factor: '判三：葬身鱼腹', detail: '受4宫主克=葬身鱼腹', source: 'CE-226' });
    }
  } else if (qtype === '得位') {
    // 判一（CE-230 可得）：10宫主或日与1宫主/月吉照、互容 → 可得；1宫主/月居10宫 或 10宫主/日居升点 且互吉照=必得
    const person = p => p && (t.goodAspect(p, r1) || t.goodAspect(p, moon) || t.reception(p, r1) || t.reception(p, moon));
    if (q10 && person(q10)) factors.push({ weight: 1, factor: '判一：可得所求之位', detail: '10宫主与1宫主/月吉照、互容（本宫或擢升）、六合三合=用其手段可得', source: 'CE-230' });
    if (sun && person(sun)) factors.push({ weight: 1, factor: '判一：日吉照得位', detail: '太阳与1宫主/月吉照、互容=可得所求之位', source: 'CE-230' });
    const r1in10 = r1 && ANGULAR_H.includes(10) && r1.house === 10;
    const moonIn10 = moon && moon.house === 10;
    const q10InAsc = q10 && q10.house === 1;
    const sunInAsc = sun && sun.house === 1;
    const mutualGood = (r1 && q10 && (t.goodAspect(r1, q10) || t.reception(r1, q10))) || (moon && q10 && (t.goodAspect(moon, q10) || t.reception(moon, q10)));
    if ((r1in10 || moonIn10 || q10InAsc || sunInAsc) && mutualGood) factors.push({ weight: 1, factor: '判一：必得', detail: '1宫主/月居10宫、或10宫主/日居升点、且互相吉照=必得', source: 'CE-230' });
    // 判二（CE-231 不得）：全无吉照/互容/居宫诸证
    const anyGood = factors.some(f => f.source === 'CE-230');
    if (!anyGood) factors.push({ weight: -1, factor: '判二：不得所求之位', detail: '图中全无吉照/传光/互容/居宫诸证=不得所求之位，纵被再三美言许诺', source: 'CE-231' });
  } else if (qtype === '去职') {
    // 判一（CE-232 稳）：征象间吉照/互容 → 位稳；1宫主/月吉照居10宫之木金尤验
    const stable = (r1 && q10 && (t.goodAspect(r1, q10) || t.reception(r1, q10))) || (moon && q10 && (t.goodAspect(moon, q10) || t.reception(moon, q10)));
    if (stable) {
      const benIn10 = ben.some(b => b.house === 10 && ((r1 && t.goodAspect(r1, b)) || (moon && t.goodAspect(moon, b))));
      factors.push({ weight: 1, factor: '判一：职位稳固', detail: `征象间有吉照/互容=无去职之惧${benIn10 ? '；1宫主/月吉照居10宫之木金尤验' : ''}`, source: 'CE-232' });
    }
    // 判二（CE-233 逐）：问主征象（1宫主/月）恶照"与凶星互容者"、或"照日/10宫主之星"→ 有被逐之险
    // 工程：与凶星互容=行星落凶星庙 或 双向互容（单向接纳近似，如实）；照日/10宫主=六三合照彼星（排除自身）
    const evilTarget = p => mal.some(f => f.idx !== p.idx && (t.reception(p, f) || RULER[signIdxOfLon(p.lon)] === f.idx)) ||
      (q10 && p.idx !== q10.idx && t.goodAspect(p, q10)) || (sun && p.idx !== sun.idx && t.goodAspect(p, sun));
    const r1Evil = r1 && chart.planets.some(p => p.idx !== r1.idx && evilTarget(p) && t.badAspect(r1, p));
    const moonEvil = moon && chart.planets.some(p => p.idx !== moon.idx && evilTarget(p) && t.badAspect(moon, p));
    if (r1Evil || moonEvil) factors.push({ weight: -2, factor: '判二：有被逐之险', detail: '问主征象恶照（与凶星互容者、或照日/10宫主之星）=有被逐之险——逐之者即克问主征象之星所表之人', source: 'CE-233' });
  } else if (qtype === '囚释') {
    // 判一（CE-238 久囚）：固定座升且其主居角（尤土）→ 久囚；1宫主/月居4/6/8/12受克（灼/逆）同断
    const fixedAsc = FIXED_SIGNS.includes(ascSign);
    const r1Angular = r1 && ANGULAR_H.includes(r1.house);
    if (fixedAsc && r1Angular && (r1.idx === 6 || r1.idx === 4)) factors.push({ weight: -2, factor: '判一：久长之苦囚', detail: '固定座升、其主居角（尤土星）=久长之苦囚', source: 'CE-238' });
    const r1Bad = r1 && BAD_HOUSES.includes(r1.house) && (t.combusted(r1) || r1.retrograde || mal.some(f => t.badAspect(r1, f)));
    const moonBad = moon && BAD_HOUSES.includes(moon.house) && (t.combusted(moon) || moon.retrograde || mal.some(f => t.badAspect(moon, f)));
    if (r1Bad || moonBad) factors.push({ weight: -1, factor: '判一：久囚（征象受克）', detail: '1宫主或月居4/6/8/12宫受克/失幸（灼/逆）同断久囚', source: 'CE-238' });
    // 判二（CE-239 速释）：1宫主/月行速、或强于12宫主、居动座、受木金吉照 → 速释
    const swift = (r1 && !r1.retrograde) || (moon && !moon.retrograde);
    const mutable = (r1 && MUTABLE_SIGNS.includes(signIdxOfLon(r1.lon))) || (moon && MUTABLE_SIGNS.includes(signIdxOfLon(moon.lon)));
    const stronger = !!q12 && (((r1 && (r1.totalScore || 0) > (q12.totalScore || 0)) || (moon && (moon.totalScore || 0) > (q12.totalScore || 0))));
    const benGood = (r1 && ben.some(b => t.goodAspect(r1, b))) || (moon && ben.some(b => t.goodAspect(moon, b)));
    if ((swift || mutable || stronger) && benGood) factors.push({ weight: 2, factor: '判二：速获释', detail: `1宫主或月行速${stronger ? '、强于12宫主（牢狱征象）' : ''}、居动座、且受木金吉照=将速获释`, source: 'CE-239' });
  } else if (qtype === '获所求') {
    // 判一（CE-235 得）：月/1宫主六三合11宫主、吉星居11宫、互容 → 可得
    const q11Good = (q11 && ((moon && (t.goodAspect(moon, q11) || t.reception(moon, q11))) || (r1 && (t.goodAspect(r1, q11) || t.reception(r1, q11)))));
    const benIn11 = ben.some(b => b.house === 11);
    if (q11Good || benIn11) factors.push({ weight: 1, factor: '判一：可得所望', detail: `月/1宫主六合三合11宫主${benIn11 ? '、吉星居11宫' : ''}、互容/居宫=可得其所望`, source: 'CE-235' });
    // 判二（CE-236 不得）：征象间恶照、灼/降/逆、土火恶照
    const crossBad = (q11 && ((moon && t.badAspect(moon, q11)) || (r1 && t.badAspect(r1, q11))));
    const afflicted = (r1 && (t.combusted(r1) || r1.retrograde)) || (moon && (t.combusted(moon) || moon.retrograde));
    const satMars = (r1 && mal.some(f => t.badAspect(r1, f))) || (moon && mal.some(f => t.badAspect(moon, f)));
    if (crossBad || afflicted || satMars) factors.push({ weight: -1, factor: '判二：不得所望', detail: '征象间恶照、或灼/降/逆、或土火施恶照=不得；指名物（如金钱）察表该物之星与宫', source: 'CE-236' });
  } else if (qtype === '妆奁') {
    // 判一（CE-215 厚）：8宫主强、8宫无凶星临、木金吉照8宫主或居8宫（木/金/龙头/福点居8宫无克）→ 妆奁丰厚且易得
    const q8 = rulerOf(8);
    const dragonHeadIn8 = nodeIdx !== null && (nodeIdx === 8 || byIdx[nodeIdx].house === 8);
    const q8Strong = q8 && !q8.retrograde && !t.combusted(q8) && !BAD_HOUSES.includes(q8.house) && !mal.some(f => f.idx !== q8.idx && t.badAspect(q8, f));
    const benIn8 = ben.some(b => b.house === 8 && !mal.some(f => f.idx !== b.idx && t.badAspect(b, f)));
    if (q8Strong && ben.some(b => t.goodAspect(q8, b))) factors.push({ weight: 1, factor: '判一：妆奁丰厚且易得', detail: '8宫主强、8宫无凶星临、木金吉照=妆奁丰厚；木/金/龙头/福点居8宫无克=得之甚易', source: 'CE-215' });
    if (benIn8) factors.push({ weight: 1, factor: '判一：妆奁丰厚（吉星居8宫）', detail: '木/金/龙头/福点居8宫且无克=妆奁丰厚、得之甚易', source: 'CE-215' });
    // 判二（CE-216 薄）：征象星弱而失幸（灼/逆/缓行、受凶星克）=奁微多烦
    const weakSig = [q8, r1, moon].filter(Boolean).some(p => t.combusted(p) || p.retrograde || (p.speed || 0) < 0.1 || mal.some(f => f.idx !== p.idx && t.badAspect(p, f)));
    if (weakSig) factors.push({ weight: -1, factor: '判二：妆奁微薄多烦', detail: '征象星弱而失幸（灼/逆/缓行、受凶星克）=妆奁甚微薄、得之过程多烦扰', source: 'CE-216' });
    // 判三（CE-217 无望）：1宫主刑冲8宫主、土火游走居8宫、龙尾居8宫=盼奁无益
    const q1Cross = r1 && q8 && (Math.abs(dif(r1.lon, q8.lon)) <= 8 || Math.abs(Math.abs(dif(r1.lon, q8.lon)) - 180) <= 8);
    const malPeregrineIn8 = mal.some(f => f.house === 8 && !RULER[signIdxOfLon(f.lon)] === f.idx && !EXALT_SIGNS[f.idx]);
    const southIn8 = southNode !== null && Math.floor(normLon(southNode) / 30) === signIdxOfLon(cusps[7]);
    if (q1Cross || malPeregrineIn8 || southIn8) factors.push({ weight: -2, factor: '判三：盼奁无益', detail: `1宫主刑冲8宫主${q1Cross ? '' : ''}、土火游走居8宫、或龙尾居8宫=奁小无值/被诓骗/大受其损，宁弃勿求`, source: 'CE-217' });
  } else if (qtype === '暗敌') {
    // 判一（CE-240 有暗敌）：1宫主恶照12宫主或12宫内星、或别宫之主克月/1宫主
    const q12 = rulerOf(12);
    const in12 = chart.planets.filter(p => p.house === 12 && p.idx !== r1.idx);
    const r1Hit12 = r1 && ((q12 && t.badAspect(r1, q12)) || in12.some(p => t.badAspect(r1, p)));
    const otherHit = chart.planets.some(p => {
      if (p.idx === r1.idx || p.idx === moon.idx) return false;
      const isRuler = Object.values(RULER).includes(p.idx);
      if (!isRuler) return false;
      return (moon && t.badAspect(moon, p)) || (r1 && t.badAspect(r1, p));
    });
    if (r1Hit12 || otherHit) factors.push({ weight: -1, factor: '判一：有暗敌且受其害', detail: '1宫主恶照12宫主或12宫内星=问主有暗敌受其害；别宫之主克月/1宫主亦然', source: 'CE-240' });
    // 判二（CE-241 无）：问主征象与吉星吉照且不受凶星恶照=无暗敌
    const benGood = (r1 && ben.some(b => t.goodAspect(r1, b))) || (moon && ben.some(b => t.goodAspect(moon, b)));
    const noMal = !((r1 && mal.some(f => t.badAspect(r1, f))) || (moon && mal.some(f => t.badAspect(moon, f))));
    if (benGood && noMal) factors.push({ weight: 1, factor: '判二：无暗敌', detail: '问主征象与吉星吉照、且不受凶星或任何行星恶照=无暗敌', source: 'CE-241' });
  } else if (qtype === '友真伪') {
    // 吉照（CE-237）：征象星吉照月/1宫主或升内之星=忠友；恶照=伪友
    const inAsc = chart.planets.filter(p => p.house === 1 && p.idx !== r1.idx);
    const target = p => (moon && t.goodAspect(p, moon)) || (r1 && p.idx !== r1.idx && t.goodAspect(p, r1)) || inAsc.some(a => a.idx !== p.idx && t.goodAspect(p, a));
    const anyGood = chart.planets.some(p => p.idx !== r1.idx && target(p));
    const anyBad = chart.planets.some(p => p.idx !== r1.idx && (moon && t.badAspect(p, moon)) || (r1 && p.idx !== r1.idx && t.badAspect(p, r1)) || inAsc.some(a => a.idx !== p.idx && t.badAspect(p, a)));
    if (anyGood) factors.push({ weight: 1, factor: '判一：友忠实可信', detail: '征象星吉照月/1宫主或升内之星=所问之友忠实、正直、可信', source: 'CE-237' });
    if (anyBad) factors.push({ weight: -1, factor: '判二：伪友不可托信', detail: '征象星恶照月/1宫主或升内之星=伪友、不可托信', source: 'CE-237' });
  } else if (qtype === '赛马') {
    // 判一（CE-244 名次）：察问时之小时主星——居升点=问主之马胜；居天顶=第二；居11/3宫=第三；居7宫=首末之间；居4宫=最后
    const hl = hourLordIdx(chart, byIdx, swe);
    if (hl !== null) {
      const h = byIdx[hl] && byIdx[hl].house;
      const place = h === 1 ? 1 : (h === 10 ? 2 : ((h === 11 || h === 3) ? 3 : (h === 7 ? '首末之间' : (h === 4 ? '最后' : null))));
      if (place !== null) {
        const w = place === 1 ? 2 : (place === 2 ? 1 : (place === 3 ? 0.5 : (place === '首末之间' ? 0 : -1)));
        factors.push({ weight: w, factor: `判一：小时主星居${h}宫=第${place}名`, detail: `问时小时主星（${byIdx[hl].zh}）居${h}宫${place === 1 ? '=问主之马胜' : `=${place === '首末之间' ? '名次首末之间' : '第' + place + '名'}`}`, source: 'CE-244' });
      }
    }
    // 判二（CE-244 险）：小时主星落陷=骑者恐惧恐坠；凶星照=折肢；凶照为冲=死险
    if (hl !== null) {
      const p = byIdx[hl];
      const fallen = EXALT_SIGNS[p.idx] !== undefined && signIdxOfLon(p.lon) === FALL_SIGNS[p.idx];
      if (fallen) factors.push({ weight: -1, factor: '判二：骑者恐坠', detail: '小时主星落陷=骑者恐惧、且恐坠马', source: 'CE-244' });
      const malHit = mal.some(f => f.idx !== hl && t.badAspect(p, f));
      const squareOpp = mal.some(f => f.idx !== hl && (Math.abs(dif(p.lon, f.lon)) <= 8 || Math.abs(Math.abs(dif(p.lon, f.lon)) - 180) <= 8));
      if (malHit) factors.push({ weight: -1, factor: '判二：折肢之险', detail: '凶星照小时主星（尤自凶位）=将折肢', source: 'CE-244' });
      if (squareOpp) factors.push({ weight: -2, factor: '判二：死险', detail: '凶星冲照小时主星=骑者有死险', source: 'CE-244' });
    }
  } else if (qtype === '死之种类') {
    // 判一（CE-211 自然死）：1宫主或月与8宫主/宫内星吉照、吉星居8宫/8宫有尊/吉照月亮
    const q8 = rulerOf(8);
    const in8 = chart.planets.filter(p => p.house === 8);
    const q1MoonGood = (r1 && q8 && t.goodAspect(r1, q8)) || (moon && q8 && t.goodAspect(moon, q8)) ||
      in8.some(p => (r1 && t.goodAspect(r1, p)) || (moon && t.goodAspect(moon, p)));
    const benIn8Dignity = ben.some(b => b.house === 8 && (RULER[signIdxOfLon(b.lon)] === b.idx || EXALT_SIGNS[b.idx] === signIdxOfLon(b.lon)));
    const benMoon = ben.some(b => moon && t.goodAspect(moon, b));
    if (q1MoonGood || (benIn8Dignity && benMoon)) factors.push({ weight: 1, factor: '判一：自然之死', detail: '问主宫主/月与8宫主或宫内星吉照、吉星居8宫/8宫有尊/吉照月亮=自然之死', source: 'CE-211' });
    // 判二（CE-212 免暴死）：木金分别居8宫与升点；或8宫主/月/1宫主不落凶暴星座、不近凶暴恒星
    const splitBen = (jup && ven && ((jup.house === 8 && ven.house === 1) || (ven.house === 8 && jup.house === 1)));
    const VIOLENT_SIGNS = [0, 4, 7, 8]; // 白羊/狮子/天蝎/射手（工程口径，Clavis 语境火象+天蝎）
    const nearViolentStar = lon => nearStars(lon, 5).some(s => isMalefic(s));
    const noViolent = [q8, moon, r1].filter(Boolean).every(p => !VIOLENT_SIGNS.includes(signIdxOfLon(p.lon)) && !nearViolentStar(p.lon));
    if (splitBen || noViolent) factors.push({ weight: 1, factor: '判二：不受暴死', detail: `木金分居8宫与升点；或8宫主/月/1宫主不落凶暴星座、不近凶暴恒星（凶暴星座=白羊/狮子/天蝎/射手、凶暴恒星=凶性恒星±5° 工程口径）=不受暴死之害`, source: 'CE-212' });
    // 判三（CE-213 暴死）：日月落凶暴星座且互不相照、或自角宫刑冲、或受凶星克；土火10宫火象近凶暴恒星=坠亡、土巨蟹=溺、火火象=铁火
    const lumViolent = sun && moon && VIOLENT_SIGNS.includes(signIdxOfLon(sun.lon)) && VIOLENT_SIGNS.includes(signIdxOfLon(moon.lon));
    const lumNoGood = sun && moon && !t.goodAspect(sun, moon);
    const lumFromAngle = sun && moon && [sun.house, moon.house].some(h => ANGULAR_H.includes(h)) && (Math.abs(dif(sun.lon, moon.lon)) <= 8 || Math.abs(Math.abs(dif(sun.lon, moon.lon)) - 180) <= 8);
    const lumMal = (sun && mal.some(f => t.badAspect(sun, f))) || (moon && mal.some(f => t.badAspect(moon, f)));
    if ((lumViolent && lumNoGood) || lumFromAngle || lumMal) {
      factors.push({ weight: -1, factor: '判三：暴死之危', detail: '日月落凶暴星座且互不相照、或自角宫刑冲、或受凶星克=暴死之危（土火于8宫有尊更验）', source: 'CE-213' });
      const sat10Fire = sat && sat.house === 10 && [0, 4, 8].includes(signIdxOfLon(sat.lon)) && ((moon && t.badAspect(sat, moon)) || (r1 && t.badAspect(sat, r1))) && nearViolentStar(sat.lon);
      const mars10Fire = mars && mars.house === 10 && [0, 4, 8].includes(signIdxOfLon(mars.lon)) && ((moon && t.badAspect(mars, moon)) || (r1 && t.badAspect(mars, r1))) && nearViolentStar(mars.lon);
      const satCancer = sat && signIdxOfLon(sat.lon) === 3 && ((moon && t.badAspect(sat, moon)) || (r1 && t.badAspect(sat, r1)));
      if (sat10Fire) factors.push({ weight: -2, factor: '判三：高处坠亡', detail: '土居10宫火象克月/1宫主且近凶暴恒星=高处坠亡', source: 'CE-213' });
      if (satCancer) factors.push({ weight: -2, factor: '判三：溺死', detail: '土居巨蟹克月/1宫主=溺死', source: 'CE-213' });
      if (mars10Fire) factors.push({ weight: -2, factor: '判三：铁火刀剑之死', detail: '火居火象座克月/1宫主=铁/火/刀剑/火器之死', source: 'CE-213' });
    }
    // 判四（CE-214 病性·信息型）：自然死时 8 宫主性定病
    if (q8) {
      const D = { 6: '久疟/水肿/痨瘵', 4: '刀伤/热性之疾如热病', 0: '元气流滞/胸膜炎', 2: '癫狂/疯病/肺痨/嗜睡', 1: '痰湿冷湿之疾、或竟溺死' };
      if (D[q8.idx]) factors.push({ weight: 0, factor: '判四：自然死之病性', detail: `8宫主为${q8.zh}：${D[q8.idx]}`, source: 'CE-214' });
    }
  } else if (qtype === '蛊') {
    // CE-242：1宫主居12宫合/刑/冲12宫主；6宫主居12宫；12宫主居6宫恶照月/1宫主；一星兼1/12宫主
    const q6 = rulerOf(6), q12 = rulerOf(12);
    const sqOpCj = (p, q) => { const a = Math.abs(dif(p.lon, q.lon)); return a <= 8 || Math.abs(a - 90) <= 8 || Math.abs(a - 180) <= 8; };
    const r1In12 = r1 && q12 && r1.house === 12 && sqOpCj(r1, q12);
    const q6In12 = q6 && q6.house === 12;
    const q12In6 = q12 && q12.house === 6 && ((moon && t.badAspect(q12, moon)) || (r1 && t.badAspect(q12, r1)));
    if (r1In12 || q6In12 || q12In6) factors.push({ weight: -1, factor: '判一：被蛊或受恶人制', detail: `1宫主居12宫克12宫主${r1In12 ? '、' : ''}6宫主居12宫${q6In12 ? '、' : ''}12宫主居6宫恶照月/1宫主=其人被蛊或受恶人制`, source: 'CE-242' });
    if (r1 && q12 && r1.idx === q12.idx) factors.push({ weight: -1, factor: '判二：病超乎自然', detail: '一星兼1/12宫主=其病超乎自然', source: 'CE-242' });
  } else if (qtype === '隐疾') {
    // CE-243：凶星弱居12宫；12宫主居升点；月居12宫克12宫主=隐疾超自然（Coley 按语：此道多争议，不妄断）
    const q12 = rulerOf(12);
    const malWeakIn12 = mal.some(f => f.house === 12 && (f.retrograde || t.combusted(f)));
    const q12InAsc = q12 && q12.house === 1;
    const moonIn12 = moon && q12 && moon.house === 12 && (Math.abs(dif(moon.lon, q12.lon)) <= orb || Math.abs(Math.abs(dif(moon.lon, q12.lon)) - 90) <= orb || Math.abs(Math.abs(dif(moon.lon, q12.lon)) - 180) <= orb);
    if (malWeakIn12 || q12InAsc || moonIn12) factors.push({ weight: -1, factor: '判：隐疾超自然', detail: `凶星弱居12宫${malWeakIn12 ? '、' : ''}12宫主居升点${q12InAsc ? '、' : ''}月居12宫克12宫主=隐疾且超乎自然之大证（Coley 按语：此道近日多争议，不妄断）`, source: 'CE-243' });
  } else if (qtype === '进财时机') {
    // CE-260 度距法（信息型）：1宫主/月距吉星六合/三合成相度数按比例计时；定座迟/双体中/动座速
    if (moon && jup) {
      const a = Math.abs(dif(moon.lon, jup.lon));
      const dist = Math.min(Math.abs(a - 60), Math.abs(a - 120));
      if (dist <= 30) {
        const aspName = Math.abs(a - 60) < Math.abs(a - 120) ? '六合' : '三合';
        const spd = [1, 4, 7, 10].includes(signIdxOfLon(moon.lon)) ? '定座迟' : ([2, 5, 8, 11].includes(signIdxOfLon(moon.lon)) ? '双体中' : '动座速');
        factors.push({ weight: 0, factor: '判一：进财时机（度距法）', detail: `月距木星${aspName}成相约 ${Math.round(dist * 10) / 10}°（月落${spd}座，按事酌定日/月/年）=此间最有望得财`, source: 'CE-260' });
      }
    }
    const q2 = rulerOf(2);
    if (r1 && q2 && (Math.abs(dif(r1.lon, q2.lon)) <= 8 || Math.abs(Math.abs(dif(r1.lon, q2.lon)) - 180) <= 8) && isMal(q2)) {
      factors.push({ weight: -1, factor: '判二：身财两损', detail: `升点向2宫主（${q2.zh}）之冲/合=身财两损之时`, source: 'CE-260' });
    }
  } else if (qtype === '流言真伪') {
    // CE-264：1宫主刑冲吉星（金/木=月Dispositor兼10宫主）、月刚离凶星冲→不真；10/4宫头双体座益验
    const q1BadBen = r1 && ((ven && t.badAspect(r1, ven)) || (jup && t.badAspect(r1, jup)));
    const moonBad = moon && mal.some(f => t.badAspect(moon, f));
    const MUT_H = [2, 5, 8, 11];
    const angDouble = MUT_H.includes(signIdxOfLon(cusps[9])) && MUT_H.includes(signIdxOfLon(cusps[3]));
    if (q1BadBen || moonBad) {
      factors.push({ weight: -1, factor: '判一：流言不真', detail: `1宫主刑冲吉星${q1BadBen ? '（金/木=月Dispositor兼10宫主）' : ''}、月刚离凶星冲=流言不真`, source: 'CE-264' });
      if (angDouble) factors.push({ weight: -1, factor: '判二：10/4宫头双体座益验其伪', detail: '天顶/4宫头皆双体座=其伪益验', source: 'CE-264' });
    }
  } else if (qtype === '公敌讼战') {
    // CE-279：升主强本尊+月居升六合升主 vs 7宫主无尊=问主胜；7宫主入相升主六合=和解；10宫主□升主=法官不利
    const q7 = rulerOf(7);
    const r1Strong = r1 && (RULER[signIdxOfLon(r1.lon)] === r1.idx || EXALT_SIGNS[r1.idx] === signIdxOfLon(r1.lon));
    const moonInAsc = moon && moon.house === 1 && r1 && t.goodAspect(moon, r1);
    const q7Weak = q7 && RULER[signIdxOfLon(q7.lon)] !== q7.idx && EXALT_SIGNS[q7.idx] !== signIdxOfLon(q7.lon);
    if (r1Strong && q7Weak && (moonInAsc || !moon)) factors.push({ weight: 1, factor: '判一：问主可胜敌', detail: `升主（${r1.zh}）强本尊、7宫主（${q7.zh}）无尊、月居升六合升主=问主较强可胜敌`, source: 'CE-279' });
    const q7Apply = q7 && r1 && t.goodAspect(q7, r1) && (q7.speed || 0) > 0;
    if (q7Apply) factors.push({ weight: 1, factor: '判二：终归和解', detail: `7宫主入相升主六合（${q7.zh}顺行向${r1.zh}）=终和解`, source: 'CE-279' });
    const q10 = rulerOf(10);
    if (r1 && q10 && q10.idx !== r1.idx && (Math.abs(dif(q10.lon, r1.lon)) <= 8 || Math.abs(Math.abs(dif(q10.lon, r1.lon)) - 90) <= 8 || Math.abs(Math.abs(dif(q10.lon, r1.lon)) - 180) <= 8)) factors.push({ weight: -1, factor: '判三：法官不利消息', detail: `10宫主（${q10.zh}）□升主=法官/大律师之不利消息`, source: 'CE-279' });
    if (q7 && ben.some(b => t.goodAspect(q7, b))) factors.push({ weight: 0, factor: '判四：对方有望多友', detail: '7宫主六合吉星=对方有望多友（然不阻问主之胜）', source: 'CE-279' });
  } else if (qtype === '藏失物') {
    // CE-270：2宫主居角或月角宫=在屋内；2宫主居7+月居升=夫妇常室
    const q2 = rulerOf(2);
    const q2Angle = q2 && ANGULAR_H.includes(q2.house);
    const moonAngle = moon && ANGULAR_H.includes(moon.house);
    if (q2Angle || moonAngle) {
      factors.push({ weight: 1, factor: '判一：在屋内', detail: `${q2Angle ? `2宫主（${q2.zh}）居角、` : ''}${moonAngle ? '月角宫' : ''}=在屋内`, source: 'CE-270' });
      if (q2 && q2.house === 7 && moon && moon.house === 1) factors.push({ weight: 1, factor: '判二：藏于夫妇常室', detail: `2宫主居7宫+月居升=物藏于问主夫妇最常之室，宜细搜`, source: 'CE-270' });
    }
  } else if (qtype === '长寿') {
    // CE-250：升主/月受克或弱=非长寿多病；土金互容+月居升六合升主=缓释
    const q8 = rulerOf(8);
    const rec = (p, q) => RULER[signIdxOfLon(p.lon)] === q.idx || EXALT_SIGNS[q.idx] === signIdxOfLon(p.lon);
    const r1MoonWeak = [r1, moon].filter(Boolean).some(p => t.combusted(p) || p.retrograde || (RULER[signIdxOfLon(p.lon)] !== p.idx && EXALT_SIGNS[p.idx] !== signIdxOfLon(p.lon) && [0, 4, 7, 8].includes(signIdxOfLon(p.lon))));
    const r1MoonMal = [r1, moon].filter(Boolean).some(p => mal.some(f => f.idx !== p.idx && t.badAspect(p, f)));
    if (r1MoonWeak || r1MoonMal) factors.push({ weight: -1, factor: '判一：非长寿多病', detail: `升主/月受克${r1MoonMal ? '（土火恶照）' : ''}或弱（灼/逆/凶暴星座）=按因非长寿、多病`, source: 'CE-250' });
    if (sat && ven && (rec(sat, ven) || rec(ven, sat)) && moon && moon.house === 1 && r1 && t.goodAspect(moon, r1)) {
      factors.push({ weight: 1, factor: '判二：其判部分缓释', detail: '土金互容（庙/擢升）+月居升六合升主=非长寿之判部分缓释', source: 'CE-250' });
    }
  } else if (qtype === '缺席者死活') {
    // CE-252：升主本尊六合月=今康；升主□8宫主或居卑宫=近历死险；月受9/2宫主克=忧心
    const q8b = rulerOf(8);
    const r1Dignity = r1 && (RULER[signIdxOfLon(r1.lon)] === r1.idx || EXALT_SIGNS[r1.idx] === signIdxOfLon(r1.lon));
    if (r1Dignity && moon && r1 && t.goodAspect(r1, moon)) factors.push({ weight: 1, factor: '判一：今康有望', detail: `升主（${r1.zh}）本尊、六合月=缺席者目前在健康中`, source: 'CE-252' });
    if (r1 && q8b && (t.badAspect(r1, q8b) || BAD_HOUSES.includes(r1.house))) factors.push({ weight: -1, factor: '判二：近历死险/大病', detail: `升主□8宫主或居卑宫（${r1.house}）=近历死险或大病`, source: 'CE-252' });
    const q9 = rulerOf(9), q2b = rulerOf(2);
    if (moon && ((q9 && t.badAspect(moon, q9)) || (q2b && t.badAspect(moon, q2b)))) factors.push({ weight: -1, factor: '判三：忧于宗教/远行/乏钱', detail: `月受9宫主/2宫主克=心忧宗教/远行/乏钱（升主居12宫则被囚）`, source: 'CE-252' });
  } else if (qtype === '突发事吉凶') {
    // CE-254：升主强（本尊）且六合月=无大惧有小损；升主兼12宫主□10宫主自角宫=慎权贵流言
    const q10b = rulerOf(10), q12 = rulerOf(12);
    const r1Strong2 = r1 && (RULER[signIdxOfLon(r1.lon)] === r1.idx || EXALT_SIGNS[r1.idx] === signIdxOfLon(r1.lon));
    if (r1Strong2 && moon && r1 && t.goodAspect(r1, moon)) factors.push({ weight: 1, factor: '判一：无大惧、有小损', detail: `升主（${r1.zh}）强且六合月=无需大惧、然不免小损`, source: 'CE-254' });
    if (r1 && q12 && r1.idx === q12.idx && q10b && q10b.idx !== r1.idx && t.badAspect(r1, q10b) && ANGULAR_H.includes(r1.house)) {
      factors.push({ weight: -1, factor: '判二：慎权贵/流言', detail: '升主兼12宫主□10宫主（月Dispositor）自角宫=慎权贵/当权/流言（龙尾10宫）', source: 'CE-254' });
    }
  } else if (qtype === '讨债') {
    // CE-261：8宫主（债务人财）本尊=有偿债能；8宫主□升主/7宫主在升主容许=无愿付；升主-8宫主互容=费力得部分；8宫主冲木星=不全
    const q8c = rulerOf(8), q7 = rulerOf(7);
    const q8Dignity = q8c && (RULER[signIdxOfLon(q8c.lon)] === q8c.idx || EXALT_SIGNS[q8c.idx] === signIdxOfLon(q8c.lon));
    if (q8Dignity) factors.push({ weight: 1, factor: '判一：有偿债之能', detail: `8宫主（${q8c.zh}）本尊=债务人有能力偿还`, source: 'CE-261' });
    const rec2 = (p, q) => RULER[signIdxOfLon(p.lon)] === q.idx || EXALT_SIGNS[q.idx] === signIdxOfLon(p.lon);
    const unwilling = q8c && r1 && (t.badAspect(q8c, r1) || (q7 && Math.abs(dif(q7.lon, r1.lon)) <= 8));
    if (unwilling) factors.push({ weight: -1, factor: '判二：无大愿付', detail: `8宫主□升主${(q7 && Math.abs(dif(q7.lon, r1.lon)) <= 8) ? '、7宫主在升主容许内' : ''}=债务人无大愿付款`, source: 'CE-261' });
    if (q8c && r1 && (rec2(q8c, r1) || rec2(r1, q8c))) factors.push({ weight: 0, factor: '判三：费力得部分', detail: `升主-8宫主互容=${q8c.zh}与${r1.zh}互容=费力终得部分（非全债）`, source: 'CE-261' });
    if (q8c && jup && (Math.abs(dif(q8c.lon, jup.lon)) <= 8 || Math.abs(Math.abs(dif(q8c.lon, jup.lon)) - 180) <= 8)) factors.push({ weight: -1, factor: '判四：不得全债', detail: `8宫主冲木星（自8/2两宫=双方财宫相碍）=不得全债`, source: 'CE-261' });
  } else if (qtype === '逃犯') {
    // CE-281：日水合+在升主四分之容许=今无归意；月六合升主=将再闻讯或归
    const sunHg = sun && byIdx[2] && (Math.abs(dif(sun.lon, byIdx[2].lon)) <= 8);
    const inR1Orb = sun && r1 && (Math.abs(dif(sun.lon, r1.lon)) <= 8 || Math.abs(Math.abs(dif(sun.lon, r1.lon)) - 90) <= 8);
    if (sunHg && inR1Orb) factors.push({ weight: -1, factor: '判一：今无归意', detail: '日水合且在升主四分之容许内=逃者目前无意返回', source: 'CE-281' });
    if (moon && r1 && t.goodAspect(moon, r1)) factors.push({ weight: 1, factor: '判二：将再闻讯或归', detail: '月六合升主=将再闻其讯、或于日水入相升主六合时归', source: 'CE-281' });
    // 方向（南/西南）：原文仅给判例结论、未给判据——如实未实现
  } else if (qtype === '失物盗贼') {
    // CE-282：7宫主冲2宫主=真盗征（中龄）；盗之2宫主（8宫主）居8宫冲2宫主=难追回
    const q2d = rulerOf(2), q7d = rulerOf(7), q8d = rulerOf(8);
    if (q7d && q2d && (Math.abs(dif(q7d.lon, q2d.lon)) <= 8 || Math.abs(Math.abs(dif(q7d.lon, q2d.lon)) - 180) <= 8)) {
      factors.push({ weight: 0, factor: '判一：真盗征', detail: `7宫主（${q7d.zh}）冲2宫主（克问者财征象）=真盗征（约中龄）`, source: 'CE-282' });
    }
    if (q8d && q2d && q8d.house === 8 && (Math.abs(dif(q8d.lon, q2d.lon)) <= 8 || Math.abs(Math.abs(dif(q8d.lon, q2d.lon)) - 180) <= 8)) {
      factors.push({ weight: -1, factor: '判二：难追回', detail: `盗之2宫主（8宫主${q8d.zh}）居8宫冲2宫主=失物难追回`, source: 'CE-282' });
    }
    // 判三（福点接入）：日金三合福点=盗留其物且爱之（CE-282 原文；chart.meta.sevenLots[0]=福点）
    const fortunePt = (chart.meta.sevenLots && chart.meta.sevenLots[0]) || ((chart.meta.arabicPoints && chart.meta.arabicPoints.points || []).find(p => p.name === 'Fortune'));
    const trineToF = p => p && fortunePt && (Math.abs(dif(p.lon, fortunePt.lon)) <= 8 || Math.abs(Math.abs(dif(p.lon, fortunePt.lon)) - 120) <= 8);
    if ((sun && trineToF(sun)) || (ven && trineToF(ven))) {
      factors.push({ weight: 0, factor: '判三：盗留其物', detail: `日/金三合福点=盗留其物且爱之（福点=${Math.round(fortunePt.lon * 10) / 10}°）`, source: 'CE-282' });
    }
    // 判四：日☌金（8宫主）+月在地平下+日□升（升点）+火冲升=无获无归（原文终判）
    if (sun && ven && (Math.abs(dif(sun.lon, ven.lon)) <= 8) && (Math.abs(dif(sun.lon, cusps[0])) <= 8 || Math.abs(Math.abs(dif(sun.lon, cusps[0])) - 90) <= 8)) {
      factors.push({ weight: -1, factor: '判四：无获无归', detail: '日☌金（8宫主）+日□升（升点）+（月在地平下/火冲升）=无获无归', source: 'CE-282' });
    }
    // 判五：若失大畜——月6宫主六合土（12宫主居12宫）且土□木2宫=甚难寻回
    const q6d = rulerOf(6);
    if (moon && sat && sat.house === 12 && (Math.abs(dif(moon.lon, sat.lon)) <= 8 || Math.abs(Math.abs(dif(moon.lon, sat.lon)) - 60) <= 8) && jup && t.badAspect(sat, jup)) {
      factors.push({ weight: -1, factor: '判五：失畜难寻', detail: '月（6宫主）六合土（12宫主居12宫）且土□木（2宫）=大畜甚难寻回', source: 'CE-282' });
    }
  } else if (qtype === '合伙') {
    // CE-283：1宫主与7宫主恶照（刑/冲）+性相反=水火不容勿合伙
    const q7p = rulerOf(7);
    if (r1 && q7p && t.badAspect(r1, q7p)) factors.push({ weight: -1, factor: '判：勿合伙', detail: `1宫主（${r1.zh}）与7宫主（${q7p.zh}）恶照、性相反=如水火不相容，断勿合伙`, source: 'CE-283' });
  } else if (qtype === '夫妻寿序') {
    // CE-287：升主强于7宫主=问主寿长；7宫主先合8宫主=配偶先逝（Coley：此类刁问当极慎）
    const q7m = rulerOf(7), q8m = rulerOf(8);
    const r1StrongM = r1 && (RULER[signIdxOfLon(r1.lon)] === r1.idx || EXALT_SIGNS[r1.idx] === signIdxOfLon(r1.lon));
    const q7StrongM = q7m && (RULER[signIdxOfLon(q7m.lon)] === q7m.idx || EXALT_SIGNS[q7m.idx] === signIdxOfLon(q7m.lon));
    if (r1StrongM && !q7StrongM) factors.push({ weight: 0, factor: '判一：问主寿最长', detail: `升主（${r1.zh}）最强于7宫主=问主（无论夫妻）最寿`, source: 'CE-287' });
    if (q7m && q8m && Math.abs(dif(q7m.lon, q8m.lon)) <= 8) factors.push({ weight: -1, factor: '判二：配偶先逝', detail: `7宫主先合8宫主=配偶先逝`, source: 'CE-287' });
    factors.push({ weight: 0, factor: 'Coley 按语', detail: 'Coley 自评：不喜此类刁问，术者当极慎；最稳=取双方本命推之', source: 'CE-287' });
  } else if (qtype === '胎记') {
    // CE-255 宫位胎记法：星居升=头面、2宫=颈喉，依宫位类推（判例：土摩羯受金□=膝记、月双鱼=左足记、巨蟹临6宫头=胸记）
    const BODY = { 1: '头或面', 2: '颈或喉', 3: '肩或臂', 4: '胸', 5: '背或腰', 6: '腹', 7: '臀或髋', 8: '生殖器', 9: '腿', 10: '膝', 11: '小腿', 12: '足' };
    const marks = chart.planets.filter(p => p.house).map(p => `${p.zh}居${p.house}宫=${BODY[p.house] || p.house + '宫'}之记`).join('；');
    if (marks) factors.push({ weight: 0, factor: '判：宫位胎记法', detail: `按星落宫位：${marks}（判例：土居摩羯受金□=膝上记、月居双鱼未过火冲=左足记、巨蟹临6宫头且月受克=胸记）`, source: 'CE-255' });
  } else if (qtype === '藏宝') {
    // CE-269：龙头4宫+月六合4宫头=有藏宝；4宫主灼日或□土=甚难寻
    const q4 = rulerOf(4);
    const nodeIn4 = nodeIdx !== null && byIdx[nodeIdx] && byIdx[nodeIdx].house === 4;
    const moonSextileCusp4 = moon && (Math.abs(dif(moon.lon, cusps[3])) <= 8 || Math.abs(Math.abs(dif(moon.lon, cusps[3])) - 60) <= 8);
    if (nodeIn4 && moonSextileCusp4) factors.push({ weight: 1, factor: '判一：有藏宝', detail: `龙头（北交点）居4宫+月六合4宫头=有藏宝（4宫主${q4 ? q4.zh : ''}=其质：奖章/书/画）`, source: 'CE-269' });
    if (q4 && (t.combusted(q4) || (sat && t.badAspect(q4, sat)))) factors.push({ weight: -1, factor: '判二：甚难寻', detail: `4宫主（${q4.zh}）灼于日或□土=甚难寻、寻之无望，徒劳莫试`, source: 'CE-269' });
  } else if (qtype === '攻城') {
    // CE-284：4/5宫主（守将）灼8宫+入相土六合=终降；□土=非即降；与火互容=受贿弃守
    const q4s = rulerOf(4), q5s = rulerOf(5);
    const gov = q4s || q5s;
    if (gov && t.combusted(gov) && sat && t.goodAspect(gov, sat) && (gov.speed || 0) > 0) {
      factors.push({ weight: 1, factor: '判一：将帅终降', detail: `4/5宫主（${gov.zh}，守将）灼于8宫+入相土六合=力不能支、将帅终降`, source: 'CE-284' });
    }
    if (gov && sat && t.badAspect(gov, sat)) factors.push({ weight: 0, factor: '判二：非即降', detail: `4宫主□土=非即降（内况尚佳或盼援）`, source: 'CE-284' });
    const recGov = gov && mars && (RULER[signIdxOfLon(gov.lon)] === mars.idx || EXALT_SIGNS[mars.idx] === signIdxOfLon(gov.lon) || RULER[signIdxOfLon(mars.lon)] === gov.idx || EXALT_SIGNS[gov.idx] === signIdxOfLon(mars.lon));
    if (recGov) factors.push({ weight: 0, factor: '判三：受贿弃守', detail: `守将征象（${gov.zh}）与火互容=其将愿受贿、多惧，终依约弃守`, source: 'CE-284' });
  } else if (qtype === '致富') {
    // CE-257：木/金居2宫、月入2宫、福点六合2宫主=按身份才具可致富
    const q2w = rulerOf(2);
    const benIn2 = ben.some(b => b.house === 2);
    const moonIn2 = moon && moon.house === 2;
    const fortuneW = (chart.meta.sevenLots && chart.meta.sevenLots[0]);
    const fortuneGood = fortuneW && q2w && (Math.abs(dif(q2w.lon, fortuneW.lon)) <= 8 || Math.abs(Math.abs(dif(q2w.lon, fortuneW.lon)) - 60) <= 8);
    if (benIn2 || moonIn2 || fortuneGood) factors.push({ weight: 1, factor: '判：按身份才具可致富', detail: `木/金居2宫${benIn2 ? '、' : ''}月入2宫${moonIn2 ? '、' : ''}福点六合2宫主${fortuneGood ? '=' : ''}按身份才具可至颇足之财`, source: 'CE-257' });
  } else if (qtype === '致富之法') {
    // CE-258：2宫主居7宫=赌博/五宫事/妻财；2宫主与水星互容=以才智成富；金强居8宫=妻财为证
    const q2m = rulerOf(2);
    if (q2m && q2m.house === 7) factors.push({ weight: 0, factor: '判一：赌博/五宫事/妻财', detail: `2宫主（${q2m.zh}）居7宫=可因赌博、五宫之事（玩家/酒馆客栈）或妻之助而成富`, source: 'CE-258' });
    const merc = byIdx[2];
    if (q2m && merc && (RULER[signIdxOfLon(q2m.lon)] === merc.idx || RULER[signIdxOfLon(merc.lon)] === q2m.idx)) factors.push({ weight: 0, factor: '判二：以才智成富', detail: `2宫主（${q2m.zh}）与水星互容=以才智（娶妻）成富`, source: 'CE-258' });
    if (ven && ven.house === 8) factors.push({ weight: 0, factor: '判三：妻财为证', detail: '金星强居8宫=妻财之宫为证，妻之助成富', source: 'CE-258' });
  } else if (qtype === '人在家否') {
    // CE-251：7宫主=所访之人；日不居角（居续宫8）=不在家而近家；月6宫主刚离火冲=由女仆引至
    const q7a = rulerOf(7);
    if (q7a && !ANGULAR_H.includes(q7a.house)) factors.push({ weight: 0, factor: '判一：不在家而近家', detail: `7宫主（${q7a.zh}）不居角（居${q7a.house}宫）=所访者不在家而近家（☌水=同伴为水所表）`, source: 'CE-251' });
    if (moon && mars && Math.abs(Math.abs(dif(moon.lon, mars.lon)) - 180) <= 8 && rulerOf(6) === moon.idx) factors.push({ weight: 0, factor: '判二：由女仆引至', detail: '月（6宫主）刚离火冲=或由女仆指引而至', source: 'CE-251' });
  } else if (qtype === '子女') {
    // CE-271：正反证多数决——正证：月/5宫主居多产座、月六合5宫头、福点5宫、升主阳星/月入阳座/5宫主☌日=多男；反证：5宫头荒芜、火□5宫头、5宫主□土或灼日、木金冲
    const q5c = rulerOf(5);
    const cusp5sign = signIdxOfLon(cusps[4]);
    let pos = 0, neg = 0, posD = [], negD = [];
    if (moon && FERTILE_SIGNS.includes(signIdxOfLon(moon.lon))) { pos++; posD.push('月居多产座'); }
    if (q5c && FERTILE_SIGNS.includes(signIdxOfLon(q5c.lon))) { pos++; posD.push(`5宫主${q5c.zh}居多产座`); }
    if (moon && (Math.abs(Math.abs(dif(moon.lon, cusps[4])) - 60) <= 8 || Math.abs(dif(moon.lon, cusps[4])) <= 8)) { pos++; posD.push('月入相六合5宫头'); }
    const fortC = (chart.meta.sevenLots && chart.meta.sevenLots[0]);
    if (fortC && houseOfLon0(fortC.lon, cusps) === 4) { pos++; posD.push('福点居5宫'); }
    if (BARREN_SIGNS.includes(cusp5sign)) { neg++; negD.push('5宫头荒芜座'); }
    if (mars && (Math.abs(dif(mars.lon, cusps[4])) <= 8 || Math.abs(Math.abs(dif(mars.lon, cusps[4])) - 90) <= 8)) { neg++; negD.push('火□5宫头'); }
    if (q5c && sat && q5c.idx !== sat.idx && t.badAspect(q5c, sat)) { neg++; negD.push(`5宫主${q5c.zh}□土`); }
    if (q5c && t.combusted(q5c)) { neg++; negD.push(`5宫主${q5c.zh}灼日`); }
    if (jup && ven && (Math.abs(Math.abs(dif(jup.lon, ven.lon)) - 180) <= 8)) { neg++; negD.push('木金冲'); }
    if (pos || neg) factors.push({ weight: pos - neg >= 1 ? 1 : (neg - pos >= 2 ? -1 : 0), factor: '判：正反证多数决', detail: `正证${pos}（${posD.join('、')}）vs 反证${neg}（${negD.join('、')}）→ ${pos > neg ? '可有子女' : (neg > pos ? '无子' : '两持')}${r1 && MASCULINE_PLANETS.includes(r1.idx) ? '；升主为阳星=多为男' : ''}`, source: 'CE-271' });
  } else if (qtype === '怀孕') {
    // CE-272：正证 月六合5宫头/福点5宫/5宫主☌金=已受孕；反证 金□土/木金冲/火□5宫头/5宫主☌日=伪孕流产
    const q5p = rulerOf(5);
    const fortP = (chart.meta.sevenLots && chart.meta.sevenLots[0]);
    let pos = 0, neg = 0, posD = [], negD = [];
    if (moon && (Math.abs(Math.abs(dif(moon.lon, cusps[4])) - 60) <= 8 || Math.abs(dif(moon.lon, cusps[4])) <= 8)) { pos++; posD.push('月入相六合5宫头'); }
    if (fortP && houseOfLon0(fortP.lon, cusps) === 4) { pos++; posD.push('福点5宫'); }
    if (q5p && ven && (Math.abs(dif(q5p.lon, ven.lon)) <= 8 || Math.abs(Math.abs(dif(q5p.lon, ven.lon)) - 60) <= 8)) { pos++; posD.push(`5宫主☌金`); }
    if (q5p && t.combusted(q5p)) { neg++; negD.push(`5宫主${q5p.zh}☌日（不毛星）`); }
    if (ven && sat && t.badAspect(ven, sat)) { neg++; negD.push('金□土'); }
    if (jup && ven && (Math.abs(Math.abs(dif(jup.lon, ven.lon)) - 180) <= 8)) { neg++; negD.push('木金冲（自角宫）'); }
    if (mars && (Math.abs(dif(mars.lon, cusps[4])) <= 8 || Math.abs(Math.abs(dif(mars.lon, cusps[4])) - 90) <= 8)) { neg++; negD.push('火□5宫头'); }
    if (pos || neg) factors.push({ weight: pos - neg >= 1 ? 1 : (neg - pos >= 1 ? -1 : 0), factor: '判：已孕与否', detail: `正证${pos}（${posD.join('、')}）vs 反证${neg}（${negD.join('、')}）→ ${pos > neg ? '已受孕' : (neg > pos ? '伪孕/流产不成熟' : '两持')}`, source: 'CE-272' });
  } else if (qtype === '病者') {
    // CE-275：6宫主受克星=病位（克星居座定部位）；8宫主□升主=甚危；月六合土升主=或终愈
    const q6s = rulerOf(6);
    const q8s = rulerOf(8);
    const BODY_PLANET = { 0: '头/心（日）', 1: '颈/喉（月）', 2: '肩/臂/手（水）', 3: '胸/乳（金）', 4: '腿/腹（火）', 5: '肝/股（木）', 6: '膝/骨/齿（土）' };
    if (q6s) {
      const aff = chart.planets.filter(p => p.idx !== q6s.idx && p.idx !== moon.idx && (Math.abs(dif(q6s.lon, p.lon)) <= 8 || Math.abs(Math.abs(dif(q6s.lon, p.lon)) - 180) <= 8)).map(p => `${p.zh}(${BODY_PLANET[p.idx] || '身'})`);
      if (aff.length) factors.push({ weight: -1, factor: '判一：病位', detail: `6宫主（${q6s.zh}）受克：${aff.join('、')}=其痛在${aff[0].split('(')[1].replace(')', '')}；疾源冷湿`, source: 'CE-275' });
    }
    if (q8s && r1 && sat && t.badAspect(q8s, r1)) factors.push({ weight: -1, factor: '判二：甚危', detail: `8宫主（${q8s.zh}）□升主（${r1.zh}）=病甚危、难逃死候`, source: 'CE-275' });
    if (moon && r1 && sat && (Math.abs(dif(moon.lon, sat.lon)) <= 8 || Math.abs(Math.abs(dif(moon.lon, sat.lon)) - 60) <= 8)) factors.push({ weight: 1, factor: '判三：或终愈', detail: '月六合土（升主）=或终能胜病', source: 'CE-275' });
  } else if (qtype === '婚否') {
    // CE-277：正证 月居多产座六合土升主；反证 金□土/土□7宫主/火居7宫荒芜座=罕婚；若婚=异质多憎恶
    const q7m = rulerOf(7);
    let pos = 0, neg = 0, posD = [], negD = [];
    if (moon && r1 && sat && FERTILE_SIGNS.includes(signIdxOfLon(moon.lon)) && (Math.abs(dif(moon.lon, sat.lon)) <= 8 || Math.abs(Math.abs(dif(moon.lon, sat.lon)) - 60) <= 8)) { pos++; posD.push('月居多产座六合土升主'); }
    if (ven && sat && t.badAspect(ven, sat)) { neg++; negD.push('金□土'); }
    if (r1 && q7m && t.badAspect(r1, q7m)) { neg++; negD.push(`土（升主）□7宫主（${q7m.zh}）`); }
    if (mars && mars.house === 7 && (BARREN_SIGNS.includes(signIdxOfLon(mars.lon)) || BARREN_SIGNS.includes(signIdxOfLon(cusps[6])))) { neg++; negD.push('火居7宫荒芜座'); }
    if (pos || neg) factors.push({ weight: pos - neg >= 1 ? 1 : (neg - pos >= 2 ? -1 : 0), factor: '判：罕婚与否', detail: `正证${pos}（${posD.join('、')}）vs 反证${neg}（${negD.join('、')}）→ ${neg > pos ? '虽有婚向然罕婚（若婚=异质之人多憎恶）' : (pos > neg ? '可婚' : '两持')}`, source: 'CE-277' });
  } else if (qtype === '产业持久') {
    // CE-259：2宫头动座/木逆居2宫=不持久；木居2宫□土升主=奢靡渐损；8宫主□升主=债务损
    const q2d = rulerOf(2);
    if (CARDINAL_SIGNS.includes(signIdxOfLon(cusps[1])) || (jup && jup.retrograde && jup.house === 2)) factors.push({ weight: -1, factor: '判一：不持久', detail: `2宫头动座${CARDINAL_SIGNS.includes(signIdxOfLon(cusps[1])) ? '' : '、'}木逆居2宫${jup && jup.retrograde && jup.house === 2 ? '' : ''}=产业不持久、所得速耗`, source: 'CE-259' });
    if (jup && jup.house === 2 && sat && r1 && t.badAspect(jup, r1)) factors.push({ weight: 0, factor: '判二：奢靡渐损', detail: `木居2宫□土升主=奢靡行邪途、渐损尽前积`, source: 'CE-259' });
    const q8t = rulerOf(8);
    if (q8t && r1 && t.badAspect(q8t, r1)) factors.push({ weight: -1, factor: '判三：债务损', detail: `8宫主（${q8t.zh}）□升主=慎信托，债务之损`, source: 'CE-259' });
  } else if (qtype === '购房地') {
    // CE-266：4宫主灼日+□升主=费力高价；龙头4宫+福点Dispositor=地良；月土吉照4宫头=有意终得
    const q4b = rulerOf(4);
    if (q4b && t.combusted(q4b)) factors.push({ weight: 0, factor: '判一：费力高价', detail: `4宫主（${q4b.zh}）灼于日=购之费大力/高价/多劳（日=卖方）`, source: 'CE-266' });
    if (q4b && r1 && t.badAspect(q4b, r1)) factors.push({ weight: 0, factor: '判一附：□升主', detail: `4宫主□升主=卖方不在乎成否`, source: 'CE-266' });
    if (nodeIdx !== null && byIdx[nodeIdx] && byIdx[nodeIdx].house === 4) factors.push({ weight: 0, factor: '判二：地良', detail: '龙头（北交点）居4宫=地良', source: 'CE-266' });
    if (moon && sat && (Math.abs(dif(moon.lon, cusps[3])) <= 8 || Math.abs(Math.abs(dif(moon.lon, cusps[3])) - 60) <= 8 || Math.abs(Math.abs(dif(moon.lon, cusps[3])) - 120) <= 8) && sat && (Math.abs(dif(sat.lon, cusps[3])) <= 8 || Math.abs(Math.abs(dif(sat.lon, cusps[3])) - 60) <= 8 || Math.abs(Math.abs(dif(sat.lon, cusps[3])) - 120) <= 8)) factors.push({ weight: 1, factor: '判三：有意终得', detail: '月与土吉照4宫头=问者有意、费力终得之', source: 'CE-266' });
  } else if (qtype === '搬迁') {
    // CE-267：龙头4宫+升主月吉照4宫头=宜留；月将Void=更宜留
    const nodeIn4m = nodeIdx !== null && byIdx[nodeIdx] && byIdx[nodeIdx].house === 4;
    const goodToC4 = (moon && sat && (Math.abs(dif(moon.lon, cusps[3])) <= 8 || Math.abs(Math.abs(dif(moon.lon, cusps[3])) - 60) <= 8 || Math.abs(Math.abs(dif(moon.lon, cusps[3])) - 120) <= 8));
    if (nodeIn4m || goodToC4) factors.push({ weight: 0, factor: '判一：宜留', detail: `${nodeIn4m ? '龙头4宫、' : ''}升主与月吉照4宫头=留则益多、宜留原处`, source: 'CE-267' });
    const moonVoid = moon && !chart.planets.some(p => p.idx !== moon.idx && (Math.abs(dif(moon.lon, p.lon)) <= 8 || Math.abs(Math.abs(dif(moon.lon, p.lon)) - 60) <= 8 || Math.abs(Math.abs(dif(moon.lon, p.lon)) - 90) <= 8 || Math.abs(Math.abs(dif(moon.lon, p.lon)) - 120) <= 8 || Math.abs(Math.abs(dif(moon.lon, p.lon)) - 180) <= 8));
    if (moonVoid) factors.push({ weight: 0, factor: '判二：月将Void', detail: '月将入 Void of Course（无后续相位）=更宜留', source: 'CE-267' });
  } else if (qtype === '信使') {
    // CE-273：水□土升主=不诚；水☌金+入相合日（7宫主）=已递信；月吉照水=可望回音
    const mercN = byIdx[2], sunN = byIdx[0];
    if (mercN && sat && r1 && t.badAspect(mercN, r1)) factors.push({ weight: 0, factor: '判一：信使不诚', detail: `水□土升主=信使不诚心尽职`, source: 'CE-273' });
    if (mercN && ven && (Math.abs(dif(mercN.lon, ven.lon)) <= 8)) factors.push({ weight: 1, factor: '判二：已递信', detail: '水☌金+入相合日（7宫主）=已安抵收信人、大抵已递信', source: 'CE-273' });
    if (moon && mercN && (Math.abs(dif(moon.lon, mercN.lon)) <= 8 || Math.abs(Math.abs(dif(moon.lon, mercN.lon)) - 60) <= 8 || Math.abs(Math.abs(dif(moon.lon, mercN.lon)) - 120) <= 8)) factors.push({ weight: 0, factor: '判三：可望回音', detail: '月入相水之吉照=可望回音', source: 'CE-273' });
  } else if (qtype === '赌运') {
    // CE-274：5宫主☌金/福点5宫=大体佳；火□5宫头/5宫主灼日=不能大富时损
    const q5g = rulerOf(5);
    const fortG = (chart.meta.sevenLots && chart.meta.sevenLots[0]);
    let pos = 0, neg = 0, posD = [], negD = [];
    if (q5g && ven && q5g.idx !== ven.idx && (Math.abs(dif(q5g.lon, ven.lon)) <= 8)) { pos++; posD.push(`5宫主☌金（小吉）`); }
    if (fortG && houseOfLon0(fortG.lon, cusps) === 4) { pos++; posD.push('福点5宫'); }
    if (q5g && t.combusted(q5g)) { neg++; negD.push('5宫主灼日'); }
    if (mars && (Math.abs(dif(mars.lon, cusps[4])) <= 8 || Math.abs(Math.abs(dif(mars.lon, cusps[4])) - 90) <= 8)) { neg++; negD.push('火□5宫头'); }
    if (pos || neg) factors.push({ weight: pos - neg >= 1 ? 1 : (neg - pos >= 1 ? -1 : 0), factor: '判：赌运', detail: `正证${pos}（${posD.join('、')}）vs 反证${neg}（${negD.join('、')}）→ ${pos > neg ? '大体佳（不能大富、时亦有损）' : (neg > pos ? '不利' : '两持')}`, source: 'CE-274' });
  } else if (qtype === '仆役') {
    // CE-276：月6宫主居升六合升主=忠仆利畜；月刚冲火=慎过信
    const q6v = rulerOf(6);
    if (q6v && q6v.house === 1 && sat && r1 && (Math.abs(dif(q6v.lon, sat.lon)) <= 8 || Math.abs(Math.abs(dif(q6v.lon, sat.lon)) - 60) <= 8)) factors.push({ weight: 1, factor: '判一：忠仆利畜', detail: `月（6宫主）居升六合升主=可有忠仆、利于小畜`, source: 'CE-276' });
    if (moon && mars && Math.abs(Math.abs(dif(moon.lon, mars.lon)) - 180) <= 8) factors.push({ weight: 0, factor: '判二：慎过信', detail: '月刚冲火（2宫主）=慎过信，须严管则无虞', source: 'CE-276' });
  } else if (qtype === '俸禄') {
    // CE-289：升主与9宫主无相=甚难；木□土升主=徒劳利微
    const q9s = rulerOf(9);
    const noAspect = r1 && q9s && r1.idx !== q9s.idx && !chart.planets.some(p => p.idx === q9s.idx && (Math.abs(dif(r1.lon, p.lon)) <= 8 || Math.abs(Math.abs(dif(r1.lon, p.lon)) - 60) <= 8 || Math.abs(Math.abs(dif(r1.lon, p.lon)) - 90) <= 8 || Math.abs(Math.abs(dif(r1.lon, p.lon)) - 120) <= 8 || Math.abs(Math.abs(dif(r1.lon, p.lon)) - 180) <= 8));
    if (noAspect) factors.push({ weight: 0, factor: '判一：甚难', detail: `升主与9宫主无相=得俸甚难`, source: 'CE-289' });
    if (jup && sat && r1 && t.badAspect(jup, r1)) factors.push({ weight: -1, factor: '判二：不必求', detail: '木□土升主=徒劳利微、不必求（同断技艺之学）', source: 'CE-289' });
  } else if (qtype === '贸易') {
    // CE-291：南交点（龙尾）10宫=贸易不佳；10宫主逆2宫□土=左手进右手出
    const southIn10 = southNode !== null && houseOfLon0(southNode, cusps) === 9;
    if (southIn10) factors.push({ weight: -1, factor: '判一：贸易不佳', detail: '龙尾（南交点）居10宫=贸易大体不佳', source: 'CE-291' });
    const q10r = rulerOf(10);
    if (q10r && q10r.retrograde && q10r.house === 2 && sat && t.badAspect(q10r, sat)) factors.push({ weight: 0, factor: '判二：左手进右手出', detail: `10宫主（${q10r.zh}）逆居2宫□土=所得即耗、不宜掌贸易`, source: 'CE-291' });
  } else if (qtype === '海船') {
    // CE-253：土强六合月=今安；土□金8宫主/月刚离火冲=近历险
    if (sat && moon && (Math.abs(dif(sat.lon, moon.lon)) <= 8 || Math.abs(Math.abs(dif(sat.lon, moon.lon)) - 60) <= 8)) factors.push({ weight: 1, factor: '判一：今安', detail: `土强本尊六合月=船今安、无险`, source: 'CE-253' });
    const q8h = rulerOf(8);
    if ((sat && ven && t.badAspect(sat, ven)) || (moon && mars && Math.abs(Math.abs(dif(moon.lon, mars.lon)) - 180) <= 8)) factors.push({ weight: 0, factor: '判二：近历险', detail: `土□金（8宫主）或月刚离火冲=近历大险（死/覆船/海盗）`, source: 'CE-253' });
  } else if (qtype === '亲邻相合') {
    // CE-262：3宫主□升主=少爱几近憎恶
    const q3r = rulerOf(3);
    if (q3r && r1 && q3r.idx !== r1.idx && t.badAspect(q3r, r1)) factors.push({ weight: -1, factor: '判：几近憎恶', detail: `3宫主（${q3r.zh}）□升主（${r1.zh}）=少爱、几近憎恶；各守其荣互不相让`, source: 'CE-262' });
  } else if (qtype === '内陆旅行') {
    // CE-263：3宫主（金）□升主或冲木=盗身之险不宜行
    const q3t = rulerOf(3);
    if (q3t && r1 && q3t.idx !== r1.idx && t.badAspect(q3t, r1)) factors.push({ weight: -1, factor: '判一：不宜行', detail: `3宫主（${q3t.zh}）□升主=损囊与身、恐遇盗有性命之危`, source: 'CE-263' });
    if (q3t && jup && q3t.idx !== jup.idx && (Math.abs(Math.abs(dif(q3t.lon, jup.lon)) - 180) <= 8)) factors.push({ weight: -1, factor: '判二：冲木', detail: `3宫主（${q3t.zh}）冲木=途多阻、图示明险当劝阻`, source: 'CE-263' });
  } else if (qtype === '朋友建议') {
    // CE-265：龙尾10宫+10宫主逆□土升主=谏非善意不可从
    const southIn10f = southNode !== null && houseOfLon0(southNode, cusps) === 9;
    const q10f = rulerOf(10);
    if (southIn10f && q10f && q10f.retrograde && sat && r1 && t.badAspect(q10f, r1)) factors.push({ weight: -1, factor: '判：谏非善意', detail: `龙尾10宫+10宫主（${q10f.zh}）逆□土升主=伪友之谏非善、意在伤主，断不可从`, source: 'CE-265' });
  } else if (qtype === '父产') {
    // CE-268：水（父征）□升主=父子少爱；2宫主与5宫主互容+六合=可得父产；福点5宫=产业可观
    const mercF = byIdx[2], q2f = rulerOf(2), q5f = rulerOf(5);
    if (mercF && r1 && t.badAspect(mercF, r1)) factors.push({ weight: 0, factor: '判一：父子少爱', detail: `水（父之征象）□升主（${r1.zh}）=父子少爱`, source: 'CE-268' });
    const recF = q2f && q5f && q2f.idx !== q5f.idx && ((RULER[signIdxOfLon(q2f.lon)] === q5f.idx && RULER[signIdxOfLon(q5f.lon)] === q2f.idx) || (RULER[signIdxOfLon(q2f.lon)] === q5f.idx && EXALT_SIGNS[q5f.idx] === signIdxOfLon(q2f.lon)) || (RULER[signIdxOfLon(q5f.lon)] === q2f.idx && EXALT_SIGNS[q2f.idx] === signIdxOfLon(q5f.lon)));
    const sextF = q2f && q5f && q2f.idx !== q5f.idx && (Math.abs(dif(q2f.lon, q5f.lon)) <= 8 || Math.abs(Math.abs(dif(q2f.lon, q5f.lon)) - 60) <= 8);
    if (recF && sextF) factors.push({ weight: 1, factor: '判二：可得父产', detail: `2宫主（${q2f.zh}）与5宫主（${q5f.zh}）互容+入相六合=可得所求父产`, source: 'CE-268' });
    const fortF = (chart.meta.sevenLots && chart.meta.sevenLots[0]);
    if (fortF && houseOfLon0(fortF.lon, cusps) === 4) factors.push({ weight: 0, factor: '判三：产业可观', detail: '福点居5宫=产业可观', source: 'CE-268' });
  } else if (qtype === '大牲畜') {
    // CE-296：土居12宫□吉星（自角宫）=所得甚微
    if (sat && sat.house === 12 && ((jup && t.badAspect(sat, jup)) || (ven && t.badAspect(sat, ven)))) factors.push({ weight: -1, factor: '判：所得甚微', detail: `土居12宫□木/金（自角宫）=此道所得微乎其微`, source: 'CE-296' });
  }
  const score = factors.reduce((s, f) => s + f.weight, 0);
  const verdict = score >= 1 ? '倾向成' : (score <= -1 ? '倾向败' : '中性');
  return { verdict, score: Math.round(score * 10) / 10, factors, qtype };
}

/**
 * 问被控四判（CE-218~221，Clavis CHAP VIII SECT III 第八宫被控卷）：
 * 判一：月或1宫主恶照（合/刑/冲）应用于 4/8/10/12 宫主 → 其所被捕之事大险；
 * 判二：月或1宫主合/刑/冲土火于凶位、且吉星毫不施吉照 → 实犯其罪、案情甚危；
 * 判三：1宫主或月与木/金合、六/三合、互容 → 顺遂、光荣脱身（木金于10/11/4宫有尊且居升/天顶尤验）；
 * 判四：1宫主不受克、而于其内有本然尊贵之别星恶照凶星 → 清白脱身、同伙受累入狱。
 * 工程口径：相位=当前已形成（±8°，应用/分离未细分——horary 应用语义未实现，如实）；凶位=6/8/12+果宫(3/9)；
 *   互容=各落对方庙；判三尤验=吉星落1/10宫且其本然尊贵非空。
 * @returns {{verdict:string, score:number, factors:Array<{weight:number,factor:string,detail:string,source:string}>}}
 */
function chargeVerdict(chart, byIdx, ascSign, ascRulerIdx) {
  const factors = [];
  const r1 = byIdx[ascRulerIdx];
  const moon = byIdx[1], jup = byIdx[5], ven = byIdx[3], mars = byIdx[4], sat = byIdx[6];
  const cusps = chart.houses.cuspsRaw;
  const rulerOf = h => byIdx[RULER[signIdxOfLon(cusps[h - 1])]];
  const r4 = rulerOf(4), r8 = rulerOf(8), r10 = rulerOf(10), r12 = rulerOf(12);
  const orb = 8;
  const mal = [mars, sat].filter(Boolean);
  const ben = [jup, ven].filter(Boolean);
  const isMal = f => f && (f.idx === 4 || f.idx === 6);
  // 恶照（bad aspect）：刑/冲（±8°），或与凶星（土火）的合相——与吉星（木金）合相不算恶照（CE-218 "any bad Aspect" 语义，工程口径）
  const badAspect = (p, q) => {
    const a = Math.abs(dif(p.lon, q.lon));
    if (Math.abs(a - 90) <= orb || Math.abs(a - 180) <= orb) return true;
    if (a <= orb && isMal(q)) return true;
    return false;
  };
  const goodAspect = (p, q) => { const a = Math.abs(dif(p.lon, q.lon)); return a <= orb || Math.abs(a - 60) <= orb || Math.abs(a - 120) <= orb; };
  const reception = (p, q) => RULER[signIdxOfLon(p.lon)] === q.idx && RULER[signIdxOfLon(q.lon)] === p.idx;
  const badPlace = p => p && ([6, 8, 12].includes(p.house) || [3, 9].includes(p.house));
  // 判一（CE-218）：月或1宫主恶照应用于 4/8/10/12 宫主（排除宫主即行星本身，如12宫主=月亮）
  const foesH = [r4, r8, r10, r12].filter(Boolean);
  const c1 = (r1 && foesH.some(f => f.idx !== r1.idx && badAspect(r1, f))) || (moon && foesH.some(f => f.idx !== moon.idx && badAspect(moon, f)));
  if (c1) factors.push({ weight: -1, factor: '判一：大险', detail: '月或1宫主恶照应用于 4/8/10/12 宫主——其所被捕之事有大险（受刑/受损之危）', source: 'CE-218' });
  // 判二（CE-219）：合刑冲土火于凶位 且 吉星毫不施吉照（1宫主或月任一受吉照即救）
  const c2 = (r1 && mal.some(f => badAspect(r1, f) && badPlace(f))) || (moon && mal.some(f => badAspect(moon, f) && badPlace(f)));
  if (c2) {
    const helped = (r1 && ben.some(b => goodAspect(r1, b))) || (moon && ben.some(b => goodAspect(moon, b)));
    if (!helped) factors.push({ weight: -2, factor: '判二：有罪', detail: '月或1宫主合/刑/冲土火于凶位、且吉星毫不施吉照——实犯其罪、案情甚危', source: 'CE-219' });
    else factors.push({ weight: -1, factor: '判二：凶照（有吉照从轻）', detail: '月或1宫主合刑冲土火于凶位，但有吉星施吉照——凶而有救', source: 'CE-219' });
  }
  // 判三（CE-220）
  const c3 = ben.some(b => (r1 && (goodAspect(r1, b) || reception(r1, b))) || (moon && (goodAspect(moon, b) || reception(moon, b))));
  if (c3) {
    const strong = ben.some(b => b.house === 1 || b.house === 10) && ben.some(b => b.essential && b.essential.length);
    factors.push({ weight: 2, factor: '判三：光荣脱身', detail: `1宫主或月与木/金合、六/三合、互容——顺遂、光荣脱身${strong ? '（木金居升/天顶且有本然尊贵，尤验）' : ''}`, source: 'CE-220' });
  }
  // 判四（CE-221）
  const inFirst = chart.planets.filter(p => p.house === 1);
  const c4 = !!r1 && !mal.some(f => badAspect(r1, f)) &&
    inFirst.some(p => p.idx !== ascRulerIdx && p.essential && p.essential.length && mal.some(f => badAspect(p, f)));
  if (c4) factors.push({ weight: 1, factor: '判四：清白/同伙罪', detail: '1宫主不受克、而1宫内本然尊贵之别星恶照凶星——问主清白脱身、同伙受累入狱', source: 'CE-221' });
  const score = factors.reduce((s, f) => s + f.weight, 0);
  const verdict = score >= 2 ? '倾向脱身' : (score <= -2 ? '倾向有罪/大险' : '中性');
  return { verdict, score: Math.round(score * 10) / 10, factors };
}

/**
 * Bonatti 月亮 17 阻碍（子表 映射-月亮17阻碍 原文逐条判定）。
 * 1-13 已实现；14-16（Azimene/Pitted/Smoky 度数）专属度数表每座不同、OCR 磨损待校验 → 未计（如实）；
 * 17 Dark 度数按 Clavis p30-31 明暗度表通用暗段实现（1-3/8-16；30=虚非暗）。
 * @returns {Array<[编号, 描述, 严重度]>}
 */
function moonObstructions(chart, byIdx) {
  const out = [];
  const moon = byIdx[1], sun = byIdx[0];
  if (!moon || !sun) return out;
  const ds = Math.abs(dif(moon.lon, sun.lon));
  const moonSign = signIdxOfLon(moon.lon);
  const moonDeg = normLon(moon.lon) % 30;
  // 1 灼伤/日辉下（合相15°内至离日12°内；离日5°即脱逃——简化：15°内计）
  if (ds < 8.5) out.push(['1', `月亮灼伤（距日 ${ds.toFixed(1)}°）`, 'high']);
  else if (ds < 15) out.push(['1', `月亮在日辉下（距日 ${ds.toFixed(1)}°<15）`, 'high']);
  // 2 落陷度数（天蝎/摩羯）
  if (moonSign === 7 || moonSign === 9) out.push(['2', '月亮在落陷度数（天蝎/摩羯）', 'high']);
  // 3 灼伤度数（对日之点前12°）
  const opp = normLon(sun.lon + 180);
  const dop = Math.abs(dif(moon.lon, opp));
  if (dop < 12) out.push(['3', `月亮在灼伤度数（对冲日点前 ${dop.toFixed(1)}°）`, 'high']);
  // 4 与土/火合/冲/四分而无完全接纳
  for (const mi of [4, 6]) {
    const m = byIdx[mi]; if (!m) continue;
    const dm = Math.abs(dif(moon.lon, m.lon));
    const asp = [0, 90, 180].some(a => Math.abs(dm - a) < 8);
    const rec = reception(1, mi, moon.lon) || reception(mi, 1, m.lon);
    if (asp && !rec) out.push(['4', `月亮与${m.zh}成凶相位（合/冲/四分）无接纳`, 'high']);
  }
  // 5 与龙头/龙尾合相（12°内）
  const node = byIdx[11];
  if (node && Math.abs(dif(moon.lon, node.lon)) < 12) out.push(['5', `月亮合交点（距 ${Math.abs(dif(moon.lon, node.lon)).toFixed(1)}°）`, 'high']);
  // 6 双子（自庙之第十二位）
  if (moonSign === 2) out.push(['6', '月亮在双子（自庙第12位）', 'high']);
  // 7 星座之末（末6°=凶星界；狮子末6°属木星除外）
  if (moonDeg > 24 && moonSign !== 4) out.push(['7', `月亮在星座末界位（${moonDeg.toFixed(1)}°）`, 'high']);
  // 8 6/8/9/12 宫（3宫喜乐受害较轻——8 判 6/8/9/12）
  if ([6, 8, 9, 12].includes(moon.house)) out.push(['8', `月亮落${moon.house}宫（果宫/凶宫）`, 'high']);
  // 9 Via Combusta（天秤15°-天蝎15°）
  const ml = normLon(moon.lon);
  if (ml >= 195 && ml < 225) out.push(['9', '月亮在灼伤之道（天秤15°-天蝎15°）', 'high']);
  // 10 出界/游走（无本然尊贵）
  if ((moon.dignityScore || 0) === 0) out.push(['10', '月亮出界/游走（无本然尊贵）', 'high']);
  // 11 运行迟慢
  if (moon.speed < 12) out.push(['11', `月亮运行迟慢（${moon.speed.toFixed(2)}°/d<12）`, 'high']);
  // 12 缺光（月末）
  if (Math.abs(dif(moon.lon, sun.lon)) > 180 && ds < 30) out.push(['12', '月亮缺光（月末近日）', 'high']);
  // 13 被二凶星围困（±15° 内两侧各一）
  const aroundMal = [];
  for (const mi of [4, 6]) {
    const m = byIdx[mi]; if (!m) continue;
    const dm = dif(m.lon, moon.lon);
    if (Math.abs(dm) <= 15 && Math.abs(dm) >= 0.5) aroundMal.push({ zh: m.zh, d: dm });
  }
  if (aroundMal.some(x => x.d < 0) && aroundMal.some(x => x.d > 0)) out.push(['13', `月亮被二凶星围困（${aroundMal.map(x => x.zh).join('、')}）`, 'high']);
  // 14-16 专属度数表（Clavis p30，每座不同）：14 Azimene / 15 Pitted 已数字化接入；16 Smoky 无独立标记（明暗度列 smoky=暗之一种，不单独判）
  const degTbl = CLT_ROWS[SIGNS[moonSign].zh];
  if (degTbl) {
    const degInt = Math.floor(moonDeg);
    if (degTbl.Male.azim.includes(degInt) || degTbl.Femi.azim.includes(degInt)) {
      out.push(['14', `月亮在 Azimene 度数（${SIGNS[moonSign].zh} ${degInt}°）`, 'medium']);
    }
    if (degTbl.Male.deep.includes(degInt) || degTbl.Femi.deep.includes(degInt)) {
      out.push(['15', `月亮在 Pitted 度数（${SIGNS[moonSign].zh} ${degInt}°）`, 'medium']);
    }
  }
  // 17 Dark 度数：Clavis p30-31 明暗度表通用规则（每座同）：1-3 暗(d)、8-16 暗(d)；30 为虚非暗（"the last degree is Void"）
  const darkSegs = (moonDeg >= 1 && moonDeg <= 3) || (moonDeg >= 8 && moonDeg <= 16);
  if (darkSegs) out.push(['17', `月亮在 Dark 度数（${SIGNS[moonSign].zh} ${Math.floor(moonDeg)}°，Clavis 暗段 1-3/8-16）`, 'medium']);
  return out;
}

/**
 * Bonatti 行星 10 阻碍（子表 映射-行星10阻碍 原文逐条判定）。
 * 7 弃纳就拒（已实现：分离相位+接纳判定）、9 交点无纬度豁免、10 己庙第7位 部分简化/未计（如实）。
 * @returns {Array<[编号, 描述, 严重度]>}
 */
function planetObstructions(p, chart, byIdx) {
  const out = [];
  const sun = byIdx[0];
  if (!p || !sun) return out;
  const ds = Math.abs(dif(p.lon, sun.lon));
  const ess = p.essential || [];
  const hasFall = ess.some(d => d.dignity === 'detriment' || d.dignity === 'fall');
  // 1 自角宫或上升落陷（不照上升）
  if (hasFall) out.push(['1', `${p.zh}落陷（${ess.filter(d => d.dignity === 'detriment' || d.dignity === 'fall').map(d => d.detail).join('/')}）`, 'high']);
  // 2 逆行
  if (p.retrograde) out.push(['2', `${p.zh}逆行`, 'high']);
  // 3 灼伤（日前后15°内；太阳自身除外——距日0°不判自灼）
  if (p.idx !== 0 && ds < 15) out.push(['3', `${p.zh}灼伤/日辉下（距日 ${ds.toFixed(1)}°）`, 'high']);
  // 4 与一/二凶星冲/合/四分而无接纳
  for (const mi of [4, 6]) {
    const m = byIdx[mi]; if (!m) continue;
    const dm = Math.abs(dif(p.lon, m.lon));
    const asp = [0, 90, 180].some(a => Math.abs(dm - a) < 8);
    const rec = reception(p.idx, mi, p.lon) || reception(mi, p.idx, m.lon);
    if (asp && !rec) out.push(['4', `${p.zh}与${m.zh}成凶相位无接纳`, 'high']);
  }
  // 5 被凶星围困（离一合另一）无完全接纳
  const aroundMal = [];
  for (const mi of [4, 6]) {
    const m = byIdx[mi]; if (!m) continue;
    const dm = dif(m.lon, p.lon);
    if (Math.abs(dm) <= 15 && Math.abs(dm) >= 0.5) aroundMal.push(m.zh);
  }
  if (aroundMal.length >= 2) out.push(['5', `${p.zh}被凶星围困（${aroundMal.join('、')}）`, 'high']);
  // 6 与在落陷之星相合
  for (const q of chart.planets) {
    if (q.idx === p.idx || q.idx > 6) continue;
    if (Math.abs(dif(p.lon, q.lon)) < 8 && (q.essential || []).some(d => d.dignity === 'detriment' || d.dignity === 'fall')) {
      out.push(['6', `${p.zh}与落陷之星${q.zh}相合`, 'high']);
      break;
    }
  }
  // 7 弃纳就拒（Bonatti 映射-行星10阻碍 第7条后半）：与接纳之星分离而合于不接纳之星
  //   需分离相位判定（aspects[].applying）；前半"与自上升落陷之星相合"由第6条（与落陷之星相合）近似覆盖（标注）
  const sepAspects = chart.aspects.filter(a => (a.p1 === p.idx || a.p2 === p.idx) && a.applying === false);
  const appAspects = chart.aspects.filter(a => (a.p1 === p.idx || a.p2 === p.idx) && a.applying === true);
  const sepRec = sepAspects.some(a => {
    const other = a.p1 === p.idx ? a.p2 : a.p1;
    if (other > 6) return false;
    return reception(p.idx, other, p.lon) !== '';
  });
  const appNoRec = appAspects.some(a => {
    const other = a.p1 === p.idx ? a.p2 : a.p1;
    if (other > 6) return false;
    return reception(p.idx, other, p.lon) === '';
  });
  if (sepRec && appNoRec) out.push(['7', `${p.zh}弃纳就拒（与接纳之星分离而合于不接纳之星）`, 'high']);
  // 8 游走（无尊贵；外行星被日追/内行星追日——追日细节未计）
  if ((p.dignityScore || 0) === 0) out.push(['8', `${p.zh}游走（无本然尊贵）`, 'high']);
  // 9 与龙头龙尾相合而无纬度（纬度数据在盘上，但"无纬度"口径未定义——合相即计，medium）
  const node = byIdx[11];
  if (node && Math.abs(dif(p.lon, node.lon)) < 12) out.push(['9', `${p.zh}合交点`, 'medium']);
  // 10 自弱：在己庙第7位（己庙对宫）/ Feral / 不在接纳中（工程口径：己庙对宫+Feral 两项，不在接纳由 Feral 近似覆盖，如实标注）
  const ownSigns = [];
  for (let s = 0; s < 12; s++) if (DIGNITY.tables.domicile[s] === p.idx) ownSigns.push(s);
  const pSign = signIdxOfLon(p.lon);
  const selfSeventh = ownSigns.some(s => (s + 6) % 12 === pSign);
  if (selfSeventh) out.push(['10', `${p.zh}自弱：在己庙之第7位（${SIGNS[pSign].zh}=己庙${SIGNS[ownSigns[0]].zh}对宫）`, 'medium']);
  if (!out.some(o => o[0] === '10')) {
    const feral = (p.dignityScore || 0) === 0 && !chart.aspects.some(a => (a.p1 === p.idx || a.p2 === p.idx) && a.applying);
    if (feral) out.push(['10', `${p.zh}Feral（无相位亦无尊贵）`, 'high']);
  }
  return out;
}

// A 是否落在 B 的庙/擢升（B 接纳 A）
function reception(aIdx, bIdx, aLon) {
  const signIdx = signIdxOfLon(aLon);
  const dm = parseInt(DIGNITY.tables.domicile[signIdx], 10);
  const ex = DIGNITY.tables.exaltation[signIdx];
  const exP = ex ? parseInt(ex.planet, 10) : -1;
  const has = [];
  if (dm === bIdx) has.push('庙');
  if (exP === bIdx) has.push('擢');
  return has.join('+');
}

function timeOf(chart, ascSign, ascRuler, moon) {
  // Dariot：动宫=时/日，共宫=月/周，固宫=月/年
  const q = QUALITY_ZH[SIGNS[ascSign].quality];
  const moonQ = QUALITY_ZH[SIGNS[signIdxOfLon(moon.lon)].quality];
  const m = { 启动: '时或日', 固定: '月或年', 双体: '月或周' };
  return `升点${SIGNS[ascSign].zh}（${q}）：${m[q] || '不定'}；月落${SIGNS[signIdxOfLon(moon.lon)].zh}（${moonQ}）：${m[moonQ] || '不定'}`;
}

// 失物专项：藏处方位/贼相貌/距离/寻回难易
function lostObject(chart, byIdx, ascSign, ascRuler) {
  const out = {};
  const moon = byIdx[1];
  // 藏处征象：月亮所在星座（Griffin 12星座方位）——如月空亡则以4宫主
  const moonSign = SIGNS[signIdxOfLon(moon.lon)].zh;
  const fTab = tableByName('映射-12星座方位');
  if (fTab) {
    const r = fTab.rows.find(x => String(x[0]).includes(moonSign));
    if (r) out.locationHint = `失物征象（月落${moonSign}）：${r[1]}`;
  }
  // 贼相貌：土星所在星座（Griffin：土星=贼）
  const sat = byIdx[6];
  if (sat) {
    const sTab = tableByName('映射-土星12星座相貌');
    const sSign = SIGNS[signIdxOfLon(sat.lon)].zh;
    const r = sTab && sTab.rows.find(x => String(x[0]).includes(sSign));
    if (r) out.suspectProfile = `贼之相貌（土星落${sSign}）：${r[1]}`;
  }
  // 距离（Gadbury：度距→弗隆，按月亮到ASC度距）
  const ascLon = chart.houses.cuspsRaw[0];
  const degDist = Math.abs(dif(moon.lon, ascLon));
  const mSign = SIGNS[signIdxOfLon(moon.lon)];
  const gTab = tableByName('映射-距离换算');
  if (gTab) {
    const base = { 固定: 1, 双体: 5, 启动: 17 };
    const fur = base[mSign.quality] || 1;
    out.distanceHint = `月距ASC ${degDist.toFixed(0)}°，${mSign.zh}（${QUALITY_ZH[mSign.quality]}）→ 约 ${(fur * (1 + degDist / 30)).toFixed(0)} 弗隆起（Gadbury）`;
  }
  // 龙尾（南交点）落宫损害（Bonatti 映射E）
  const node = byIdx[11] || byIdx[10];
  if (node) {
    const t = tableByName('映射E-龙尾宫位损害');
    if (t) {
      const r = t.rows.find(x => x.length && String(x[0]).replace(/[^\d]/g, '') === String(node.house));
      if (r) out.tailWarning = `龙尾落${node.house}宫：${r[1] || r[0]}`;
    }
  }
  // 寻回难易：月亮空亡=难
  const applying = chart.aspects.some(a => a.applying && (a.p1 === 1 || a.p2 === 1));
  if (!applying) out.recoverHint = '月空亡：失物难寻回或拖延';
  return out;
}

module.exports = { analyzeHorary, moonObstructions, planetObstructions };
