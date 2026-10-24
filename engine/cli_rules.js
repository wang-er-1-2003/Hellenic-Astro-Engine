// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - 规则解读 CLI（第4层验证入口）
// 用法: electron.exe cli_rules.js [case]  case: beijing | ny2000 | l497 | JSON文件
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { computeChart } = require('./core/chart');
const { lookupChart, stats } = require('./core/rules');

const CASES = {
  beijing: { year: 1990, month: 6, day: 15, hour: 12, minute: 0, tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P' },
  ny2000: { year: 2000, month: 1, day: 1, hour: 7, minute: 0, tzOffsetHours: -5, lat: 40.7128, lon: -74.006, houseSystem: 'P' },
  l497: { year: 497, month: 10, day: 28, hour: 12, minute: 35, tzOffsetHours: 2, calendar: 'j', lat: 31.0, lon: 30.0, houseSystem: 'O' },
};

async function main() {
  try {
    const arg = process.argv[2] || 'beijing';
    const input = CASES[arg] || JSON.parse(fs.readFileSync(arg, 'utf-8'));
    const chart = await computeChart(input);
    const result = lookupChart(chart, { includeOriginal: false });
    console.log(JSON.stringify({ stats: stats(), rules: result }, null, 1));
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
    app.exitCode = 1;
  }
  app.exit(0);
}
app.whenReady().then(main);
