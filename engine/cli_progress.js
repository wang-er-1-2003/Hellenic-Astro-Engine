// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 推运域 CLI：排 beijing 盘 + 法达/小限（age 参数，默认 36）
'use strict';
const { app } = require('electron');
const { computeChart } = require('./core/chart');
const { computeProgression } = require('./core/progressions');

const INPUTS = {
  beijing: { year: 1990, month: 6, day: 15, hour: 12, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', orbSet: 'modern' },
};
const name = process.argv[2] || 'beijing';
const age = parseInt(process.argv[3] || '36', 10);

async function main() {
  try {
    const chart = await computeChart(INPUTS[name] || JSON.parse(name));
    const prog = computeProgression(chart, age);
    const out = {
      chart: { isDay: chart.meta.isDay, asc: chart.houses.angles.asc },
      firdaria: {
        age: prog.firdaria.age,
        main: prog.firdaria.main,
        sub: prog.firdaria.sub,
        activeSub: prog.firdaria.activeSub,
        version: prog.firdaria.version,
      },
      profection: prog.profection,
      sources: prog.sources,
    };
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
    app.exitCode = 1;
  }
  app.exit(0);
}
app.whenReady().then(main);
