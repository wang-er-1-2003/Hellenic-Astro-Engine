// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎子件 - Electron 主进程（窗口 + IPC 排盘服务）
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { computeChart } = require('./engine/core/chart');
const { computeProgression } = require('./engine/core/progressions');
const { electionScore } = require('./engine/core/election');
const { synastryCompare } = require('./engine/core/synastry');
const { mundaneScore, findNearestEclipse } = require('./engine/core/mundane');
const { getSwe } = require('./engine/core/swe');
const { eclipseUtInput, eclipseVisibility } = require('./engine/core/eclipse_tools');
const { davisonChart, davisonProgressed } = require('./engine/core/davison');
const { computeDirections } = require('./engine/core/directions');
const { psychicMeanings, aspectPsychic, sabianSymbols } = require('./engine/core/psychic');
const { lookupChart, stats } = require('./engine/core/rules');
const { planetaryProfile, triplicity, houseMeaning, termsFaces, dignityVerify, queryTables, stats: tablesStats } = require('./engine/core/tables');
const { analyzeHorary } = require('./engine/core/horary');
const { marriageReading, marriageTiming } = require('./engine/core/marriage');
const { planetaryHour } = require('./engine/core/hours');

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 880,
    title: '星盘引擎子件',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile('index.html');
}

