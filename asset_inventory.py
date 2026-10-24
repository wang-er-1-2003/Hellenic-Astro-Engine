# -*- coding: utf-8 -*-
import os, json, sys
sys.stdout.reconfigure(encoding='utf-8')

ROOT = r'D:\一个电脑软件\astrology-resources'
lines = []

# 1) rulebooks 目录清单
rb = os.path.join(ROOT, 'rulebooks')
if os.path.isdir(rb):
    files = sorted(os.listdir(rb))
    xlsx = [f for f in files if f.lower().endswith('.xlsx')]
    lines.append('== rulebooks (%d 个 xlsx) ==' % len(xlsx))
    for f in xlsx:
        p = os.path.join(rb, f)
        lines.append('  %-70s %8d KB' % (f, os.path.getsize(p) // 1024))
else:
    lines.append('rulebooks 目录不存在: ' + rb)

# 2) rules/ 与根目录 JSON
for d, name in [(ROOT, '根目录'), (os.path.join(ROOT, 'rules'), 'rules/')]:
    if not os.path.isdir(d):
        lines.append('%s 不存在' % name); continue
    js = sorted(f for f in os.listdir(d) if f.lower().endswith('.json'))
    lines.append('== %s JSON (%d) ==' % (name, len(js)))
    for f in js:
        p = os.path.join(d, f)
        try:
            data = json.load(open(p, encoding='utf-8'))
            if isinstance(data, dict):
                ks = list(data.keys())[:12]
                summary = 'dict keys: ' + ', '.join(map(str, ks))
            elif isinstance(data, list):
                summary = 'list len=%d, 首元素: %s' % (len(data), json.dumps(data[0] if data else None, ensure_ascii=False)[:200])
            else:
                summary = str(data)[:200]
        except Exception as e:
            summary = '解析失败: %s' % e
        lines.append('  %-45s %8d KB | %s' % (f, os.path.getsize(p) // 1024, summary))

open(os.path.join(r'D:\一个电脑软件\星盘引擎子件', 'asset_inventory.txt'), 'w', encoding='utf-8').write('\n'.join(lines))
print('written', len(lines), 'lines')
