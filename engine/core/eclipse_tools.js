// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 wang-er-1-2003
// 蚀工具（公共）：IES ΔT（TT→UT 回退）+ azalt 蚀可见性——main.js 与 cli_mundane.js 复用
// 来源标注：IES ΔT 多项式 = Espenak & Meeus, Five Millennium Canon of Solar Eclipses (2006) Appendix；
// azalt = Swiss Ephemeris swe_azalt（SE_EQU2HOR=1，赤道→地平，内部含恒星时）。
'use strict';
const { getSwe } = require('./swe');

/**
 * IES ΔT 多项式（秒）。范围 1900-2150；范围外返回 null（无法回退，如实）。
 * 注：IES 式对 2026 给 ≈75s，NASA 实测 ≈69s——误差 ±10s，蚀黄经影响 <0.05°（标注）。
 */
function deltaT(year) {
  if (year >= 1900 && year < 1920) {
    const t = year - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * t * t * t * t;
  }
  if (year >= 1920 && year < 1941) {
    const t = year - 1920;
    return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t;
  }
  if (year >= 1941 && year < 1961) {
    const t = year - 1950;
    return 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547;
  }
  if (year >= 1961 && year < 1986) {
    const t = year - 1975;
    return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718;
  }
  if (year >= 1986 && year < 2005) {
    const t = year - 2000;
    return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t + 0.000651814 * t * t * t * t + 0.00002373599 * t * t * t * t * t;
  }
  if (year >= 2005 && year < 2050) {
    const t = year - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t * t;
  }
  if (year >= 2050 && year < 2150) {
    const u = (year - 1820) / 100;
    return -20 + 32 * u * u - 0.5628 * (2150 - year);
  }
  return null;
}

/**
 * 蚀时刻（蚀表 td/tm=TT 历书时）→ 排盘用 UT 输入 + 修正信息。
 * @param {object} hit findNearestEclipse 输出（e.d='YYYY-MM-DD'、tm='HH:MM[:SS]'，日蚀取 td、月蚀取 tm）
 * @returns {{eclInput:object, ttJd:number, utJd:number, deltaTsec:number|null, note:string} | null}
 */
async function eclipseUtInput(hit, lat, lon, houseSystem) {
  const swe = await getSwe();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hit.e.d);
  const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(hit.tm || '');
  if (!m || !tm) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const ttHour = Number(tm[1]) + Number(tm[2]) / 60 + (tm[3] ? Number(tm[3]) / 3600 : 0);
  const ttJd = swe.julday(y, mo, d, ttHour); // 蚀表时刻=TT（历书时）数值
  const dt = deltaT(y);
  let utJd = ttJd, note;
  if (dt != null) {
    utJd = ttJd - dt / 86400;
    note = `蚀时刻 TT(${hit.tm})→UT：ΔT=${dt.toFixed(1)}s（IES 多项式 ${y} 段）`;
  } else {
    note = `蚀时刻=蚀表 TT(${hit.tm})，ΔT 超出 IES 多项式范围（${y} 年），未回退（保持原值）`;
  }
  const rj = swe.revjul(utJd, 1); // 格里历 → {year, month, day, hour}
  return {
    eclInput: {
      type: 'natal', calendar: 'gregorian',
      year: rj.year, month: rj.month, day: rj.day, hour: rj.hour, minute: 0,
      tzOffsetHours: 0, lat, lon, houseSystem: houseSystem || 'P',
    },
    ttJd, utJd, deltaTsec: dt, note,
  };
}

/**
 * 蚀可见性（TTB-213）：蚀光体（日蚀=太阳、月蚀=月亮）在盘地点于蚀时刻（UT）的高度角。
 * swe_azalt(SE_EQU2HOR=1)：xin=[赤经,赤纬,距离]（SEFLG_EQUATORIAL 输出）→ 地平（真高度角）。
 * @returns {{body:string, alt:number, visible:boolean, note:string}}
 */
async function eclipseVisibility(kind, utJd, lat, lon) {
  const swe = await getSwe();
  const bodyIdx = kind === '日蚀' ? swe.SE_SUN : swe.SE_MOON;
  const bodyZh = kind === '日蚀' ? '太阳' : '月亮';
  const r = swe.calc_ut(utJd, bodyIdx, swe.SEFLG_SWIEPH | swe.SEFLG_EQUATORIAL);
  const az = swe.azalt(utJd, 1, [lon, lat, 0], 0, 0, [r[0], r[1], r[2]]);
  return { body: bodyZh, alt: az.trueAltitude, visible: az.trueAltitude > 0, note: `azalt（SE_EQU2HOR）赤道→地平，UT 时刻=${utJd.toFixed(6)}` };
}

module.exports = { deltaT, eclipseUtInput, eclipseVisibility };