// 排盘 IPC：渲染进程提交输入 → 引擎计算 → 返回结构化星盘
ipcMain.handle('compute-chart', async (_event, input) => {
  try {
    const chart = await computeChart(input);
    return { ok: true, chart };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 规则解读 IPC：渲染进程提交已算出的 chart → 返回第4层规则命中 + 行星档案
ipcMain.handle('rules-lookup', async (_event, chart) => {
  try {
    const result = lookupChart(chart);
    const profiles = chart.planets.filter(p => p.idx <= 6).map(p => ({
      zh: p.zh, profile: planetaryProfile(p.zh),
    }));
    return { ok: true, result, profiles };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 规则库统计 IPC
ipcMain.handle('rules-stats', async () => {
  try {
    return { ok: true, stats: stats() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 卜卦问答 IPC（结果目的域 C）：{chart, questionType}
ipcMain.handle('horary-analyze', async (_event, payload) => {
  try {
    const swe = await getSwe();
    return { ok: true, result: analyzeHorary(payload.chart, payload.questionType || '一般', swe) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 子表查询 IPC：{profile:'土星'} | {triplicity:'白羊'} | {house:1} | {terms:'摩羯'} | {dignity:true} | {tag:'...'}
ipcMain.handle('tables-query', async (_event, q) => {
  try {
    let data;
    if (q.profile) data = { profile: planetaryProfile(q.profile) };
    else if (q.triplicity) data = { triplicity: triplicity(q.triplicity) };
    else if (q.house) data = { house: houseMeaning(q.house) };
    else if (q.terms) data = { terms: termsFaces(q.terms) };
    else if (q.dignity) data = { dignity: dignityVerify() };
    else if (q.tag) data = { tables: queryTables(q.tag) };
    else data = { stats: tablesStats() };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 推运 IPC（结果目的域 B）：{chart, age} → 法达 + 小限
ipcMain.handle('progress-analyze', async (_event, payload) => {
  try {
    let transit = null;
    if (payload.transitInput) transit = await computeChart(payload.transitInput);
    return { ok: true, result: computeProgression(payload.chart, payload.age, payload.firdariaVersion || 'hand', transit) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 择时 IPC（结果目的域 D）：候选时间天象盘 chart → 宜忌评分；可选 natalInput 做本命协同（CE-163）
ipcMain.handle('election-analyze', async (_event, payload) => {
  try {
    const chart = payload.chart || payload;
    let natal = null;
    if (payload.natalInput) natal = await computeChart(payload.natalInput);
    return { ok: true, result: electionScore(chart, natal) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 合盘 IPC（结果目的域 E）：{chartA, inputB} → 双盘比较
ipcMain.handle('synastry-analyze', async (_event, payload) => {
  try {
    const chartB = await computeChart(payload.inputB);
    return { ok: true, result: synastryCompare(payload.chartA, chartB), chartB };
  } catch (err) {
    console.error('SYN_IPC_ERR', err.stack);
    return { ok: false, error: err.message };
  }
});

// 世俗 IPC（结果目的域 F）：天象盘 chart → 世运判读（第三版：蚀时刻整盘排算蚀黄经精确落宫 + 蚀可见性）
ipcMain.handle('mundane-analyze', async (_event, chart) => {
  try {
    let eclipseChart = null;
    let visibility = null;
    let eclNote = null;
    const hit = findNearestEclipse(chart);
    if (hit && hit.tm && chart.meta && chart.meta.input) {
      const inp = chart.meta.input;
      const eui = await eclipseUtInput(hit, inp.lat, inp.lon, inp.houseSystem);
      if (eui) {
        eclNote = eui.note;
        eclipseChart = await computeChart(eui.eclInput);
        // 蚀可见性（TTB-213）：蚀光体于盘地点地平以上可见→应验加重；azalt（SE_EQU2HOR）
        visibility = await eclipseVisibility(hit.kind, eui.utJd, inp.lat, inp.lon);
        visibility.note += '；' + eui.note;
      }
    }
    const result = mundaneScore(chart, eclipseChart, visibility);
    if (eclNote && result.unscored) result.unscored.push(eclNote === '' ? '' : `蚀时刻排算：${eclNote}`);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 行星时（CE-155 Clavis 择时世俗卷）：任意时刻×地点 → 行星时主星（昼/夜、序号、轮值）
ipcMain.handle('planetary-hour', async (_event, inp) => {
  try {
    const swe = await getSwe();
    const jdUt = swe.julday(
      inp.year, inp.month, inp.day,
      (inp.hour || 0) + (inp.minute || 0) / 60 - (inp.tzOffsetHours || 0),
      0, 0, 1
    );
    const h = planetaryHour(jdUt, inp.lat, inp.lon, swe, inp.tzOffsetHours);
    if (!h) return { ok: false, error: '行星时计算失败（rise_trans 无返回，可能高纬极昼/极夜）' };
    return { ok: true, result: { ...h, source: '规则库-Clavis择时世俗卷 CE-155' } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 复合盘 IPC（E 域第三版）：{inputA, inputB} → 双出生时间中点重排盘
ipcMain.handle('davison-analyze', async (_event, payload) => {
  try {
    const chart = await davisonChart(payload.inputA, payload.inputB);
    return { ok: true, chart };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 组合推运 IPC（E 域第四版）：{inputA, inputB, years} → 组合盘时刻按次限法推 years 年
ipcMain.handle('davison-progressed', async (_event, payload) => {
  try {
    const chart = await davisonProgressed(payload.inputA, payload.inputB, payload.years ?? 1);
    return { ok: true, chart };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 主限向运 IPC（B 域）：{chart} → 赤经投影方向表（方向合相应期）
ipcMain.handle('directions-analyze', async (_event, payload) => {
  try {
    const swe = await getSwe();
    const res = computeDirections(payload.chart, swe, payload.chart.meta.chartJd);
    return { ok: true, result: res };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 心理释义 IPC（A 域现代层）：{chart} → esoteric 释义 + Sabian 度数符号 + 相位心理释义（Astrolog MIT）
ipcMain.handle('psychic-analyze', (_event, payload) => {
  try {
    const m = psychicMeanings(payload.chart);
    m.aspects = aspectPsychic(payload.chart);
    m.sabian = sabianSymbols(payload.chart);
    return { ok: true, result: m };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 婚卷判读 IPC（E 域婚卷专项）：{chart, inputB?, transitInput?} → 婚点/婚时/婚数/伴侣质/婚龄差等 + 行运应期（DOR2-10）
ipcMain.handle('marriage-analyze', async (_event, payload) => {
  try {
    let partner = null;
    if (payload.inputB) partner = await computeChart(payload.inputB);
    const result = marriageReading(payload.chart, partner);
    if (payload.transitInput) {
      const transit = await computeChart({ ...payload.transitInput, type: 'transit' });
      result.timing = marriageTiming(payload.chart, transit);
    }
    return { ok: true, result };
  } catch (err) {
    console.error('MARRIAGE_IPC_ERR', err.stack);
    return { ok: false, error: err.message };
  }
});

// 规则全文检索 IPC：query → rules_index.json 全字段命中（含无标签规则）
// 检索增强：① 命中总数精确统计（不再 ≥50 截断时 break）；② 同义词扩展（行星/星座/相位/宫位别名，词间 AND、词内任一）
const SEARCH_SYNONYMS = {
  '太阳': ['太阳', '日', 'sun'], '月亮': ['月亮', '月', '太阴', 'moon'], '水星': ['水星', '辰星', 'mercury'], '金星': ['金星', '太白', 'venus'],
  '火星': ['火星', '荧惑', 'mars'], '木星': ['木星', '岁星', 'jupiter'], '土星': ['土星', '镇星', '填星', 'saturn'],
  '白羊': ['白羊', '牡羊', 'aries'], '金牛': ['金牛', '牡牛', 'taurus'], '双子': ['双子', 'gemini'], '巨蟹': ['巨蟹', 'cancer'], '狮子': ['狮子', 'leo'],
  '处女': ['处女', '室女', 'virgo'], '天秤': ['天秤', '天平', 'libra'], '天蝎': ['天蝎', 'scorpio'], '射手': ['射手', '人马', 'sagittarius'],
  '摩羯': ['摩羯', '魔羯', '山羊', 'capricorn'], '水瓶': ['水瓶', '宝瓶', 'aquarius'], '双鱼': ['双鱼', 'pisces'],
  '合相': ['合', '合相', '会', 'conjunction'], '三合': ['三合', '拱', '120', 'trine'], '六合': ['六合', '半合', '60', 'sextile'],
  '刑': ['刑', '四分', '90', 'square'], '冲': ['冲', '对分', '180', 'opposition'], '半六合': ['半六合', '30'], '补八分': ['补八分', '150'],
  '本命': ['本命', 'natal'], '推运': ['推运', '法达', '小限', 'progressed'], '卜卦': ['卜卦', '问事', 'horary'],
  '择时': ['择时', 'election'], '合盘': ['合盘', 'synastry'], '世俗': ['世俗', '蚀', 'mundane', '年主'],
  '1宫': ['1宫', '第一宫', '命宫', 'asc'], '10宫': ['10宫', '第十宫', '官禄', 'mc'],
};
ipcMain.handle('rules-search', async (_event, query) => {
  try {
    if (!query || !String(query).trim()) return { ok: true, result: { total: 0, hits: [] } };
    const q = String(query).trim().toLowerCase();
    const terms = q.split(/[\s,，、]+/).filter(Boolean); // 分词 AND 匹配
    // 每词展开同义词组（词内 OR）：t 命中某组成员即整组展开；未命中保持原词
    const groups = terms.map(t => {
      const hit = Object.values(SEARCH_SYNONYMS).find(arr => arr.some(s => s.toLowerCase() === t || s.toLowerCase().includes(t)));
      return hit ? hit.map(s => s.toLowerCase()) : [t];
    });
    const RULES = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'engine/data/rules_index.json'), 'utf-8')).rules;
    const hits = [];
    let total = 0;
    for (const r of RULES) {
      const hay = [r.rule_id, r.condition, r.result, r.source, r.translation || '', r.book || '', r.notes || '', r.rule_type || '', r.author || '', r.era || '', (r.planets || []).join(' '), (r.houses || []).join(' '), (r.aspects || []).join(' '), (r.signs || []).join(' '), r.tags || ''].join(' ').toLowerCase();
      if (groups.every(g => g.some(s => hay.includes(s)))) {
        total++;
        if (hits.length < 50) hits.push({ id: r.rule_id, condition: r.condition, result: r.result, source: r.source, tagged: !!r.tags, planets: r.planets, houses: r.houses });
      }
    }
    return { ok: true, result: { total, truncated: total > 50, hits } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 聚合总览 IPC：单盘可算域一次算完（按结果目的分类；卜卦/合盘需专门输入，注明跳过）
ipcMain.handle('overview-analyze', async (_event, payload) => {
  const { chart, age } = payload;
  const out = {};
  try {
    // A 本命：chart 排盘已含 行星条件/偶然计分/Almuten/Hyleg-Alcocoden（chart.planets[].conditions/accidental/totalScore/almuten + chart.life）
    out.natal = {
      label: 'A 本命（识人/一生格局）',
      score: chart.planets.filter(p => p.idx <= 6).reduce((t, p) => t + (p.totalScore || 0), 0),
      verdict: '综合计分汇总（行星条件+偶然尊贵）',
      detail: {
        almuten: chart.almuten ? `${chart.almuten.zh}（${chart.almuten.method === 'modern' ? '现代法' : '古法'}）` : null,
        hyleg: chart.life && chart.life.hyleg ? `${chart.life.hyleg.zh} · 年限 ${chart.life.alcocoden ? chart.life.alcocoden.zh : '—'}` : null,
        strongest: [...chart.planets.filter(p => p.idx <= 6)].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))[0],
      },
      factors: chart.planets.filter(p => p.idx <= 6).map(p => ({
        f: `${p.glyph}${p.zh} 落${p.house}宫`, w: p.totalScore || 0,
        d: `本然 ${p.dignityScore ?? '—'} / 偶然 ${p.accidentalScore ?? '—'} / 条件 ${(p.conditions || []).length} 项`, s: 'chart 排盘',
      })),
    };
    // B 推运：法达+小限（age 参数）
    out.progress = (() => {
      const p = computeProgression(chart, age || 0);
      return {
        label: 'B 推运（时运/大限）',
        score: 0, verdict: `主周期 ${p.firdaria.main.zh}（${p.firdaria.main.start}-${p.firdaria.main.end} 岁）· 当前副段 ${p.firdaria.activeSub ? p.firdaria.activeSub.zh : '—'} · 小限 ${p.profection.house} 宫 ${p.profection.signZh}`,
        detail: p,
      };
    })();
    // D 择时：当前盘为候选时间
    out.election = (() => {
      const r = electionScore(chart);
      return { label: 'D 择时（选时/宜忌）', score: r.score, verdict: r.verdict, detail: { unscored: r.unscored.length }, factors: r.factors };
    })();
    // F 世俗：当前盘为天象/蚀盘
    out.mundane = (() => {
      const r = mundaneScore(chart);
      return { label: 'F 世俗（天象/世运）', score: r.score, verdict: r.verdict, detail: { eclipse: r.eclipse, lord: r.lord ? r.lord.zh : null }, factors: r.factors };
    })();
    // C 卜卦 / E 合盘：需专门输入
    out.horary = { label: 'C 卜卦（问事）', verdict: '跳过——需问题/问卦时刻，用卜卦块单独算', score: null };
    out.synastry = { label: 'E 合盘（关系）', verdict: '跳过——需第二盘，用合盘块单独算', score: null };
    return { ok: true, result: out };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();
  // smoke 验证模式：启动窗口后自动退出（electron.exe . --smoke）
  if (process.argv.includes('--smoke')) {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.on('console-message', (_e, level, message) => {
      console.log('[render:' + level + ']', message);
    });
    setTimeout(async () => {
      try {
        const report = await win.webContents.executeJavaScript(`(async function(){
          const tabs = [...document.querySelectorAll('.type-tab')];
          const out = [];
          for (const t of tabs.slice(0, 2)) {
            t.click();
            await new Promise(r => setTimeout(r, 600));
            const box = document.getElementById('chart-box');
            const err = box.querySelector('.err');
            const rules = document.getElementById('out-rules');
            out.push({ type: t.textContent, err: err ? err.textContent : null,
                       svgLen: box.querySelector('svg') ? box.querySelector('svg').outerHTML.length : 0,
                       rulesBlocks: rules.querySelectorAll('details.rule-block').length,
                       rulesProfile: rules.querySelectorAll('.profile').length,
                       rulesMeta: rules.querySelector('.rules-meta') ? rules.querySelector('.rules-meta').textContent : null,
                       condTags: document.querySelectorAll('#out-planets .cond-tag').length,
                       condBlock: [...rules.querySelectorAll('details.rule-block summary')].some(s => /行星条件/.test(s.textContent)),
                       info: document.getElementById('chart-info').textContent });
          }
          return out;
        })()`);
        console.log('RENDER_REPORT', JSON.stringify(report));
        // 卜卦链路冒烟：切目的 tab → 问卦 → 读 verdict
        const horary = await win.webContents.executeJavaScript(`(async function(){
          document.querySelector('.domain-tab[data-domain="horary"]').click();
          document.getElementById('horary-type').value = '盗窃失物';
          document.getElementById('btn-horary').click();
          await new Promise(r => setTimeout(r, 1500));
          const v = document.querySelector('#out-horary .v-main');
          return { verdict: v ? v.textContent : null,
                   factors: document.querySelectorAll('#out-horary .v-fact').length,
                   special: document.querySelector('#out-horary .v-special') ? 1 : 0 };
        })()`);
        console.log('HORARY_REPORT', JSON.stringify(horary));
        // 推运链路冒烟（B 域）：固定 age=36 → 读法达主周期/小限
        const prog = await win.webContents.executeJavaScript(`(async function(){
          const chart = window.__lastChart;
          const r = await window.astrology.progressAnalyze({ chart, age: 36 });
          if (!r.ok) return { err: r.error };
          return { firdariaMain: r.result.firdaria.main.zh,
                   firdariaStart: r.result.firdaria.main.start,
                   profHouse: r.result.profection.house,
                   profLord: r.result.profection.lordZh,
                   subLen: r.result.firdaria.sub.length };
        })()`);
        console.log('PROGRESSION_REPORT', JSON.stringify(prog));
        // 择时链路冒烟（D 域）：当前盘 → 宜忌评分（第三版：传本命盘做本命协同）
        const election = await win.webContents.executeJavaScript(`(async function(){
          const r = await window.astrology.electionAnalyze({ chart: window.__lastChart, natalInput: window.__lastChart.meta.input });
          if (!r.ok) return { err: r.error };
          return { verdict: r.result.verdict, score: r.result.score, factors: r.result.factors.length, unscored: r.result.unscored.length,
                   synergy: r.result.natalSynergy ? (r.result.natalSynergy.co + '/' + r.result.natalSynergy.conflict) : null };
        })()`);
        console.log('ELECTION_REPORT', JSON.stringify(election));
        // 合盘链路冒烟（E 域）：A=当前盘，B=固定 demo 时间
        const syn = await win.webContents.executeJavaScript(`(async function(){
          const inputB = { year: 2026, month: 10, day: 20, hour: 10, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', orbSet: 'modern' };
          const r = await window.astrology.synastryAnalyze({ chartA: window.__lastChart, inputB });
          if (!r.ok) return { err: r.error };
          return { verdict: r.result.verdict, score: r.result.score, aspects: r.result.aspects.length,
                   lightPairs: r.result.aspects.filter(f => f.lightPair).length,
                   ascHits: r.result.ascHits.length };
        })()`);
        console.log('SYNASTRY_REPORT', JSON.stringify(syn));
        // 世俗链路冒烟（F 域）：当前盘 → 世运判读
        const mundane = await win.webContents.executeJavaScript(`(async function(){
          const r = await window.astrology.mundaneAnalyze(window.__lastChart);
          if (!r.ok) return { err: r.error };
          return { verdict: r.result.verdict, score: r.result.score, eclipse: r.result.eclipse, lord: r.result.lord ? r.result.lord.zh : null };
        })()`);
        console.log('MUNDANE_REPORT', JSON.stringify(mundane));
        // 聚合总览冒烟：一键六域分类
        const overview = await win.webContents.executeJavaScript(`(async function(){
          const r = await window.astrology.overviewAnalyze({ chart: window.__lastChart, age: 36 });
          if (!r.ok) return { err: r.error };
          return Object.fromEntries(Object.entries(r.result).map(([k, v]) => [k, { score: v.score, v: String(v.verdict).slice(0, 40) }]));
        })()`);
        console.log('OVERVIEW_REPORT', JSON.stringify(overview));
        // 复合盘冒烟（E 域第三版）：A=当前盘出生输入，B=固定 demo
        const davison = await win.webContents.executeJavaScript(`(async function(){
          const inputA = window.__lastChart.meta.input;
          const inputB = { year: 1992, month: 3, day: 8, hour: 8, minute: 0, tzOffsetHours: 8, lat: 31.2304, lon: 121.4737, houseSystem: 'P', orbSet: 'modern' };
          const r = await window.astrology.davisonAnalyze({ inputA, inputB });
          if (!r.ok) return { err: r.error };
          const SIGNS = ['白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手','摩羯','水瓶','双鱼'];
          return { mid: r.chart.meta.input.year + '-' + r.chart.meta.input.month + '-' + r.chart.meta.input.day + ' ' + r.chart.meta.input.hour,
                   asc: SIGNS[Math.floor(r.chart.houses.angles.asc / 30)] };
        })()`);
        console.log('DAVISON_REPORT', JSON.stringify(davison));
        // 婚卷判读冒烟（E 域婚卷专项）：当前盘 → 婚点/婚时/婚数/伴侣质/婚龄差
        const marriage = await win.webContents.executeJavaScript(`(async function(){
          const r = await window.astrology.marriageAnalyze({ chart: window.__lastChart });
          if (!r.ok) return { err: r.error };
          return { verdict: r.result.verdict, score: r.result.score, readings: r.result.readings.length,
                   points: Object.keys(r.result.points).filter(k => r.result.points[k] != null).length,
                   unscored: r.result.unscored.length };
        })()`);
        console.log('MARRIAGE_REPORT', JSON.stringify(marriage));
        // 规则全文检索冒烟：无标签规则可达性
        const rs = await win.webContents.executeJavaScript(`(async function(){
          const r1 = await window.astrology.rulesSearch('空亡');
          const r2 = await window.astrology.rulesSearch('火星 角宫');
          return { q1: r1.ok ? r1.result.total : r1.error, q2: r2.ok ? r2.result.total : r2.error,
                   sample: r1.ok && r1.result.hits[0] ? (r1.result.hits[0].id + '|' + (r1.result.hits[0].tagged ? 'tag' : 'untag')) : null };
        })()`);
        console.log('RULES_SEARCH_REPORT', JSON.stringify(rs));
      } catch (e) { console.log('RENDER_FAIL', e.message); }
      console.log('SMOKE_OK');
      app.exit(0);
    }, 3000);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
