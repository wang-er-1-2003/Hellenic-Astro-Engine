# -*- coding: utf-8 -*-
import sys, json, math
sys.stdout.reconfigure(encoding='utf-8')
import ephem

obs = ephem.Observer()
obs.date = '2000/1/1 12:00:00'
obs.lat = '0'
obs.lon = '0'
obs.elevation = 0
names = {
    'sun': 'Sun', 'moon': 'Moon', 'mercury': 'Mercury', 'venus': 'Venus',
    'mars': 'Mars', 'jupiter': 'Jupiter', 'saturn': 'Saturn',
    'uranus': 'Uranus', 'neptune': 'Neptune', 'pluto': 'Pluto',
}
wasm = json.load(open(r'D:\一个电脑软件\星盘引擎子件\wasm_planets.json', encoding='utf-8'))
print('%-8s %12s %12s %10s' % ('planet', 'wasm_lon', 'ephem_lon', 'diff(deg)'))
for k, cls in names.items():
    b = getattr(ephem, cls)()
    b.compute(obs)
    e = ephem.Ecliptic(b)
    elon = float(e.lon) * 180 / math.pi
    w = wasm[k]['lon']
    d = (elon - w + 180) % 360 - 180
    print('%-8s %12.6f %12.6f %+10.5f' % (k, w, elon, d))
