// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎 - CLI 测试入口（Electron 运行）
// 用法: electron.exe cli.js [case]  （case: ny2000 | l497 | 自定义JSON文件路径）
// 输出: 结构化星盘 JSON（stdout）
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { computeChart } = require('./core/chart');

const CASES = {
  // 纽约 2000-01-01 12:00 UT（= 07:00 EST），对照官方验证
  ny2000: {
    year: 2000, month: 1, day: 1, hour: 7, minute: 0,
    tzOffsetHours: -5, lat: 40.7128, lon: -74.006, houseSystem: 'P',
    orbSet: 'modern', includeMinor: false,
  },
  // L497 判例：497-10-28 12:35 LMT 亚历山大（lat31 lon30，**儒略历**，LMT=UT+lon/15≈+2h）
  l497: {
    year: 497, month: 10, day: 28, hour: 12, minute: 35,
    tzOffsetHours: 2, calendar: 'j',
    lat: 31.0, lon: 30.0, houseSystem: 'O',
    orbSet: 'modern', includeMinor: false,
  },
  // 北京 1990-06-15 12:00 CST
  beijing: {
    year: 1990, month: 6, day: 15, hour: 12, minute: 0,
    tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P',
    orbSet: 'modern', includeMinor: false,
  },
  // 次限：北京 1990-06-15 出生，推运 35 岁
  beijing_prog: {
    year: 1990, month: 6, day: 15, hour: 12, minute: 0,
    tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P',
    type: 'progressed', years: 35, orbSet: 'modern',
  },
  // 日返：1990-06-15 出生的下一次太阳回归
  beijing_sr: {
    year: 1990, month: 6, day: 15, hour: 12, minute: 0,
    tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P',
    type: 'solar-return', orbSet: 'modern',
  },
};

async function main() {
  try {
    const arg = process.argv[2];
    let input;
    if (!arg) input = CASES.ny2000;
    else if (CASES[arg]) input = CASES[arg];
    else if (fs.existsSync(arg)) input = JSON.parse(fs.readFileSync(arg, 'utf-8'));
    else { console.error('unknown case:', arg); app.exit(2); return; }

    const chart = await computeChart(input);
    console.log(JSON.stringify(chart, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
    app.exitCode = 1;
  }
  app.exit(0);
}
app.whenReady().then(main);
