# -*- coding: utf-8 -*-
import sys, json
base = r'D:\一个电脑软件\星盘引擎子件\engine'
lines = []
for f in ['out_beijing.json', 'out_ny2000.json']:
    d = json.load(open(base + '\\' + f, encoding='utf-8-sig'))
    lines.append('== %s == JD: %s %s' % (f, d['meta']['jdUt'], d['meta']['isDay']))
    lines.append('  ASC %s | MC %s' % (d['houses']['angles']['ascF']['text'], d['houses']['angles']['mcF']['text']))
    bad = [p['position']['text'] for p in d['planets'] if ('60′' in p['position']['text'] or '°60' in p['position']['text'])]
    lines.append('  度数溢出检查: %s' % ('OK' if not bad else str(bad)))
    lines.append('  相位数: %d | 尊贵非零: %d' % (len(d['aspects']), sum(1 for p in d['planets'] if p['dignityScore'] != 0)))
open(r'D:\一个电脑软件\星盘引擎子件\verify_final_out.txt', 'w', encoding='utf-8').write('\n'.join(lines))
print('written')
