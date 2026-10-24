// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 世俗域 CLI：天象盘 → 世运判读（默认 2026-10-20 北京天象；可传 Y M D 排指定日）
// 第四版：蚀命中时按蚀表 TT 时刻经 ΔT 回退 UT 排蚀整盘（IES 多项式），蚀黄经精确落宫 + 蚀可见性（azalt, TTB-213）
'use strict';
const { app } = require('electron');
const { computeChart } = require('./core/chart');
const { mundaneScore, findNearestEclipse } = require('./core/mundane');
const { eclipseUtInput, eclipseVisibility } = require('./core/eclipse_tools');

const a = process.argv.slice(2);
const INPUT = a.length >= 3
  ? { year: Number(a[0]), month: Number(a[1]), day: Number(a[2]), hour: a[3] || 10, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', orbSet: 'modern' }
  : { year: 2026, month: 10, day: 20, hour: 10, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', orbSet: 'modern' };

async function main() {
  try {
    const chart = await computeChart(INPUT);
    let eclipseChart = null;
    let visibility = null;
    let eclNote = null;
    const hit = findNearestEclipse(chart);
    if (hit && hit.tm) {
      const eui = await eclipseUtInput(hit, INPUT.lat, INPUT.lon, INPUT.houseSystem);
      if (eui) {
        eclNote = eui.note;
        eclipseChart = await computeChart(eui.eclInput);
        visibility = await eclipseVisibility(hit.kind, eui.utJd, INPUT.lat, INPUT.lon);
        visibility.note += '；' + eui.note;
      }
    }
    const r = mundaneScore(chart, eclipseChart, visibility);
    if (eclNote) r.unscored.push(`蚀时刻排算：${eclNote}`);
    console.log(JSON.stringify({ verdict: r.verdict, score: r.score, eclipse: r.eclipse, eclMode: r.eclMode, visibility, lord: r.lord, virtue: r.virtue, factors: r.factors.map(f => `${f.w>0?'+':''}${f.w} ${f.f} | ${f.d} (${f.s})`), unscored: r.unscored }, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
    app.exitCode = 1;
  }
  app.exit(0);
}
app.whenReady().then(main);
