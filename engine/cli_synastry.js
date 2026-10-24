// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 合盘域 CLI：双盘比较（A=beijing 本命，B=天象）
'use strict';
const { app } = require('electron');
const { computeChart } = require('./core/chart');
const { synastryCompare } = require('./core/synastry');

const A = { year: 1990, month: 6, day: 15, hour: 12, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', orbSet: 'modern' };
const B = { year: 2026, month: 10, day: 20, hour: 10, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', orbSet: 'modern' };

async function main() {
  try {
    const [chartA, chartB] = await Promise.all([computeChart(A), computeChart(B)]);
    const r = synastryCompare(chartA, chartB);
    console.log(JSON.stringify({
      verdict: r.verdict, score: r.score, lightJudgment: r.lightJudgment, lightScore: r.lightScore,
      aspects: r.aspects.map(f => `${f.w>0?'+':''}${f.w} ${f.a}${f.aspect}${f.b}(${f.tag})`),
      mutual: r.mutual, ascHits: r.ascHits,
      receptions: r.receptions, composite: r.composite, unscored: r.unscored,
    }, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
    app.exitCode = 1;
  }
  app.exit(0);
}
app.whenReady().then(main);
