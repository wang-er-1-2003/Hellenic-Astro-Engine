# -*- coding: utf-8 -*-
# 提取 映射H-度数性质表 的明暗度/阴阳度 → engine/data/degree_natures.json
# 来源：rule_tables.json（Clavis 基础教义卷 Part I，度数性质表）
# 实事求是：仅数字化有数据的"阴阳度/明暗度"；深陷度/减损度(Azimene)/增财度为原文图像占位，不补造
import json
raw = open(r'D:\一个电脑软件\星盘引擎子件\engine\data\rule_tables.json', 'rb').read().decode('utf-8-sig')
data = json.loads(raw)
tbl = None
for t in data['tables']:
    if '度数性质' in str(t.get('table', '')) or '度数性质' in str(t.get('name', '')):
        tbl = t
        break
if not tbl:
    for t in data['tables']:
        rows = t.get('rows', [])
        for r in rows:
            if len(r) >= 3 and r[0] == '白羊' and '阴阳度' in str(r[1]):
                tbl = t; break
        if tbl: break
assert tbl, '未找到度数性质表'
SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '宝瓶', '双鱼']
degree = {}
for r in tbl['rows']:
    if len(r) < 3: continue
    sign = str(r[0]).replace('♈', '白羊').replace('♉', '金牛').replace('♊', '双子').replace('♋', '巨蟹').replace('♌', '狮子').replace('♍', '处女').replace('♎', '天秤').replace('♏', '天蝎').replace('♐', '射手').replace('♑', '摩羯').replace('♒', '宝瓶').replace('♓', '双鱼')
    kind = str(r[1])
    val = str(r[2])
    if sign not in SIGNS: continue
    degree.setdefault(sign, {})[kind] = val
# 深陷/减损/增财保留占位标注（不补造）
out = {
  'source': '映射H-度数性质表（Clavis 基础教义卷 Part I）',
  'note': '阴阳度/明暗度已数字化；深陷度/减损度(Azimene)/增财度为原文图像占位（图表列），未数字化——不补造',
  'usage': '升点度数性质（本命貌相）：升度明=貌清、暗=肤晦、虚度=心智浅；问盗贼/胎儿性别看度数阴阳（表原注）',
  'parsing': '明暗度/阴阳度按度数区间字符串解析（如"1-3暗"=度数1-3为暗；区间端点含）',
  'degrees': degree,
}
with open(r'D:\一个电脑软件\星盘引擎子件\engine\data\degree_natures.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print('written degree_natures.json | signs:', len(degree), '| sample 白羊:', json.dumps(degree['白羊'], ensure_ascii=False))
