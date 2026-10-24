// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 卜卦问答 CLI：electron engine/cli_horary.js [case]
// case: demo 盗窃失物(固定时刻) | now 用当前时刻天象盘
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { computeChart } = require('./core/chart');
const { analyzeHorary } = require('./core/horary');

const CASES = {
  // 固定可复现案例：2026-01-15 10:30 北京，问"手机丢了能找到吗"
  demo: { year: 2026, month: 1, day: 15, hour: 10, minute: 30, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', questionType: '盗窃失物' },
};

async function main() {
  try {
    const arg = process.argv[2] || 'demo';
    let input;
    if (arg === 'now') {
      const d = new Date();
      const tz = -d.getTimezoneOffset() / 60;
      input = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), tzOffsetHours: tz, lat: 45.8038, lon: 126.535, houseSystem: 'P', questionType: '盗窃失物' };
    } else {
      input = CASES[arg];
    }
    if (!input) throw new Error('未知案例: ' + arg);
    const chart = await computeChart({ ...input, type: 'transit' });
    const result = analyzeHorary(chart, input.questionType || '一般');
    fs.writeFileSync(path.join(__dirname, 'out_horary.json'), JSON.stringify(result, null, 1), 'utf-8');
    console.log('ok ->', result.verdict, 'score', result.score);
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
    app.exitCode = 1;
  }
  app.exit(0);
}
app.whenReady().then(main);
