// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎子件 - 预加载脚本（安全桥：渲染进程 → 排盘 IPC）
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('astrology', {
  /** 排盘：input {year,month,day,hour,minute,tzOffsetHours,lat,lon,houseSystem,calendar,...} */
  computeChart: (input) => ipcRenderer.invoke('compute-chart', input),
  /** 第4层规则解读：chart → {planets:[{zh,position,house,hits[]}]} + profiles（行星档案） */
  rulesLookup: (chart) => ipcRenderer.invoke('rules-lookup', chart),
  /** 规则库统计 */
  rulesStats: () => ipcRenderer.invoke('rules-stats'),
  /** 子表查询：{profile:'土星'} | {triplicity:'白羊'} | {house:1} | {terms:'摩羯'} | {dignity:true} | {tag:'...'} */
  tablesQuery: (q) => ipcRenderer.invoke('tables-query', q),
  /** 卜卦问答：{chart, questionType} */
  horaryAnalyze: (payload) => ipcRenderer.invoke('horary-analyze', payload),
  /** 推运（B 域）：{chart, age} → 法达 + 小限 */
  progressAnalyze: (payload) => ipcRenderer.invoke('progress-analyze', payload),
  /** 择时（D 域）：候选时间天象盘 chart → 宜忌评分 */
  electionAnalyze: (chart) => ipcRenderer.invoke('election-analyze', chart),
  /** 合盘（E 域）：{chartA, inputB} → 双盘比较（B 盘在主进程排盘） */
  synastryAnalyze: (payload) => ipcRenderer.invoke('synastry-analyze', payload),
  /** 世俗（F 域）：天象盘 chart → 世运判读 */
  mundaneAnalyze: (chart) => ipcRenderer.invoke('mundane-analyze', chart),
  /** 聚合总览：{chart, age} → 六域 verdict 分类 */
  overviewAnalyze: (payload) => ipcRenderer.invoke('overview-analyze', payload),
  /** 复合盘（E 域第三版）：{inputA, inputB} → 双出生时间中点重排盘 */
  davisonAnalyze: (payload) => ipcRenderer.invoke('davison-analyze', payload),
  davisonProgressed: (payload) => ipcRenderer.invoke('davison-progressed', payload),
  directionsAnalyze: (payload) => ipcRenderer.invoke('directions-analyze', payload),
  psychicAnalyze: (payload) => ipcRenderer.invoke('psychic-analyze', payload),
  /** 婚卷判读（E 域婚卷专项）：{chart, inputB?} → 婚点/婚时/婚数/伴侣质/婚龄差 */
  marriageAnalyze: (payload) => ipcRenderer.invoke('marriage-analyze', payload),
  /** 行星时（D 域 CE-155）：{year,month,day,hour,minute,tzOffsetHours,lat,lon} → 时主星 */
  planetaryHour: (inp) => ipcRenderer.invoke('planetary-hour', inp),
  /** 规则全文检索：query → 命中（含无标签规则） */
  rulesSearch: (query) => ipcRenderer.invoke('rules-search', query),
});
