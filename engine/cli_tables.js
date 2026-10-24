// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 子表查询 CLI：electron engine/cli_tables.js [profile|triplicity|house|terms|dignity] [参数]
'use strict';
const path = require('path');
const { app } = require('electron');

const USAGE = `用法:
  profile 土星        行星档案（要素/年数/友敌/行度）
  triplicity 白羊     三分主星多套
  house 1            十二宫含义
  terms 摩羯         界/面
  dignity            尊贵对照（rule_tables vs dignity_tables.json）
  stats              子表统计`;

async function main() {
  const mode = process.argv[2] || 'stats';
  const val = process.argv[3] || '';
  const t = require('./core/tables');
  let out = {};
  try {
    if (mode === 'profile') out = { mode, data: t.planetaryProfile(val) };
    else if (mode === 'triplicity') out = { mode, data: t.triplicity(val) };
    else if (mode === 'house') out = { mode, data: t.houseMeaning(parseInt(val, 10) || 1) };
    else if (mode === 'terms') out = { mode, data: t.termsFaces(val) };
    else if (mode === 'dignity') out = { mode, data: t.dignityVerify() };
    else if (mode === 'stats') out = { mode, data: t.stats() };
    else out = { mode, error: '未知模式\n' + USAGE };
  } catch (e) {
    out = { mode, error: e.message };
  }
  require('fs').writeFileSync(path.join(__dirname, 'out_tables.json'), JSON.stringify(out, null, 1), 'utf-8');
  console.log('ok ->', mode);
  app.exit(0);
}
app.whenReady().then(main);
