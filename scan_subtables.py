# -*- coding: utf-8 -*-
"""扫描47卷全部子表（非说明/规则条目）：名称/尺寸/表头，按类型归类"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')
from openpyxl import load_workbook

RB = r'D:\一个电脑软件\astrology-resources\rulebooks'
files = sorted(f for f in os.listdir(RB) if f.lower().endswith('.xlsx') and f != '规则库-索引总表.xlsx')
out = []
for f in files:
    wb = load_workbook(RB + '\\' + f, read_only=True, data_only=True)
    for s in wb.sheetnames:
        if s in ('说明', '规则条目'):
            continue
        ws = wb[s]
        hdr = []
        for row in ws.iter_rows(max_row=1, values_only=True):
            hdr = [str(v)[:16] if v is not None else '' for v in row]
            break
        out.append('%s | %s | %dx%d | %s' % (f.replace('规则库-', '').replace('.xlsx', ''), s, ws.max_row, ws.max_column, ' / '.join(hdr[:8])))
    wb.close()
open(r'D:\一个电脑软件\星盘引擎子件\all_subtables.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('total subtable lines:', len(out))
