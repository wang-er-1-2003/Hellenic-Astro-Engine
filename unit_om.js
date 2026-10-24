// F 域蚀主预兆（映射Y）验证：2026-08-12 日全蚀盘（蚀黄经 140°=狮子20°火象，年主=太阳）
'use strict';
const { app } = require('electron');
const { computeChart } = require('./engine/core/chart');
const mundane = require('./engine/core/mundane');
async function main() {
  // 蚀盘=2026-08-12 17:47 UTC（最大食时刻近似）北京坐标
  const ec = await computeChart({ type: 'natal', year: 2026, month: 8, day: 12, hour: 17, minute: 47, tzOffsetHours: 0, lat: 39.9042, lon: 116.4074, houseSystem: 'P' });
  // 蚀黄经 140.0°
  const omen = mundane.eclipseOmen(140.0, [4], 0, ec); // 蚀主=火星(idx4)、年主=太阳(idx0)
  console.log('人身:', omen.person.join('；') || '无');
  console.log('空气:', omen.air.join('；') || '无');
  console.log('海河:', omen.sea.join('；') || '无');
  console.log('大地:', omen.land.join('；') || '无');
  console.log('特例:', omen.special.join('；') || '无');
  console.log('四元质:', omen.element.join('；') || '无');
  // 并列蚀主（火+金）测试
  const o2 = mundane.eclipseOmen(140.0, [4, 3], 0, ec);
  console.log('并列人身:', o2.person.join('；'));
  app.exit(0);
}
app.whenReady().then(main).catch(e => { console.error('ERR', e.stack); app.exit(0); });
