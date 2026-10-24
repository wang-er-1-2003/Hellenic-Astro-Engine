# -*- coding: utf-8 -*-
import json, sys
sys.stdout.reconfigure(encoding='utf-8')
d = json.load(open(r'D:\一个电脑软件\星盘引擎子件\engine\out_rules_beijing.json', encoding='utf-8-sig'))
lines = []
st = d['stats']
lines.append('规则库: total=%d tagged=%d sources=%d' % (st['total'], st['tagged'], st['sources']))
lines.append('types: ' + ', '.join('%s=%d' % kv for kv in sorted(st['byType'].items(), key=lambda x: -x[1])[:8]))
r = d['rules']
lines.append('整盘命中: totalHits=%d' % r['meta']['totalHits'])
for p in r['planets']:
    lines.append('')
    lines.append('%s%s %s 落%s宫 尊贵分%d 命中%d条' % (p['glyph'], p['zh'], p['position'], p['house'], p['dignityScore'], p['hitCount']))
    for h in p['hits'][:3]:
        lines.append('   [%s][%s] %s' % (h['rule_id'], '/'.join(h['via']), h['translation'][:90]))
        if h.get('condition'): lines.append('     条件: %s' % h['condition'][:60])
open(r'D:\一个电脑软件\星盘引擎子件\engine\rules_beijing_check.txt', 'w', encoding='utf-8').write('\n'.join(lines))
print('ok')
