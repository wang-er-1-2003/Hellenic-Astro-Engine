# -*- coding: utf-8 -*-
"""修正 dignity_tables.json 的 source 标注（界表实为埃及界，非 Ptolemy 界）"""
import json, sys
sys.stdout.reconfigure(encoding='utf-8')
p = r'D:\一个电脑软件\星盘引擎子件\engine\data\dignity_tables.json'
d = json.load(open(p, encoding='utf-8'))
old = d.get('source', '')
d['source'] = '规则库-Lilly星座释义卷 > 尊贵总表（界=埃及界 Chaldean 系统；与规则库「界terms」子表同源一致；主流流通版常误标为"Ptolemy 界"，如 astrologycom.com/dignities.html）'
d['notes'] = d.get('notes', [])
if isinstance(d['notes'], str):
    d['notes'] = [d['notes']]
d['notes'].append('界表核校(2026-10-18)：对照 sacred-texts Tetrabiblos Ashmand 译本，本表界为埃及界(Chaldean)，与 Ptolemy 修正界在双子/巨蟹/狮子/天蝎/摩羯等座有真实差异（如双子 埃及=水7木14金21土25火30，Ptolemy修正=水7木13金20火26土30；天蝎 埃及=火6木14金21水27土30，Ptolemy修正=火6金14木21水27土30）。引擎 termsCompare 提供 埃及界 vs Valens五十界 两套对照；如需 Ptolemy 修正界对照需另录数据。')
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('updated:', old[:40], '->', d['source'][:40])
