// 历法修正实验：L497 判例（497-10-28 Julian, 亚历山大 30E 31N）
const { app } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  try {
    const modUrl = pathToFileURL(path.join(__dirname, 'engine/sweph-wasm/package/src/swisseph.js')).href;
    const { default: SwissEph } = await import(modUrl);
    const swe = new SwissEph();
    await swe.initSwissEph();
    // 儒略历 497-10-28 约等于格里历投影 497-11-02（5世纪差约+5天）
    const tests = [
      ['GREG 10-28 UT10.59(greg)', swe.julday(497, 10, 28, 10.59)],
      ['GREG 11-02 UT10.59(jul≈greg+5d)', swe.julday(497, 11, 2, 10.59)],
      ['GREG 11-02 UT12.5833(LMT直用)', swe.julday(497, 11, 2, 12.5833)],
      ['GREG 11-02 UT11.80', swe.julday(497, 11, 2, 11.80)],
    ];
    for (const [label, jd] of tests) {
      const h = swe.houses(jd, 31.0, 30.0, 'O');
      console.log(label, '| asc=%.3f mc=%.3f', h.ascmc[0], h.ascmc[1]);
    }
    // 参考: asc 332.15 (2°09'宝瓶), mc 229.467 (19°28'天蝎)
    // 文本: asc 332.20 (2°12'宝瓶), mc 229.367 (19°22'天蝎)
    swe.close();
  } catch (e) { console.error('FAIL:', e.message); }
  app.exit(0);
}
app.whenReady().then(main);
