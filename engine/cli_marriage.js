// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 婚卷判读 CLI：electron engine/cli_marriage.js [case] [Y M D H]（可带行运日期做 DOR2-10 应期）
// case: beijing 本命盘 | beijing-partner 本命+伴侣盘（伴侣=天象 2026-10-20）
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { computeChart } = require('./core/chart');
const { marriageReading, marriageTiming } = require('./core/marriage');

const CASES = {
  beijing: { year: 1990, month: 6, day: 15, hour: 12, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P' },
  'beijing-partner': { year: 1990, month: 6, day: 15, hour: 12, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P' },
};

async function main() {
  try {
    const arg = process.argv[2] || 'beijing';
    const input = CASES[arg];
    if (!input) throw new Error('未知案例: ' + arg);
    const chart = await computeChart({ ...input, type: 'natal' });
    let partner = null;
    if (arg === 'beijing-partner') {
      partner = await computeChart({ year: 2026, month: 10, day: 20, hour: 10, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', type: 'natal' });
    }
    const result = marriageReading(chart, partner);
    // 可选行运应期：argv[3..6] = Y M D H（世界时? 本地+8 近似）
    if (process.argv.length >= 7) {
      const [ty, tm, td, th] = process.argv.slice(3, 7).map(Number);
      if (ty && tm && td) {
        const transit = await computeChart({ year: ty, month: tm, day: td, hour: th || 12, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', type: 'transit' });
        result.timing = marriageTiming(chart, transit);
      }
    }
    fs.writeFileSync(path.join(__dirname, 'out_marriage.json'), JSON.stringify(result, null, 1), 'utf-8');
    console.log('ok ->', result.verdict, 'score', result.score, '| readings', result.readings.length, '| points keys', Object.keys(result.points).join(','));
    if (result.timing) console.log('timing ->', result.timing.verdict, '| triggers', result.timing.triggers.length, '| blocked', result.timing.blocked.length);
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
    app.exitCode = 1;
  }
  app.exit(0);
}
app.whenReady().then(main);
