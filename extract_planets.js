// 行星黄经提取（wasm 侧）→ 输出 JSON 供 ephem 交叉验证
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

async function main() {
  try {
    const modUrl = pathToFileURL(path.join(__dirname, 'engine/sweph-wasm/package/src/swisseph.js')).href;
    const { default: SwissEph } = await import(modUrl);
    const swe = new SwissEph();
    await swe.initSwissEph();

    const jd = swe.julday(2000, 1, 1, 12.0);
    const planets = {
      sun: swe.SE_SUN, moon: swe.SE_MOON, mercury: swe.SE_MERCURY, venus: swe.SE_VENUS,
      mars: swe.SE_MARS, jupiter: swe.SE_JUPITER, saturn: swe.SE_SATURN,
      uranus: swe.SE_URANUS, neptune: swe.SE_NEPTUNE, pluto: swe.SE_PLUTO,
    };
    const out = {};
    for (const [name, p] of Object.entries(planets)) {
      const r = swe.calc_ut(jd, p, swe.SEFLG_SWIEPH);
      out[name] = { lon: r[0], lat: r[1], dist: r[2], speed: r[3] };
    }
    fs.writeFileSync(path.join(__dirname, 'wasm_planets.json'), JSON.stringify(out, null, 2));
    console.log('wasm planets saved. sun lon:', out.sun.lon.toFixed(6));
    swe.close();
  } catch (e) { console.error('FAIL:', e.message); }
  app.exit(0);
}
app.whenReady().then(main);
