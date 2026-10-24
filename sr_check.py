# -*- coding: utf-8 -*-
import sys, json, math
sys.stdout.reconfigure(encoding='utf-8')
import ephem

# 1) 本命太阳（1990-06-15 04:00 UT）→ ephem 独立验证
obs = ephem.Observer()
obs.date = '1990/6/15 04:00:00'
obs.lat, obs.lon, obs.elevation = '0', '0', 0
sun = ephem.Sun()
sun.compute(obs)
e = ephem.Ecliptic(sun)
natal_sun_ephem = float(e.lon) * 180 / math.pi

# 2) 引擎输出对比
d = json.load(open(r'D:\一个电脑软件\星盘引擎子件\engine\out_beijing.json', encoding='utf-8-sig'))
natal_sun_engine = d['planets'][0]['lon']
dr = json.load(open(r'D:\一个电脑软件\星盘引擎子件\engine\out_sr.json', encoding='utf-8-sig'))
sr_sun = dr['planets'][0]['lon']
sr_jd = dr['meta']['chartJd']

lines = []
lines.append('本命太阳 (ephem):  %.4f deg' % natal_sun_ephem)
lines.append('本命太阳 (engine): %.4f deg' % natal_sun_engine)
lines.append('日返盘太阳 (engine): %.4f deg' % sr_sun)
lines.append('日返 chartJd = natalJd + %.2f 天' % (sr_jd - 2448057.6666666665))

# 3) 日返时刻反查：chartJd 时刻的太阳（ephem）
obs.date = ephem.Date(2451545.0 + (sr_jd - 2451545.0))  # 近似：ephem Date 是 JD-2415020
# ephem.Date 用 'JED'? 直接数值
obs.date = sr_jd - 2415020.0
sun2 = ephem.Sun()
sun2.compute(obs)
e2 = ephem.Ecliptic(sun2)
lines.append('日返时刻太阳 (ephem): %.4f deg' % (float(e2.lon) * 180 / math.pi))

open(r'D:\一个电脑软件\星盘引擎子件\engine\sr_check.txt', 'w', encoding='utf-8').write('\n'.join(lines))
print('ok')
