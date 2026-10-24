// 日返迭代调试：打印 natalSun / 粗估 / 每步迭代
const { app } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { norm } = require('./engine/core/ecliptic');

async function main() {
  try {
    const modUrl = pathToFileURL(path.join(__dirname, 'engine/sweph-wasm/package/src/swisseph.js')).href;
    const { default: SwissEph } = await import(modUrl);
    const swe = new SwissEph();
    await swe.initSwissEph();

    const natalJd = swe.julday(1990, 6, 15, 4.0); // UT
    const natalSun = swe.calc_ut(natalJd, swe.SE_SUN, swe.SEFLG_SWIEPH);
    console.log('natalJd:', natalJd, ' natalSun:', natalSun[0].toFixed(4), 'deg');

    let jd = natalJd + 365.25;
    console.log('coarse jd:', jd.toFixed(4));
    for (let i = 0; i < 6; i++) {
      const sun = swe.calc_ut(jd, swe.SE_SUN, swe.SEFLG_SWIEPH);
      const diff = norm(sun[0]) - norm(natalSun[0]);
      const jdShift = diff / Math.max(Math.abs(sun[3]), 0.5);
      console.log(`iter${i}: jd=${jd.toFixed(4)} sun=${sun[0].toFixed(4)} diff=${diff.toFixed(4)} shift=${jdShift.toFixed(4)} speed=${sun[3].toFixed(4)}`);
      jd += jdShift;
      if (Math.abs(jdShift) < 1e-4) break;
    }
    const sunFinal = swe.calc_ut(jd, swe.SE_SUN, swe.SEFLG_SWIEPH);
    console.log('final jd:', jd.toFixed(4), ' sun:', sunFinal[0].toFixed(4));
    swe.close();
  } catch (e) { console.error('FAIL:', e.message, e.stack); }
  app.exit(0);
}
app.whenReady().then(main);
