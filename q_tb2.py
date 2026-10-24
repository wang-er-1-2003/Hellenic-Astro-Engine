# -*- coding: utf-8 -*-
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
with open(r'D:\一个电脑软件\星盘引擎子件\engine\data\rule_tables.json', encoding='utf-8-sig') as f:
    data = json.load(f)
for t in data['tables']:
    tbl = (t.get('table') or '') + (t.get('id') or '')
    if '蚀' in tbl or '世俗' in tbl:
        print('=== TBL:', t.get('id'), '|', t.get('table'), '| src:', t.get('source'), '| rows:', len(t.get('rows', [])))
        for i, r in enumerate(t.get('rows', [])):
            print(f'  {i+1}:', r)
        print()
