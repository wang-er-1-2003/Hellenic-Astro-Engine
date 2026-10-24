// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 择时域 CLI：候选时间天象盘 → 宜忌评分（第三版：支持本命协同，传 beijing 本命盘比对）
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { computeChart } = require('./core/chart');
const { electionScore } = require('./core/election');

// 候选时间：2026-10-20 10:00 北京（示例）
const INPUT = {
  year: 2026, month: 10, day: 20, hour: 10, minute: 0,
  tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', orbSet: 'modern',
};
const NATAL = {
  year: 1990, month: 6, day: 15, hour: 12, minute: 0,
  tzOffsetHours: 8, lat: 39.9042, lon: 116.4074, houseSystem: 'P', orbSet: 'modern',
};

async function main() {
  try {
    const chart = await computeChart(INPUT);
    const natal = await computeChart({ ...NATAL, type: 'natal' });
    const r = electionScore(chart, natal);
    fs.writeFileSync(path.join(__dirname, 'out_election.json'), JSON.stringify({ chart: { meta: chart.meta }, result: { verdict: r.verdict, score: r.score, factors: r.factors, unscored: r.unscored, natalSynergy: r.natalSynergy } }, null, 1), 'utf-8');
    console.log('ok ->', r.verdict, 'score', r.score, '| synergy co', r.natalSynergy ? r.natalSynergy.co : 0, 'conflict', r.natalSynergy ? r.natalSynergy.conflict : 0);
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
    app.exitCode = 1;
  }
  app.exit(0);
}
app.whenReady().then(main);
