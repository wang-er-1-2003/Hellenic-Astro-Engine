# -*- coding: utf-8 -*-
import json
base = r'D:\一个电脑软件\星盘引擎子件\engine'
lines = []
for f in ['out_prog.json', 'out_sr.json']:
    d = json.load(open(base + '\\' + f, encoding='utf-8-sig'))
    m = d['meta']
    lines.append('== %s == type=%s' % (f, m['type']))
    lines.append('  natalJd=%s chartJd=%s houseJd=%s years=%s arc=%s' % (
        m['natalJd'], m['chartJd'], m['houseJd'], m.get('years'), m.get('solarArcDeg')))
    lines.append('  ASC %s | MC %s' % (d['houses']['angles']['ascF']['text'], d['houses']['angles']['mcF']['text']))
    rows = []
    for p in d['planets'][:7]:
        rows.append('%s%s' % (p['zh'], p['position']['text']))
    lines.append('  七政: ' + '  '.join(rows))
open(base + '\\out_prog_check.txt', 'w', encoding='utf-8').write('\n'.join(lines))
print('ok')
