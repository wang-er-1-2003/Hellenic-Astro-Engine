// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 复合盘 CLI：双出生输入 → 中点重排盘（A=beijing 1990-06-15 12:00，B=1992-03-08 08:00 上海）
'use strict';
const { app } = require('electron');
const { davisonChart } = require('./core/davison');

const A = { year: 1990, month: 6, day: 15, hour: 12, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', orbSet: 'modern' };
const B = { year: 1992, month: 3, day: 8, hour: 8, minute: 0, tzOffsetHours: 8, lat: 31.2304, lon: 121.4737, houseSystem: 'P', orbSet: 'modern' };

async function main() {
  try {
    const c = await davisonChart(A, B);
    const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
    console.log(JSON.stringify({
      midInput: c.meta.input,
      asc: { lon: c.houses.angles.asc, sign: SIGNS[Math.floor(c.houses.angles.asc / 30)] },
      planets: c.planets.filter(p => p.idx <= 6).map(p => ({ zh: p.zh, pos: p.position, sign: SIGNS[Math.floor(p.lon / 30)], house: p.house })),
    }, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
    app.exitCode = 1;
  }
  app.exit(0);
}
app.whenReady().then(main);
