// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 星盘引擎子件 - 界面逻辑（盘型切换 / 输入收集 / 计算 / 输出填充）
'use strict';

(function () {
  const TYPE_LABELS = {
    natal: '本命', transit: '天象', progressed: '次限',
    tertiary: '三限', 'solar-return': '日返', 'lunar-return': '月返', 'solar-arc': '太阳弧',
    davison: '组合盘',
  };
  const NEEDS_YEARS = { progressed: true, tertiary: true, 'solar-arc': true };
  const NEEDS_TX = { transit: true };
  const NEEDS_DAV = { davison: true };

  let currentType = 'natal';

  // ---- 盘型标签 ----
  function renderTypeTabs() {
    const bar = document.getElementById('type-tabs');
    bar.innerHTML = '';
    for (const [key, label] of Object.entries(TYPE_LABELS)) {
      const b = document.createElement('button');
      b.className = 'type-tab' + (key === currentType ? ' active' : '');
      b.textContent = label;
      b.onclick = () => switchType(key);
      bar.appendChild(b);
    }
  }

  function switchType(type) {
    currentType = type;
    renderTypeTabs();
    // 参数区显隐
    document.getElementById('param-years-wrap').style.display = NEEDS_YEARS[type] ? '' : 'none';
    document.getElementById('param-tx-wrap').style.display = NEEDS_TX[type] ? '' : 'none';
    document.getElementById('param-dav-wrap').style.display = NEEDS_DAV[type] ? '' : 'none';
    compute();
  }

  // ---- 输入收集 ----
  function collectInput() {
    const v = (id) => document.getElementById(id).value;
    if (currentType === 'davison') {
      // 组合盘：A 盘（本命输入区）+ B 盘（组合盘参数区）→ 中点盘
      return {
        type: 'davison',
        inputA: {
          year: +v('in-year'), month: +v('in-month'), day: +v('in-day'),
          hour: +v('in-hour'), minute: +v('in-minute'),
          tzOffsetHours: +v('in-tz'), lat: +v('in-lat'), lon: +v('in-lon'),
          houseSystem: v('in-house') || 'P', orbSet: v('in-orb') || 'modern',
          zodiac: v('in-zodiac') || 'tropical',
        },
        inputB: {
          year: +v('dav-year'), month: +v('dav-month'), day: +v('dav-day'),
          hour: +v('dav-hour'), minute: +v('dav-minute'),
          tzOffsetHours: +v('dav-tz') || 8, lat: +v('dav-lat'), lon: +v('dav-lon'),
          houseSystem: v('in-house') || 'P', orbSet: v('in-orb') || 'modern',
        },
      };
    }
    const input = {
      type: currentType,
      year: +v('in-year'), month: +v('in-month'), day: +v('in-day'),
      hour: +v('in-hour'), minute: +v('in-minute'),
      tzOffsetHours: +v('in-tz'), lat: +v('in-lat'), lon: +v('in-lon'),
      houseSystem: v('in-house') || 'P', orbSet: v('in-orb') || 'modern',
      zodiac: v('in-zodiac') || 'tropical',
    };
    if (NEEDS_YEARS[currentType]) input.years = +v('in-years') || 30;
    if (currentType === 'transit') {
      const mode = document.querySelector('input[name="tx-mode"]:checked').value;
      if (mode === 'now') { input.useNow = true; }
      else {
        input.txYear = +v('tx-year'); input.txMonth = +v('tx-month');
        input.txDay = +v('tx-day'); input.txHour = +v('tx-hour');
        input.txMinute = +v('tx-minute'); input.txTzOffsetHours = +v('tx-tz') || input.tzOffsetHours;
      }
    }
    return input;
  }

  // ---- 输出填充 ----
  function fillOutputs(chart) {
    const m = chart.meta, h = chart.houses;
    // 图下信息
    const info = [
      `盘型：${TYPE_LABELS[m.type] || m.type}`,
      `chartJd=${m.chartJd.toFixed(4)}`,
      m.years != null ? `推运年龄=${m.years}岁` : '',
      m.solarArcDeg != null ? `太阳弧=${m.solarArcDeg.toFixed(4)}°` : '',
      `分宫=${h.systemName}`, `昼/夜=${m.isDay}`,
    ].filter(Boolean);
    document.getElementById('chart-info').textContent = info.join('  |  ');

    // 四轴
    const a = h.angles;
    document.getElementById('out-angles').innerHTML = [
      ['ASC', a.ascF.text], ['MC', a.mcF.text], ['DC', a.dcF.text], ['IC', a.icF.text],
    ].map(([k, v]) => `<tr><td>${k}</td><td>${v.text || v}</td></tr>`).join('');

    // 行星（+ 偶然条件列）
    const condMap = {};
    (chart.conditions || []).forEach(c => { if (c.idx != null) condMap[c.idx] = c; });
    document.getElementById('out-planets').innerHTML = chart.planets.map(p => {
      const r = p.retrograde ? '<span class="r">R</span>' : '';
      const c = condMap[p.idx];
      const cBits = [];
      if (c) {
        const rel = { cazimi: '日核', combust: '燃烧', underBeams: '日芒下', free: '自主' }[c.sunRelation];
        if (rel) cBits.push(rel);
        if (c.oriental && c.oriental !== '—') cBits.push(c.oriental);
        if (c.retrograde) cBits.push('逆');
        if (c.stationary) cBits.push('驻');
        if (c.voidOfCourse) cBits.push('空亡');
        if (c.sect === '得时') cBits.push('得时');
        else if (c.sect === '失时') cBits.push('失时');
      }
      const condStr = cBits.length ? `<span class="cond-tag">${cBits.join(' ')}</span>` : '';
      const acc = p.accidental ? p.accidental.score : null;
      const tot = p.totalScore != null ? p.totalScore : null;
      return `<tr><td class="gl">${p.glyph}</td><td>${p.zh}</td><td>${p.position.text}</td>` +
             `<td>${p.house}宫</td><td>${p.speed.toFixed(4)}°/d</td><td>${r || '—'}</td>` +
             `<td>${p.dignityScore}</td><td>${acc != null ? acc : '—'}</td><td>${tot != null ? tot : '—'}</td>` +
             `<td>${condStr}</td></tr>`;
    }).join('');

    // 宫位
    document.getElementById('out-houses').innerHTML = h.cusps.map((c, i) =>
      `<tr><td>${i + 1}宫</td><td>${c.text}</td></tr>`).join('');

    // 相位
    const pName = {};
    chart.planets.forEach(p => { pName[p.idx] = p.zh; });
    document.getElementById('out-aspects').innerHTML = chart.aspects.map(a =>
      `<tr><td>${pName[a.p1]}</td><td class="asp">${a.aspectZh}${a.glyph || ''}</td><td>${pName[a.p2]}</td>` +
      `<td>${a.orb.toFixed(2)}°</td><td>${a.applying ? '入' : '离'}</td></tr>`).join('');

    // 原始 JSON
    document.getElementById('out-json').textContent = JSON.stringify(chart, null, 1);
  }

  // ---- 规则解读（第4层）----
  // ---- 心理释义渲染（本命/组合盘复用；Astrolog MIT esoteric + Sabian + 相位释义）----
  function renderPsychicOut(out, res) {
    const SIGNS_ZH = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
    const pRows = res.planets.map(p =>
      `<div class="rule-hit"><span class="rid">${p.glyph} ${p.zh}</span><span class="via">${p.signZh} · ${p.house}宫</span>` +
      `<div class="rt">${p.esotericMeaning}</div></div>`).join('');
    const lRows = res.planetLessons.slice(0, 7).map(p =>
      `<div class="rule-hit"><span class="rid">${p.glyph}${p.zh} @ ${p.signZh}</span>` +
      `<div class="rt">功课：${p.lesson}<br>咒语：${p.mantra}<br>光：${p.light}<br>劳役：${p.labor}</div></div>`).join('');
    const hRows = res.houses.map(h =>
      `<div class="rule-hit"><span class="rid">${h.house}宫</span><span class="via">${h.tradition}</span>` +
      `<div class="rt">灵魂层：${h.soulLevel}<br>灵魂目的：${h.soulPurpose}</div></div>`).join('');
    const sabRows = (res.sabian || []).map(s =>
      `<div class="rule-hit"><span class="rid">${s.glyph} ${s.zh}</span><span class="via">${s.sign} ${s.degInSign}°</span>` +
      `<div class="rt">${s.symbol}</div></div>`).join('');
    const aspRows = (res.aspects || []).map(a =>
      `<div class="rule-hit"><span class="rid">${a.zh1} ${a.aspectZh} ${a.zh2}</span><span class="via">偏差 ${a.orbUsed.toFixed(2)}°</span>` +
      `<div class="rt">${a.modifier}${a.therefore ? '，' + a.therefore : ''}</div></div>`).join('');
    out.innerHTML =
      `<div class="rules-meta">现代心理(esoteric)释义 — 全英文原文（Astrolog MIT 文本源）</div>` +
      pRows + lRows + hRows +
      `<div class="rules-meta">Sabian 度数符号（360 度）</div>` + sabRows +
      `<div class="rules-meta">相位心理释义（修饰词按偏差/2.5′ 三档）</div>` + aspRows +
      `<div class="src">来源：${res.source}；现代神秘学文本，非古典判据，不作吉凶计分。</div>`;
  }

  async function fillRules(chart) {
    const rr = await window.astrology.rulesLookup(chart);
    if (!rr.ok) {
      document.getElementById('out-rules').innerHTML = `<div class="err">规则查询失败：${rr.error}</div>`;
      return;
    }
    const result = rr.result;
    const profiles = rr.profiles || [];
    const box = document.getElementById('out-rules');
    const parts = [];

  // ---- 行星档案摘要（子表）----
  function profileLine(p) {
    const prof = profiles.find(x => x.zh === p.zh);
    if (!prof || !prof.profile) return '';
    const bits = [];
    const e = prof.profile.elements[0];
    if (e) {
      const r = e.row;
      bits.push(`<div class="prow">要素：${[r.gender, r.sect, r.qualities, r.element, r.humour, r.fortune].filter(Boolean).join(' · ')}</div>`);
    }
    const fe = prof.profile.friendsEnemies[0];
    if (fe) bits.push(`<div class="prow">友：${fe.row.friends || '—'}　敌：${fe.row.enemies || '—'}</div>`);
    const yr = prof.profile.years.find(y => /行星年数/.test(y.table));
    if (yr) {
      const r = yr.row;
      bits.push(`<div class="prow">年数：最大${r.greatest || '?'} 大${r.greater || '?'} 中${r.mean || '?'} 小${r.least || '?'}</div>`);
    }
    const mo = prof.profile.motion[0];
    if (mo) bits.push(`<div class="prow">行度：日均${mo.row.avg_daily || '?'}°/d　逆行${mo.row.retrograde_days ? mo.row.retrograde_days + '日' : ''}</div>`);
    return bits.length ? `<div class="profile">${bits.join('')}</div>` : '';
  }

    parts.push(`<div class="rules-meta">规则库 ${result.meta.tagged} 条带标签 / 整盘命中 ${result.meta.totalHits} 条 · 全文检索覆盖全部 ${2888} 条（含无标签）</div>`);
    parts.push(`<button class="mini" id="rules-expand-all">全部展开</button>`);
    parts.push(`<input id="rule-search" type="text" placeholder="全文检索规则（如：火星 角宫 / 月 空亡 / 金星 十宫）…" style="width:100%;margin:4px 0">` +
      `<div id="rule-hits" class="prof-out">输入关键词检索全部规则条目。</div>`);
    const birthYear = chart.meta && chart.meta.input ? chart.meta.input.year : 1990;
    // 聚合总览（一键算完单盘可算域）
    const ovAge = Math.max(0, new Date().getFullYear() - birthYear);
    parts.push(`<details class="rule-block" data-domain="all" open><summary>总览（一键六域分类）</summary><div class="rule-body">` +
      `<div class="prof-row"><input id="ov-age" type="number" placeholder="年龄" value="${ovAge}" style="width:64px">` +
      `<button class="mini" id="ov-run">一键总览</button></div>` +
      `<div class="src">算完：A 本命 / B 推运（按年龄）/ D 择时 / F 世俗；C 卜卦需问题、E 合盘需第二盘（用对应块单算）</div>` +
      `<div id="ov-out" class="prof-out">点按钮后按结果目的分类显示。</div></div></details>`);
    // 心理释义（现代 esoteric 层 · Astrolog MIT 文本源）——放显眼位置（总览之后），默认展开
    parts.push(`<details class="rule-block" data-domain="natal" open><summary>心理释义（esoteric · Astrolog MIT 文本源）</summary><div class="rule-body">` +
      `<div class="prof-row"><button class="mini" id="psychic-run">展开心理释义</button></div>` +
      `<div id="psychic-out" class="prof-out">行星灵魂义 + 星座功课/咒语/光/劳役 + 十二宫灵魂义 + Sabian 度数符号 + 相位心理释义（现代神秘学文本，非古典判据，不作吉凶计分）。</div></div></details>`);
    // 推运（法达/小限 · B 域）块
    const defaultAge = Math.max(0, new Date().getFullYear() - birthYear);
    parts.push(`<details class="rule-block" data-domain="predictive"><summary>推运（法达/小限 · B 域）</summary><div class="rule-body">` +
      `<div class="prof-row">年龄 <input id="prof-age" type="number" min="0" value="${defaultAge}" style="width:64px"> ` +
      `行运时间 <input id="prof-tx-year" type="number" placeholder="年" style="width:64px">` +
      `<input id="prof-tx-month" type="number" placeholder="月" style="width:44px">` +
      `<input id="prof-tx-day" type="number" placeholder="日" style="width:44px">` +
      `<input id="prof-tx-hour" type="number" placeholder="时" style="width:44px">` +
      `<input id="prof-tx-min" type="number" placeholder="分" style="width:44px">` +
      `<button class="mini" id="prof-run">计算</button></div>` +
      `<div class="prof-row"><button class="mini" id="directions-run">主限向运（赤经投影）</button></div>` +
      `<div id="prof-out" class="prof-out">法达夜生版本固定 hand（Rob Hand 流通序）；Zoller 交点夹火土后为教学口径，两版昼生一致。小限按 Valens IV.11。主限向运：方向弧=赤经/斜升投影至四角（in mundo 简化），年化两档（1°=1年 Ptolemaic / 50.29"岁差速率）。</div>` +
      `<div class="src">来源：firdaria.json / profections.json</div></div></details>`);
    // 择时（Electional · D 域）块
    parts.push(`<details class="rule-block" data-domain="electional"><summary>择时（Electional · D 域）</summary><div class="rule-body">` +
      `<div class="prof-row"><button class="mini" id="election-run">用当前盘判宜忌</button> ` +
      `<label><input type="checkbox" id="election-natal" checked> 比对左侧本命盘（CE-163 本命协同）</label></div>` +
      `<span class="src">当前盘即候选时间天象盘（时间/地点在左侧输入）</span>` +
      `<div id="election-out" class="prof-out">点按钮后评分当前候选时间。</div>` +
      `<div class="src">来源：Bonatti4宫择时 BT-001~055 / Clavis 择时世俗卷（仅可计算判据计分，其余未计）</div></div></details>`);
    // 合盘（Synastry · E 域）块
    parts.push(`<details class="rule-block" data-domain="synastry"><summary>合盘（Synastry · E 域）</summary><div class="rule-body">` +
      `<div class="prof-row">B 盘时间 <input id="syn-y" type="number" placeholder="年" value="${new Date().getFullYear()}" style="width:64px">` +
      `<input id="syn-mo" type="number" placeholder="月" value="10" style="width:48px">` +
      `<input id="syn-d" type="number" placeholder="日" value="20" style="width:48px">` +
      `<input id="syn-h" type="number" placeholder="时" value="10" style="width:48px">` +
      `<input id="syn-mi" type="number" placeholder="分" value="0" style="width:48px">` +
      `<button class="mini" id="syn-run">比较</button> ` +
      `<button class="mini" id="dav-run">复合盘</button> ` +
      `<button class="mini" id="btn-davison-chart">画组合盘盘面</button> ` +
      `<button class="mini" id="btn-davison-psychic">组合盘心理释义</button></div>` +
      `<div class="src">比较=双盘相位/互落/光体判定；复合盘（Davison）=B 盘时间与左侧 A 盘出生时间取 UTC 中点、地点取地理中点，重排一张完整盘。画盘面=组合盘渲染到左侧星盘图；组合盘心理释义=esoteric 层对组合盘出全表（马克思盘文本层）</div>` +
      `<div id="syn-out" class="prof-out">点比较或复合盘后显示结果。</div>` +
      `<div class="src">来源：Tetrabiblos Book IV 财官婚旅卷 + 通用相位吉凶（工程口径）</div></div></details>`);
    // 世俗（Mundane · F 域）块
    parts.push(`<details class="rule-block" data-domain="mundane"><summary>世俗（Mundane · F 域）</summary><div class="rule-body">` +
      `<button class="mini" id="mundane-run">用当前盘判世运</button> ` +
      `<span class="src">当前盘即天象盘/蚀盘（时间/地点在左侧输入）</span>` +
      `<div id="mundane-out" class="prof-out">点按钮后判读当前天象。</div>` +
      `<div class="src">来源：Tetrabiblos Book II 世俗卷（45条）/ MashallahEclipses（42条）/ Clavis 世俗蚀兆卷（34条）</div></div></details>`);
    // 命主（Almuten）块
    const alm = chart.almuten;
    if (alm) {
      const am = alm.modern;
      const an = alm.ancient;
      const anStr = an ? `<div class="rule-hit"><span class="rid">古法</span><span class="via">${an.glyph} ${an.zh}</span>` +
        `<div class="rt">月座+水星座尊贵权 ${an.score}（${an.list.join(' / ')}）${an.note}</div>` +
        `<div class="src">Clavis CP3-307 古法（水星主灵、月主身）</div></div>` : '';
      parts.push(`<details class="rule-block" data-domain="natal"><summary>命主（Almuten）</summary><div class="rule-body">` +
        `<div class="rule-hit"><span class="rid">现代法</span><span class="via">${am.glyph} ${am.zh}</span>` +
        `<div class="rt">综合 ${am.total}（本然 ${am.essential} + 偶然 ${am.accidental}）${am.tieNote || ''}</div>` +
        `<div class="src">Clavis CP3-504（Coley 现代法）/ CP3-307</div></div>${anStr}` +
        `<div class="src">平局细则（CP3-307 尾句）：ASC落座本然尊贵 → 吉照升点 → 吉照升主 → 吉照日月；吉照=合/六/三工程口径</div>` +
        (chart.meta.ascNature ? `<div class="src">升点度数性质（映射H）：${chart.meta.ascNature.sign} ${chart.meta.ascNature.deg}° — 阴阳：${chart.meta.ascNature.阴阳}、明暗：${chart.meta.ascNature.明暗}（升度明=貌清、暗=肤晦、虚=心智浅；深陷/减损未数字化）</div>` : '') +
        (chart.meta.fortuneDegrees && chart.meta.fortuneDegrees.hits.length
          ? `<div class="src">增财度（Clavis 表用法#6）：${chart.meta.fortuneDegrees.hits.map(h => `${h.where}（${h.sign} ${h.deg}°）`).join('、')} — 主富/聚财</div>` : '') +
        `</div></details>`);
    }
    // Hyleg/Alcocoden 寿命块
    const hy = chart.hyleg;
    const ac = chart.alcocoden;
    if (hy) {
      const hyStr = hy.found
        ? `<div class="rule-hit"><span class="rid">Hyleg</span><span class="via">${hy.found.label}</span>` +
          `<div class="rt">黄经 ${hy.found.lon.toFixed(2)}° · ${hy.found.house}宫 · ${hy.found.qualify}</div>` +
          `<div class="src">候选跳过：${hy.skipped.join(' / ') || '无'}</div></div>`
        : `<div class="rule-hit"><span class="rid">Hyleg</span><span class="via">无合格候选</span>` +
          `<div class="rt">${hy.skipped.join(' / ')}</div></div>`;
      const acStr = ac && ac.alcocoden ? ac.alcocoden.map(a =>
        `<div class="rule-hit"><span class="rid">Alcocoden</span><span class="via">${a.glyph} ${a.zh}</span>` +
        `<div class="rt">hyleg 度数上本然尊贵 ${a.score} 分（${a.list}）</div></div>`).join('') : '';
      const fsList = (chart.meta.fixedStars || []).map(f =>
        `<div class="rt">${f.w > 0 ? '+' : ''}${f.w} ${f.f} <span class="src">(${f.s})</span></div>`).join('');
      const fsStr = fsList
        ? `<div class="rule-hit"><span class="rid">固定星证</span><span class="via">富/贫/暴死/健康</span>${fsList}` +
          `<div class="src">CP3-316 富证（日月近善性恒星）/ CP3-317 贫证（福点近凶暴恒星）/ CP3-385 暴死证 / CP3-326 健康反证｜"近"=±2°工程口径；凶暴恒星以 BO-100 表 T 性条目+Algol 代理</div></div>`
        : `<div class="src">固定星证：日月/福点/升主/8宫主均不在 BO-100 恒星 ±2° 内（未命中，如实）</div>`;
      const ed = chart.meta && chart.meta.eyeDisease;
      const edStr = ed && ed.hit
        ? `<div class="rule-hit"><span class="rid">云雾星眼疾</span><span class="via">${ed.level}</span>` +
          `<div class="rt">${ed.detail}</div>` +
          `<div class="src">BO-129 云雾星眼疾（月冲日+光体距云雾星黄经黄纬 10′内；双盲/失一目链按原文）｜对冲容许 8°、不远离 8° 工程口径</div></div>`
        : (ed ? `<div class="src">云雾星眼疾（BO-129）：${ed.detail}（未命中，如实）</div>` : '');
      const ls = chart.meta && chart.meta.longevitySigns;
      const lsStr = ls ? (ls.hits.length
        ? `<div class="rule-hit"><span class="rid">寿命五判据</span><span class="via">${ls.verdict}</span>` +
          ls.hits.map(h => `<div class="rt"><b>判据${h.n}</b> ${h.detail}</div>`).join('') +
          (ls.unscored.length ? `<div class="src">未计：${ls.unscored.join('；')}</div>` : '') +
          `<div class="src">${ls.source}｜克照/吉照=合刑冲±8°、焦伤=合日15°、包围=±15°、果宫=3/6/9/12、游走=无本然尊贵 工程口径</div></div>`
        : `<div class="src">寿命五判据（${ls.source}）：${ls.verdict}${ls.unscored.length ? '；未计：' + ls.unscored.join('；') : ''}</div>`)
        : '';
      const ph = chart.meta && chart.meta.parentHonor;
      const phStr = ph ? (ph.hit
        ? `<div class="rule-hit"><span class="rid">父母荣华</span><span class="via">显耀</span>` +
          `<div class="rt">${ph.detail}</div>` +
          `<div class="src">${ph.source}｜同宗吉星=木/金、环绕=同宫/次宫、东出=dif<0 工程口径</div></div>`
        : `<div class="src">父母荣华（${ph.source}）：${ph.detail}（未命中，如实）</div>`)
        : '';
      const pj = chart.meta && chart.meta.planetaryJoys;
      const pjStr = pj && pj.length
        ? `<div class="rule-hit"><span class="rid">行星喜乐</span><span class="via">${pj.length} 处命中</span>` +
          pj.map(j => `<div class="rt">${j.zh}：${j.detail}</div>`).join('') +
          `<div class="src">Bonatti146-映射-行星喜乐（宫位/昼夜）＋Dorotheus卷一-庙与喜乐表（星座）｜象限喜乐未计（象限映射未定义，如实）</div></div>`
        : '';
      const ap = chart.meta && chart.meta.arabicPoints;
      const apStr = ap ? (ap.points.length
        ? `<div class="rule-hit"><span class="rid">阿拉伯点全表</span><span class="via">${ap.points.length} 点可算 · 按宫位聚合</span>` +
          (() => {
            const groups = {};
            for (const l of ap.points) { const h = l.fallHouse || l.house || 0; (groups[h] = groups[h] || []).push(l.zh); }
            return Array.from({ length: 12 }, (_, i) => i + 1).filter(h => groups[h]).map(h => `<div class="rt">[${h}宫 ${groups[h].length}点] ${groups[h].join('、')}</div>`).join('');
          })() +
          `<div class="src">AlBiruni-映射-宫位点/其他点/卜卦点按落宫聚合（落宫=本盘 Placidus 宫位，0-based 修复后口径）｜${ap.skipped.length} 个未计：${ap.skipped.map(s => s.zh + '(' + s.reason + ')').join('；')}</div></div>`
        : `<div class="src">阿拉伯点全表：无可算点（${ap.skipped.length} 个未计）</div>`)
        : '';
      const sl = chart.meta && chart.meta.sevenLots;
      const slStr = sl ? `<div class="rt">七政点：${sl.map(s => `【${s.zh}】${Math.floor(((s.lon % 360) + 360) % 360 / 30) + 1}座${Math.floor(((s.lon % 360) + 360) % 360 % 30)}°`).join('　')}</div>` : '';
      parts.push(`<details class="rule-block" data-domain="natal"><summary>寿命（Hyleg/Alcocoden）</summary><div class="rule-body">` +
        `${hyStr}${acStr}${fsStr}${edStr}${lsStr}${phStr}${pjStr}${slStr}${apStr}` +
        `<div class="src">口径：astroak 现代综合（方法已声明；存世古籍无统一标准程序——Dorotheus/Ptolemy/Valens/Paulus 各有不同，见 hyleg_alcocoden.json 核心事实）｜产前朔望候选未实现｜${ac && ac.note ? ac.note : ''}</div></div></details>`);
    }
    // 行星条件（偶然状态）块
    const conds = chart.conditions || [];
    if (conds.length) {
      const cRows = conds.filter(c => !c.modern).map(c => {
        const pl = chart.planets.find(x => x.idx === c.idx);
        const acc = pl && pl.accidental ? pl.accidental : null;
        const accStr = acc ? `<div class="src">偶然尊贵 ${acc.score > 0 ? '+' : ''}${acc.score}（CE-042/043）　${acc.notes.join(' ｜ ')}</div>` : '';
        return `<div class="rule-hit"><span class="rid">${c.glyph}</span><span class="via">${c.zh}</span>` +
        `<div class="rt">${c.detail.map(dd => '· ' + dd).join('<br>')}</div>${accStr}` +
        `<div class="src">判定源：planetary_conditions.json（教学简化阈值+版本警示）/ Dorotheus 卷三东西星判定表 / Bonatti 逆行注 / Clavis 空亡</div></div>`;
      }).join('');
      parts.push(`<details class="rule-block" data-domain="natal"><summary>行星条件（偶然状态 · 七政）</summary><div class="rule-body">${cRows}</div></details>`);
    }
    for (const p of result.planets) {
      if (p.hitCount === 0) {
        parts.push(`<details class="rule-block" data-domain="natal"><summary>${p.glyph} ${p.zh} ${p.position} 落${p.house}宫（无规则命中）</summary></details>`);
        continue;
      }
      const rows = p.hits.map(h => {
        const cond = h.condition ? `<div class="cond">条件：${h.condition}</div>` : '';
        const src = h.source.replace(/规则库-|\.xlsx/g, '');
        return `<div class="rule-hit"><span class="rid">${h.rule_id}</span><span class="via">${h.via}</span>` +
               `<div class="rt">${h.translation}</div>${cond}<div class="src">${src}${h.book ? ' · ' + h.book : ''}</div></div>`;
      }).join('');
      const tc = p.termsCompare;
      const tcStr = tc && tc.valens ? `<div class="cond">界对照：${p.position.text} 内 ${tc.degInSign}° — 埃及界=${tc.egyptian ? tc.egyptian.planet : '?'} / Valens=${tc.valens.planet}${tc.match ? '（一致）' : '（差异，如实标注）'}</div>` : '';
      parts.push(`<details class="rule-block" data-domain="natal"><summary>${p.glyph} ${p.zh} ${p.position} 落${p.house}宫 · ${p.hitCount}条</summary><div class="rule-body">${profileLine(p)}${tcStr}${rows}</div></details>`);
    }
    box.innerHTML = parts.join('');
    const btn = document.getElementById('rules-expand-all');
    if (btn) btn.onclick = () => {
      const all = [...box.querySelectorAll('details.rule-block')];
      const anyClosed = all.some(d => !d.open);
      all.forEach(d => { d.open = anyClosed; });
      btn.textContent = anyClosed ? '全部收起' : '全部展开';
    };
  }

  async function compute() {
    const btn = document.getElementById('btn-compute');
    btn.disabled = true;
    try {
      const input = collectInput();
      if (input.type === 'davison') {
        // 组合盘盘型：davisonAnalyze（中点盘）→ 画盘面 + 全局切换
        const dr = await window.astrology.davisonAnalyze({ inputA: input.inputA, inputB: input.inputB });
        if (!dr.ok) { throw new Error(dr.error); }
        const c = dr.chart;
        c.meta.type = 'davison';
        window.renderChartView(document.getElementById('chart-box'), c);
        window.__lastChart = c;
        fillOutputs(c);
        fillRules(c);
        applyDomain(DOMAIN_CUR);
        btn.textContent = '计算';
        return;
      }
      const res = await window.astrology.computeChart(input);
      if (!res.ok) { throw new Error(res.error); }
      window.renderChartView(document.getElementById('chart-box'), res.chart);
      window.__lastChart = res.chart; // 供推运/卜卦复用当前盘
      fillOutputs(res.chart);
      fillRules(res.chart);
      applyDomain(DOMAIN_CUR); // 切盘重建后重应用当前域筛选
      btn.textContent = '计算';
    } catch (e) {
      document.getElementById('chart-box').innerHTML =
        `<div class="err">计算失败：${e.message}</div>`;
      btn.textContent = '重试';
    } finally {
      btn.disabled = false;
    }
  }

  // ---- 结果目的分类（按 SPEC-结果目的分类.md）：六域真筛选 ----
  const DOMAIN_COLS = {
    natal: ['col-angles', 'col-planets', 'col-houses', 'col-aspects', 'col-json'],
    predictive: [],
    horary: ['col-horary'],
    electional: ['col-hours'],
    synastry: ['col-marriage'],
    mundane: [],
  };
  let DOMAIN_CUR = 'all';
  function applyDomain(d) {
    DOMAIN_CUR = d;
    // 静态滑块显隐
    Object.entries(DOMAIN_COLS).forEach(([dom, ids]) => {
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = (d === 'all' || dom === d) ? '' : 'none';
        if (d === 'all' || dom === d) el.open = true;
      });
    });
    // 动态规则块显隐（data-domain；all 块任何域都显示）
    document.querySelectorAll('details.rule-block').forEach(dd => {
      const dom = dd.dataset.domain || 'all';
      dd.style.display = (d === 'all' || dom === 'all' || dom === d) ? '' : 'none';
    });
    // 卜卦专属列：展开/收拢
    const horaryCol = document.getElementById('col-horary');
    if (horaryCol) horaryCol.open = (d === 'horary');
  }
  function renderDomainTabs() {
    const bar = document.getElementById('domain-tabs');
    const btns = [...bar.querySelectorAll('.domain-tab')];
    btns.forEach(b => {
      b.onclick = () => {
        btns.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        applyDomain(b.dataset.domain);
      };
    });
    applyDomain('all');
  }

  // ---- 行星时（D 域 CE-155）----
  async function askHours() {
    const btn = document.getElementById('btn-hours');
    btn.disabled = true;
    const out = document.getElementById('out-hours');
    out.innerHTML = '<div class="muted">计算行星时…</div>';
    try {
      const input = collectInput();
      const res = await window.astrology.planetaryHour({
        year: input.year, month: input.month, day: input.day,
        hour: input.hour, minute: input.minute,
        tzOffsetHours: input.tzOffsetHours, lat: input.lat, lon: input.lon,
      });
      if (!res.ok) throw new Error(res.error);
      renderHours(res.result);
    } catch (e) {
      out.innerHTML = `<div class="err">行星时计算失败：${e.message}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  function renderHours(h) {
    const out = document.getElementById('out-hours');
    const parts = [];
    parts.push(`<div class="verdict-card">`);
    parts.push(`<div class="v-main">${h.weekdayZh}·${h.dayLord}星日 — 第 ${h.hourIndex1} 行星时：<b>${h.hourLord}星</b>${h.isDay ? '（昼）' : '（夜）'}</div>`);
    parts.push(`<div class="v-score">${h.note} · 日出 ${h.riseCST} · 日落 ${h.setCST} · 次日日出 ${h.nextRiseCST}</div>`);
    parts.push(`<div class="v-time">昼序列（1-12）：${h.seq.join(' ')}</div>`);
    parts.push(`<div class="v-time"><span class="src">${h.source || ''} · CE-155</span></div>`);
    parts.push(`<div class="v-time muted">无择时意图匹配判据原文（如"求财宜金/木时"），仅显示时主星——判据原文未计，不硬造。</div>`);
    parts.push(`</div>`);
    out.innerHTML = parts.join('');
  }

  // ---- 卜卦问答 ----
  async function askHorary() {
    const btn = document.getElementById('btn-horary');
    btn.disabled = true;
    const out = document.getElementById('out-horary');
    out.innerHTML = '<div class="muted">排盘判卦中…</div>';
    try {
      const input = collectInput();
      input.type = 'transit'; // 卜卦以问事时刻天象盘起卦
      const res = await window.astrology.computeChart(input);
      if (!res.ok) throw new Error(res.error);
      const qtype = document.getElementById('horary-type').value;
      const hr = await window.astrology.horaryAnalyze({ chart: res.chart, questionType: qtype });
      if (!hr.ok) throw new Error(hr.error);
      renderHorary(hr.result, res.chart);
    } catch (e) {
      out.innerHTML = `<div class="err">问卦失败：${e.message}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  function renderHorary(r, chart) {
    const out = document.getElementById('out-horary');
    const parts = [];
    const cls = r.verdict === '倾向成' ? 'v-ok' : (r.verdict === '倾向败' ? 'v-bad' : '');
    parts.push(`<div class="verdict-card">`);
    parts.push(`<div class="v-main ${cls}">${r.verdict}（${r.score}）</div>`);
    parts.push(`<div class="v-score">${r.questionType} · 问卦时刻 JD ${r.chartTime.toFixed(4)}</div>`);
    if (r.timeHint) parts.push(`<div class="v-time">⏱ ${r.timeHint}</div>`);
    const sp = r.special || {};
    const spBits = [];
    if (sp.locationHint) spBits.push(`<div class="v-special"><b>藏处</b> ${sp.locationHint}</div>`);
    if (sp.suspectProfile) spBits.push(`<div class="v-special"><b>贼貌</b> ${sp.suspectProfile}</div>`);
    if (sp.distanceHint) spBits.push(`<div class="v-special"><b>距离</b> ${sp.distanceHint}</div>`);
    if (sp.tailWarning) spBits.push(`<div class="v-special"><b>龙尾</b> ${sp.tailWarning}</div>`);
    if (sp.recoverHint) spBits.push(`<div class="v-special"><b>寻回</b> ${sp.recoverHint}</div>`);
    if (sp.charge) {
      spBits.push(`<div class="v-special"><b>被控四判</b> ${sp.charge.verdict}（${sp.charge.score}）</div>`);
      for (const f of sp.charge.factors) spBits.push(`<div class="v-special">${f.factor} — ${f.detail} <span class="src">${f.source}</span></div>`);
    }
    if (sp.question) {
      spBits.push(`<div class="v-special"><b>${sp.question.qtype}问判</b> ${sp.question.verdict}（${sp.question.score}）</div>`);
      for (const f of sp.question.factors) spBits.push(`<div class="v-special">${f.factor} — ${f.detail} <span class="src">${f.source}</span></div>`);
    }
    if (spBits.length) parts.push(`<div class="v-special">${spBits.join('')}</div>`);
    // 阻碍扫描（第二版）
    const obs = r.obstructions || {};
    if ((obs.moon && obs.moon.length) || (obs.significators && obs.significators.length)) {
      parts.push(`<div class="v-time">阻碍（Bonatti 月亮17/行星10）：`);
      for (const o of obs.moon || []) parts.push(`<span class="src">月#${o.n} ${o.name}</span>；`);
      for (const s of obs.significators || []) for (const o of s.hits) parts.push(`<span class="src">${s.planet}#${o.n} ${o.name}</span>；`);
      parts.push(`</div>`);
    }
    parts.push(`<div class="v-factors">`);
    for (const f of r.keyFactors) {
      parts.push(`<div class="v-fact"><span class="w">${f.weight > 0 ? '+' : ''}${f.weight}</span>${f.factor} — ${f.detail} <span class="src">(${f.source})</span></div>`);
    }
    parts.push(`</div></div>`);
    out.innerHTML = parts.join('');
  }

  // ---- 婚姻判读（E 域婚卷）----
  async function askMarriage(withPartner) {
    const btn = withPartner ? document.getElementById('btn-marriage-partner') : document.getElementById('btn-marriage');
    btn.disabled = true;
    const out = document.getElementById('out-marriage');
    out.innerHTML = '<div class="muted">婚姻判读中…</div>';
    try {
      if (!window.__lastChart) { out.innerHTML = '<div class="err">尚无星盘，先点计算</div>'; return; }
      let inputB = null;
      if (withPartner) {
        inputB = collectInput();
        inputB.type = 'natal';
        inputB.year = 1992; inputB.month = 3; inputB.day = 8; inputB.hour = 8; inputB.minute = 0;
        inputB.lat = 31.2304; inputB.lon = 121.4737; // 伴侣盘：固定 demo（上海 1992-03-08），可后续改为输入
      }
      const mr = await window.astrology.marriageAnalyze({ chart: window.__lastChart, inputB });
      if (!mr.ok) throw new Error(mr.error);
      renderMarriage(mr.result);
    } catch (e) {
      out.innerHTML = `<div class="err">判婚失败：${e.message}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  function renderMarriage(r) {
    const out = document.getElementById('out-marriage');
    const parts = [];
    const cls = r.verdict === '婚向利好' ? 'v-ok' : (r.verdict === '婚向不利' ? 'v-bad' : '');
    parts.push(`<div class="verdict-card">`);
    parts.push(`<div class="v-main ${cls}">${r.verdict}（${r.score}）</div>`);
    // 婚点
    const p = r.points || {};
    const pBits = [];
    const fmt = (v) => v == null ? '—' : `${Math.round(v * 10) / 10}°`;
    const pMap = [['婚点（男）', p.marriageMale], ['婚点（女）', p.marriageFemale], ['幸福婚点', p.happyMarriage],
      ['昼夜婚点', p.dayNightMarriage], ['子女点', p.children], ['子女推运点', p.childrenProg],
      ['男儿点', p.son], ['女儿点', p.daughter], ['妻数', p.wivesCount]];
    parts.push(`<div class="v-factors"><div class="v-time">婚子女点数表（Dorotheus II）：</div>`);
    for (const [name, v] of pMap) {
      parts.push(`<div class="v-fact"><span class="w">·</span>${name} = ${typeof v === 'number' ? fmt(v) : (v == null ? '—' : v)}</div>`);
    }
    // 判读
    for (const rd of r.readings || []) {
      parts.push(`<div class="v-fact"><span class="w">•</span>${rd.judgment} <span class="src">(${rd.source})</span></div>`);
    }
    // 未计
    if (r.unscored && r.unscored.length) {
      parts.push(`<div class="v-time">未计（如实）：</div>`);
      for (const u of r.unscored) parts.push(`<div class="v-fact"><span class="w">?</span>${u}</div>`);
    }
    // 行运应期（DOR2-10）
    if (r.timing) {
      const t = r.timing;
      parts.push(`<div class="v-time">行运应期（DOR2-10）：<b>${t.verdict}</b>（行运木星 ${typeof t.tJup === 'number' ? Math.round(t.tJup * 10) / 10 + '°' : '—'} / 土星 ${typeof t.tSat === 'number' ? Math.round(t.tSat * 10) / 10 + '°' : '—'}）</div>`);
      for (const x of t.triggers || []) parts.push(`<div class="v-fact"><span class="w">+</span>${x}</div>`);
      for (const x of t.blocked || []) parts.push(`<div class="v-fact"><span class="w">−</span>${x}</div>`);
      for (const u of t.unscored || []) parts.push(`<div class="v-fact"><span class="w">?</span>${u}</div>`);
    }
    parts.push(`</div></div>`);
    out.innerHTML = parts.join('');
  }

  // ---- 行运应期查询（DOR2-10）：婚姻块输入日期 → 行运盘比对 ----
  async function askMarriageTiming() {
    const btn = document.getElementById('btn-marriage-timing');
    const out = document.getElementById('out-marriage');
    if (!window.__lastChart) { out.innerHTML = '<div class="err">尚无星盘，先点计算</div>'; return; }
    btn.disabled = true;
    out.innerHTML = '<div class="muted">行运应期计算中…</div>';
    try {
      const ty = parseInt(document.getElementById('mt-year').value, 10);
      const tm = parseInt(document.getElementById('mt-month').value, 10);
      const td = parseInt(document.getElementById('mt-day').value, 10);
      const th = parseInt(document.getElementById('mt-hour').value, 10);
      if (!ty || !tm || !td) { out.innerHTML = '<div class="err">请填行运日期（年月日必填）</div>'; return; }
      const mr = await window.astrology.marriageAnalyze({
        chart: window.__lastChart,
        transitInput: { year: ty, month: tm, day: td, hour: (isNaN(th) ? 12 : th), minute: 0, tzOffsetHours: 8, lat: window.__lastInput ? window.__lastInput.lat : 39.9042, lon: window.__lastInput ? window.__lastInput.lon : 116.4074, houseSystem: 'P' },
      });
      if (!mr.ok) throw new Error(mr.error);
      renderMarriage(mr.result);
    } catch (e) {
      out.innerHTML = `<div class="err">行运应期失败：${e.message}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  // ---- 初始化 ----
  document.addEventListener('DOMContentLoaded', () => {
    renderTypeTabs();
    renderDomainTabs();
    document.getElementById('btn-compute').onclick = compute;
    document.getElementById('btn-horary').onclick = askHorary;
    document.getElementById('btn-hours').onclick = askHours;
    document.getElementById('btn-marriage').onclick = () => askMarriage(false);
    document.getElementById('btn-marriage-partner').onclick = () => askMarriage(true);
    const mtBtn = document.getElementById('btn-marriage-timing');
    if (mtBtn) mtBtn.onclick = askMarriageTiming;
    // 推运计算（委托：fillRules 重建 DOM 后仍生效）
    document.addEventListener('click', async (e) => {
      if (e.target && e.target.id === 'prof-run') {
        const age = parseInt(document.getElementById('prof-age').value, 10);
        const out = document.getElementById('prof-out');
        if (!window.__lastChart) { out.innerHTML = '<div class="err">尚无星盘，先点计算</div>'; return; }
        out.innerHTML = '计算中…';
        const ty = document.getElementById('prof-tx-year');
        let transitInput = null;
        if (ty && ty.value) {
          const last = window.__lastChart.meta && window.__lastChart.meta.input;
          transitInput = {
            year: +ty.value,
            month: +document.getElementById('prof-tx-month').value || 6,
            day: +document.getElementById('prof-tx-day').value || 15,
            hour: +document.getElementById('prof-tx-hour').value || 12,
            minute: +document.getElementById('prof-tx-min').value || 0,
            tzOffsetHours: (last && last.tzOffsetHours) || 8,
            lat: (last && last.lat) || 0, lon: (last && last.lon) || 0,
            houseSystem: 'P',
          };
        }
        const pr = await window.astrology.progressAnalyze({ chart: window.__lastChart, age: isNaN(age) ? 0 : age, transitInput });
        if (!pr.ok) { out.innerHTML = `<div class="err">${pr.error}</div>`; return; }
        const f = pr.result.firdaria, pf = pr.result.profection;
        const subHead = f.sub.length
          ? `<div class="rt">副周期（每段 ${f.sub[0].len.toFixed(2)} 年）：${f.sub.map(s => s.zh).join(' → ')}</div>
             <div class="src">当前副段：${f.activeSub ? `${f.activeSub.zh}（${f.activeSub.start.toFixed(1)}–${f.activeSub.end.toFixed(1)} 岁，剩 ${f.activeSub.remainingYears.toFixed(2)} 年）` : '—'}</div>`
          : `<div class="rt">南北交点主周期，不细分</div>`;
        out.innerHTML =
          `<div class="rule-hit"><span class="rid">法达</span><span class="via">主周期 ${f.main.glyph || ''} ${f.main.zh}</span>` +
          `<div class="rt">${f.main.start}–${f.main.end} 岁（${f.main.len} 年）· ${f.version} 版本</div>${subHead}</div>` +
          `<div class="rule-hit"><span class="rid">小限</span><span class="via">${pf.lordGlyph || ''} ${pf.lordZh || '—'}</span>` +
          `<div class="rt">${pf.house} 宫 · ${pf.signZh}（${pf.age} 岁，余 ${pf.age % 12}）· 年主星=${pf.lordZh}${pf.topic ? ` · 年度主题：${pf.topic}` : ''}${pf.lordState ? ` · 本命状态=${pf.lordState.kind}（${pf.lordState.note}）` : ''}</div>` +
          `${(pr.result.transitHits || []).length ? `<div class="rt">行运触发：${pr.result.transitHits.map(h => `${h.f}（${h.w > 0 ? '吉' : h.w < 0 ? '凶' : '—'}）`).join('；')}</div>` : ''}` +
          `<div class="src">${pf.formula}</div></div>` +
          `<div class="src">${f.note}</div>`;
      } else if (e.target && e.target.id === 'directions-run') {
        const out = document.getElementById('prof-out');
        if (!window.__lastChart) { out.innerHTML = '<div class="err">尚无星盘，先点计算</div>'; return; }
        out.innerHTML = '计算中…';
        const r = await window.astrology.directionsAnalyze({ chart: window.__lastChart });
        if (!r.ok) { out.innerHTML = `<div class="err">${r.error}</div>`; return; }
        const dirs = r.result.directions.filter(d => d.to); // 方向合相对
        const angleRows = dirs.slice(0, 60).map(d =>
          `<div class="rule-hit"><span class="rid">${d.from}→${d.to}</span><span class="via">${d.type.toUpperCase()} 弧 ${d.arc.toFixed(2)}°</span>` +
          `<div class="rt">应期：${d.yearP.toFixed(1)} 岁（1°=1年） / ${d.yearPrec.toFixed(1)} 岁（岁差速率）</div></div>`).join('');
        const ang = r.result.angles;
        out.innerHTML =
          `<div class="rules-meta">主限向运：方向合相（行星方向推进至本命行星）— 四角赤经/斜升：MC RA=${ang.raMC.toFixed(2)}° · ASC OA=${ang.oaAsc.toFixed(2)}° · DSC OA=${ang.oaDc.toFixed(2)}°</div>` +
          angleRows +
          `<div class="src">口径：${r.result.method}</div>`;
      } else if (e.target && e.target.id === 'psychic-run') {
        const out = document.getElementById('psychic-out');
        if (!window.__lastChart) { out.innerHTML = '<div class="err">尚无星盘，先点计算</div>'; return; }
        out.innerHTML = '计算中…';
        const r = await window.astrology.psychicAnalyze({ chart: window.__lastChart });
        if (!r.ok) { out.innerHTML = `<div class="err">${r.error}</div>`; return; }
        renderPsychicOut(out, r.result);
      }
    });
    // 择时（D 域）
    document.addEventListener('click', async (e) => {
      if (e.target && e.target.id === 'election-run') {
        const out = document.getElementById('election-out');
        if (!window.__lastChart) { out.innerHTML = '<div class="err">尚无星盘，先计算</div>'; return; }
        out.innerHTML = '计算中…';
        const withNatal = document.getElementById('election-natal') && document.getElementById('election-natal').checked;
        const payload = withNatal ? { chart: window.__lastChart, natalInput: window.__lastChart.meta.input } : { chart: window.__lastChart };
        const r = await window.astrology.electionAnalyze(payload);
        if (!r.ok) { out.innerHTML = `<div class="err">${r.error}</div>`; return; }
        const res = r.result;
        const syn = res.natalSynergy ? `<div class="src">本命协同：协 ${res.natalSynergy.co} / 抗 ${res.natalSynergy.conflict}（CE-163 以本命为根基）</div>` : '';
        out.innerHTML =
          `<div class="rule-hit"><span class="rid">${res.verdict}</span><span class="via">评分 ${res.score > 0 ? '+' : ''}${res.score}</span>` +
          `${syn}` +
          `<div class="rt">${res.factors.map(f => `<div>${f.w > 0 ? '+' : ''}${f.w} ${f.f} <span class="src">(${f.s})</span></div>`).join('')}</div>` +
          `<div class="src">未计：${res.unscored.join('；')}</div></div>`;
      }
    });
    // 合盘（E 域）：B 盘时间 → 比较
    document.addEventListener('click', async (e) => {
      if (e.target && e.target.id === 'syn-run') {
        const out = document.getElementById('syn-out');
        if (!window.__lastChart) { out.innerHTML = '<div class="err">尚无 A 盘，先计算</div>'; return; }
        const input = collectInput();
        inputB = {
          year: parseInt(document.getElementById('syn-y').value, 10),
          month: parseInt(document.getElementById('syn-mo').value, 10),
          day: parseInt(document.getElementById('syn-d').value, 10),
          hour: parseInt(document.getElementById('syn-h').value, 10),
          minute: parseInt(document.getElementById('syn-mi').value, 10),
          tzOffsetHours: input.tzOffsetHours, lat: input.lat, lon: input.lon,
          houseSystem: input.houseSystem, orbSet: input.orbSet,
        };
        out.innerHTML = '计算中…';
        const r = await window.astrology.synastryAnalyze({ chartA: window.__lastChart, inputB });
        if (!r.ok) { out.innerHTML = `<div class="err">${r.error}</div>`; return; }
        const res = r.result;
        const aspRows = res.aspects.map(f =>
          `<div>${f.w > 0 ? '+' : ''}${f.w} ${f.a}${f.aspect}${f.b} <span class="src">(${f.tag})</span></div>`).join('');
        const mutRows = res.mutual.map(m =>
          `<div class="src">${m.dir}：焦点宫 ${m.focus.map(x => `${x[0]}宫×${x[1]}`).join('、')}</div>`).join('');
        const ascRows = res.ascHits.map(h => `${h.who}${h.aspect}升点`).join('、') || '无';
        const recepRows = (res.receptions || []).slice(0, 12).map(r =>
          `<div>${r.a}·${r.b} → ${r.kind}（${r.detail}）</div>`).join('') +
          ((res.receptions || []).length > 12 ? `<div class="src">…共 ${res.receptions.length} 组</div>` : '') || '无';
        const midRows = (res.composite && res.composite.midpoints || []).map(m => `${m.zh}${m.sign}`).join('、');
        const midAspRows = (res.composite && res.composite.aspects || []).map(a => `${a.a}${a.aspect}${a.b}`).join('、');
        out.innerHTML =
          `<div class="rule-hit"><span class="rid">${res.verdict}</span><span class="via">评分 ${res.score > 0 ? '+' : ''}${res.score} · 相位 ${res.aspects.length} 组</span>` +
          `<div class="rt">光体相位：${res.lightJudgment}<br>${aspRows}</div>` +
          `<div class="src">${mutRows}升点互照：${ascRows}</div>` +
          `<div class="src">接纳/互溶：${recepRows}</div>` +
          `<div class="src">组合盘中点：${midRows}<br>中点相位：${midAspRows || '无'}</div>` +
          `<div class="src">未计：${res.unscored.join('；')}</div></div>`;
      }
    });
    // 复合盘（Davison）/组合推运：B 盘时间 + A 盘出生输入 → 中点重排 / 中点次限推运
    document.addEventListener('click', async (e) => {
      const tid = e.target && e.target.id;
      if (tid !== 'dav-run' && tid !== 'btn-davison' && tid !== 'btn-davison-progressed' && tid !== 'btn-davison-detail' && tid !== 'btn-davison-chart' && tid !== 'btn-davison-psychic') return;
      const out = document.getElementById('syn-out');
      if (!window.__lastChart || !window.__lastChart.meta || !window.__lastChart.meta.input) { out.innerHTML = '<div class="err">尚无 A 盘出生输入，先计算</div>'; return; }
      const inputB = {
        year: parseInt(document.getElementById('syn-y').value, 10),
        month: parseInt(document.getElementById('syn-mo').value, 10),
        day: parseInt(document.getElementById('syn-d').value, 10),
        hour: parseInt(document.getElementById('syn-h').value, 10),
        minute: parseInt(document.getElementById('syn-mi').value, 10),
        tzOffsetHours: 8, lat: 39.9042, lon: 116.4074,
        houseSystem: 'P', orbSet: 'modern',
      };
      out.innerHTML = '计算中…';
      const r = tid === 'btn-davison-progressed'
        ? await window.astrology.davisonProgressed({ inputA: window.__lastChart.meta.input, inputB, years: parseInt(document.getElementById('dav-years').value, 10) || 1 })
        : await window.astrology.davisonAnalyze({ inputA: window.__lastChart.meta.input, inputB });
      if (!r.ok) { out.innerHTML = `<div class="err">${r.error}</div>`; return; }
      const c = r.chart;
      const asc = c.houses.angles.asc;
      const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
      if (tid === 'btn-davison-detail') {
        // 组合盘全明细（马克思盘算法层视图：行星落座/落宫全表）
        const rows = c.planets.map(p =>
          `${p.glyph}${p.zh} ${p.position}（${SIGNS[Math.floor(p.lon / 30)]} · ${p.house}宫${p.retrograde ? ' · 逆行' : ''}）`).join('<br>');
        out.innerHTML =
          `<div class="rules-meta">组合盘全明细（10 星）— 算法层（马克思盘基础数据）</div>` +
          `<div class="rule-hit"><span class="rid">组合盘（Davison）</span><span class="via">升 ${asc.toFixed(1)}° ${SIGNS[Math.floor(asc / 30)]}</span>` +
          `<div class="rt">中点时刻（UTC）${c.meta.input.year}-${String(c.meta.input.month).padStart(2, '0')}-${String(c.meta.input.day).padStart(2, '0')} ${c.meta.input.hour}:${String(c.meta.input.minute || 0).padStart(2, '0')}<br>${rows}</div>` +
          `<div class="src">马克思盘文本层=点"组合盘心理释义"按钮（esoteric 全表）。</div></div>`;
        return;
      }
      if (tid === 'btn-davison-chart') {
        // 组合盘盘面渲染到左侧星盘图 + 全局盘引用切换（供心理释义等复用）
        window.renderChartView(document.getElementById('chart-box'), c);
        window.__lastChart = c;
        out.innerHTML =
          `<div class="rule-hit"><span class="rid">组合盘盘面已渲染到左侧</span><span class="via">升 ${asc.toFixed(1)}° ${SIGNS[Math.floor(asc / 30)]}</span>` +
          `<div class="rt">中点时刻（UTC）${c.meta && c.meta.input ? `${c.meta.input.year}-${String(c.meta.input.month).padStart(2, '0')}-${String(c.meta.input.day).padStart(2, '0')} ${c.meta.input.hour}:${String(c.meta.input.minute || 0).padStart(2, '0')}` : '—'}<br>` +
          `全局盘已切换为组合盘：心理释义/规则查询等右侧块现在作用于组合盘。重新点左上"计算"可切回本命盘。</div>` +
          `<div class="src">地点=双地经纬度中点（跨 180° 经线未特殊处理）；宫位按中点盘重排（Placidus）</div></div>`;
        return;
      }
      if (tid === 'btn-davison-psychic') {
        // 马克思盘文本层：esoteric 全表（Astrolog MIT）
        const pr = await window.astrology.psychicAnalyze({ chart: c });
        if (!pr.ok) { out.innerHTML = `<div class="err">${pr.error}</div>`; return; }
        out.innerHTML = '<div class="rules-meta">组合盘心理释义（马克思盘 esoteric 文本层）</div>';
        renderPsychicOut(out, pr.result);
        return;
      }
      const rows = c.planets.filter(p => p.idx <= 6).map(p =>
        `${p.glyph}${p.zh} ${p.position}（${SIGNS[Math.floor(p.lon / 30)]} ${p.house}宫）`).join('<br>');
      out.innerHTML =
        `<div class="rule-hit"><span class="rid">${tid === 'btn-davison-progressed' ? '组合推运（Davison 次限）' : '复合盘（Davison）'}</span><span class="via">升 ${asc.toFixed(1)}° ${SIGNS[Math.floor(asc / 30)]}</span>` +
        `<div class="rt">中点时刻（UTC）${c.meta && c.meta.input ? `${c.meta.input.year}-${String(c.meta.input.month).padStart(2, '0')}-${String(c.meta.input.day).padStart(2, '0')} ${c.meta.input.hour}:${String(c.meta.input.minute || 0).padStart(2, '0')}` : '—'}<br>${rows}</div>` +
        `<div class="src">${tid === 'btn-davison-progressed' ? '组合盘时刻按次限法（1天=1年）推运；' : ''}地点=双地经纬度中点（跨 180° 经线未特殊处理）；宫位按中点盘重排（Placidus）</div></div>`;
    });
    // 世俗（F 域）：当前盘 → 世运判读
    document.addEventListener('click', async (e) => {
      if (e.target && e.target.id === 'mundane-run') {
        const out = document.getElementById('mundane-out');
        if (!window.__lastChart) { out.innerHTML = '<div class="err">尚无星盘，先计算</div>'; return; }
        out.innerHTML = '计算中…';
        const r = await window.astrology.mundaneAnalyze(window.__lastChart);
        if (!r.ok) { out.innerHTML = `<div class="err">${r.error}</div>`; return; }
        const res = r.result;
        let virtHtml = '';
        if (res.virtue) {
          const v = res.virtue;
          virtHtml = `<div class="src">德性交付（BO-056，征象星=${v.sig}）：${v.deliveries && v.deliveries.length ? v.deliveries.map(d =>
            `${d.acc}（${d.aspect}，${d.orient}，距日${d.distSun.toFixed(1)}°）→ <b>${d.verdict}</b>：${d.note}`).join('<br>') : (v.note || '无交付')}` +
            (v.unscored && v.unscored.length ? `<br>未计：${v.unscored.join('；')}` : '') + '</div>';
        }
        out.innerHTML =
          `<div class="rule-hit"><span class="rid">${res.verdict}</span><span class="via">评分 ${res.score > 0 ? '+' : ''}${res.score}</span>` +
          `<div class="rt">${res.eclipse}${res.lord ? `<br>年主：${res.lord.zh}（本然 ${res.lord.dignity}，综合 ${res.lord.total}）` : ''}</div>` +
          `${virtHtml}` +
          `<div class="src">${res.factors.map(f => `${f.w > 0 ? '+' : ''}${f.w} ${f.f} <span class="src">(${f.s})</span>`).join('<br>')}</div>` +
          `<div class="src">未计：${res.unscored.join('；')}</div></div>`;
      }
    });
    // 规则全文检索：input 防抖 300ms；命中词高亮 + 按卷分组
    document.addEventListener('input', async (e) => {
      if (e.target && e.target.id === 'rule-search') {
        const q = e.target.value.trim();
        const box = document.getElementById('rule-hits');
        if (!q) { box.innerHTML = '输入关键词检索全部规则条目。'; return; }
        const r = await window.astrology.rulesSearch(q);
        if (!r.ok) { box.innerHTML = `<div class="err">${r.error}</div>`; return; }
        const terms = q.split(/[\s,，、]+/).filter(Boolean);
        const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hl = (t) => String(t || '').replace(new RegExp(terms.map(esc).join('|'), 'ig'), (m) => '<mark>' + m + '</mark>');
        const groups = {};
        for (const h of r.result.hits) { (groups[h.source] = groups[h.source] || []).push(h); }
        const rows = Object.entries(groups).map(([src, arr]) =>
          `<div class="rule-hit"><span class="rid">${hl(src)}（${arr.length} 条）</span>${arr.map(h =>
            `<div class="rt">${hl(h.condition) || '—'} → ${hl(h.result) || '—'}</div>` +
            `<div class="src">${h.id}${h.tagged ? '' : '（无标签）'}${h.planets && h.planets.length ? ' · 星:' + h.planets.join('、') : ''}${h.houses && h.houses.length ? ' · 宫:' + h.houses.join('、') : ''}</div>`).join('')}</div>`).join('');
        box.innerHTML = `<div class="src">命中 ${r.result.total} 条，按卷分组${r.result.truncated ? '（显示前 50）' : ''}</div>${rows || '<div class="src">无命中</div>'}`;
      }
    });
    // 一键总览：六域 verdict 分类
    document.addEventListener('click', async (e) => {
      if (e.target && e.target.id === 'ov-run') {
        const out = document.getElementById('ov-out');
        if (!window.__lastChart) { out.innerHTML = '<div class="err">尚无星盘，先计算</div>'; return; }
        const age = parseInt(document.getElementById('ov-age').value, 10);
        out.innerHTML = '计算中…';
        const r = await window.astrology.overviewAnalyze({ chart: window.__lastChart, age: isNaN(age) ? 0 : age });
        if (!r.ok) { out.innerHTML = `<div class="err">${r.error}</div>`; return; }
        const o = r.result;
        const card = (k) => {
          const x = o[k];
          const cls = x.score === null ? '' : (x.score > 2 ? 'pos' : x.score < -2 ? 'neg' : 'neu');
          const det = x.detail ? Object.entries(x.detail).map(([kk, vv]) => `${kk}: ${typeof vv === 'object' ? JSON.stringify(vv) : vv}`).join(' | ') : '';
          const factRows = (x.factors || []).map(f =>
            `<div class="src">${f.w > 0 ? '+' : ''}${f.w} ${f.f} — ${f.d} <span class="src">(${f.s})</span></div>`).join('');
          return `<div class="rule-hit"><span class="rid">${x.label}</span><span class="via ${cls}">${x.score === null ? '—' : (x.score > 0 ? '+' : '') + x.score}</span>` +
            `<div class="rt">${x.verdict}</div>` +
            (det ? `<div class="src">${det}</div>` : '') +
            (factRows ? `<details class="ov-detail"><summary>展开明细（${(x.factors || []).length} 条判据）</summary>${factRows}</details>` : '') +
            `</div>`;
        };
        out.innerHTML = card('natal') + card('progress') + card('election') + card('mundane') +
          `<div class="src">${card('horary')}${card('synastry')}</div>`;
      }
    });
    // 天象模式单选联动
    document.querySelectorAll('input[name="tx-mode"]').forEach(r =>
      r.onchange = () => {
        const now = document.querySelector('input[name="tx-mode"]:checked').value === 'now';
        document.getElementById('tx-fields').style.opacity = now ? 0.45 : 1;
      });
    compute();
  });
})();
