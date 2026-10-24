# -*- coding: utf-8 -*-
import json, sys
sys.stdout.reconfigure(encoding='utf-8')
d = json.load(open(r'D:\一个电脑软件\星盘引擎子件\engine\data\rules_index.json', encoding='utf-8'))
lines = []
# 1) CARD-104 标签
for r in d['rules']:
    if r['rule_id'] == 'CARD-104':
        lines.append('CARD-104: planets=%s signs=%s houses=%s aspects=%s type=%s' % (r['planets'], r['signs'], r['houses'], r['aspects'], r['rule_type']))
        break
# 2) 卡丹诺卷 planets 标签分布（多少条标了多个行星=格言体）
card = [r for r in d['rules'] if 'Cardano' in r['source']]
multi = [r for r in card if len(r['planets']) > 1]
lines.append('Cardano卷: %d 条, planets多标签 %d 条, 单标签 %d 条' % (len(card), len(multi), len(card) - len(multi)))
# 3) Lilly 行星释义卷有多少条进 byPlanet['土星']（标了Saturn的）
lil = [r for r in d['rules'] if 'Lilly行星' in r['source']]
sat = [r for r in lil if '土星' in r['planets']]
lines.append('Lilly行星释义卷: %d 条, 标土星 %d 条' % (len(lil), len(sat)))
for r in sat[:3]:
    lines.append('   %s type=%s conf=%s | %s' % (r['rule_id'], r['rule_type'], r['confidence'], r['translation'][:60]))
# 4) 各卷带标签比例（判断哪些卷标签可靠）
lines.append('')
for f in sorted(set(r['source'] for r in d['rules'])):
    rs = [r for r in d['rules'] if r['source'] == f]
    tag = sum(1 for r in rs if r['planets'] or r['signs'] or r['houses'] or r['aspects'])
    if tag:
        lines.append('%-52s %3d/%3d' % (f, tag, len(rs)))
open(r'D:\一个电脑软件\星盘引擎子件\card_check.txt', 'w', encoding='utf-8').write('\n'.join(lines))
print('ok')
