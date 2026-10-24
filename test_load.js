// 星盘引擎子件 - wasm 加载冒烟测试（Electron headless）
// 用法: node_modules\.bin\electron.cmd test_load.js
const { app } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  try {
    const modUrl = pathToFileURL(path.join(__dirname, 'engine/sweph-wasm/package/src/swisseph.js')).href;
    const { default: SwissEph } = await import(modUrl);
    const swe = new SwissEph();
    await swe.initSwissEph();
    console.log('VERSION:', swe.version());

    // 基准: 2000-01-01 12:00 UT（标准瑞士星历参考值）
    const jd = swe.julday(2000, 1, 1, 12.0);
    console.log('JD 2000-01-01 12UT:', jd.toFixed(6), '(参考 2451545.000000)');
    const sun = swe.calc_ut(jd, swe.SE_SUN, swe.SEFLG_SWIEPH);
    const moon = swe.calc_ut(jd, swe.SE_MOON, swe.SEFLG_SWIEPH);
    const merc = swe.calc_ut(jd, swe.SE_MERCURY, swe.SEFLG_SWIEPH);
    console.log('SUN : lon=%.4f lat=%.4f dist=%.4f speed=%.6f', sun[0], sun[1], sun[2], sun[3]);
    console.log('MOON: lon=%.4f lat=%.4f dist=%.4f speed=%.6f', moon[0], moon[1], moon[2], moon[3]);
    console.log('MERC: lon=%.4f lat=%.4f', merc[0], merc[1]);

    // 宫位（Placidus, 纽约）
    const houses = swe.houses(jd, 40.7128, -74.0060, 'P');
    console.log('HOUSES(P) asc=%s mc=%s', houses.ascendant, houses.mc);
    if (Array.isArray(houses.cusps)) {
      console.log('CUSPS:', houses.cusps.map(v => v.toFixed(2)).join(', '));
    } else {
      console.log('HOUSES raw:', JSON.stringify(houses));
    }

    // L497 判例盘（497-10-28 12:35 LMT 亚历山大 lat 31.2 lon 29.9, Porphyry 'O'）
    // LMT→UT: UT = LMT - lon/15 = 12.5833 - 29.9/15 = 10.5900
    const jdL497 = swe.julday(497, 10, 28, 10.5900);
    const h497 = swe.houses(jdL497, 31.2, 29.9, 'O');
    console.log('L497 asc=%.3f mc=%.3f (参考 332.200 / 229.367)', h497.ascmc[0], h497.ascmc[1]);
    console.log('L497 cusps:', [1,2,3,4,5,6,7,8,9,10,11,12].map(i => h497.cusps[i].toFixed(3)).join(', '));
    // 参考: 升 2°12' 宝瓶(332.2°) / MC 19°22' 天蝎(229.37°)
    swe.close();
  } catch (e) {
    console.error('FAIL:', e.message, '\n', e.stack);
  }
  app.exit(0);
}

app.whenReady().then(main);
