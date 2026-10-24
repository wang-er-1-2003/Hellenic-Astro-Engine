# -*- coding: utf-8 -*-
"""A 本命域验证：beijing 盘 conditions + 三套界对照（Ptolemy/埃及/Valens）"""
import sys, json
sys.stdout.reconfigure(encoding='utf-8')
p = r'D:\一个电脑软件\星盘引擎子件\engine\out_beijing.json'
raw = open(p, 'rb').read().decode('utf-8-sig', errors='replace').lstrip('\r\n\ufeff ')
d = json.loads(raw)
lines = []
lines.append('盘型=%s 昼/夜=%s' % (d['meta']['type'], d['meta']['isDay']))
lines.append('== conditions ==')
for c in d.get('conditions', []):
    if c.get('modern'):
        continue
    lines.append(' %s %s %s R=%s void=%s sect=%s %s' % (
        c['zh'], c['sunRelation'], c['oriental'],
        'Y' if c.get('retrograde') else 'N',
        'Y' if c.get('voidOfCourse') else 'N', c['sect'], c['houseQuality']))
lines.append('== 三套界对照 ==')
for p_ in d['planets'][:8]:
    t = p_.get('termsCompare')
    if not t:
        continue
    eg = (t.get('egyptian') or {}).get('planet')
    pt = (t.get('ptolemy') or {}).get('planets')
    va = (t.get('valens') or {}).get('planet')
    lines.append(' %s 度%.1f 埃及=%s Ptolemy=%s Valens=%s match=%s' % (
        p_['zh'], t['degInSign'], eg, pt, va, t['match']))
open(r'D:\一个电脑软件\星盘引擎子件\conditions_check.txt', 'w', encoding='utf-8').write('\n'.join(lines))
print('written %d lines' % len(lines))
