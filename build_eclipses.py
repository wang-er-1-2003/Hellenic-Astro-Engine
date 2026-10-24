# -*- coding: utf-8 -*-
# 解析 NASA 五千年日/月蚀目录（Espenak & Meeus）→ engine/data/eclipses.json
# 输入：engine/data/SE5catalog.txt（日蚀）、LE5catalog.txt（月蚀）
# 输出：eclipses.json { source, solar:[...], lunar:[...] }
import json, os, re

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'engine', 'data')
MONTHS = {'Jan':1,'Feb':2,'Mar':3,'Apr':4,'May':5,'Jun':6,'Jul':7,'Aug':8,'Sep':9,'Oct':10,'Nov':11,'Dec':12}

def parse_date(tokens):
    # tokens: ['-1999','Jun','12'] → '天文年-月-日'（天文编号，1 BCE = 0）
    y = int(tokens[0]); m = MONTHS[tokens[1]]; d = int(tokens[2])
    return '%d-%02d-%02d' % (y, m, d)

def latlon(s):
    # '6.0N' → 6.0 ; '33.3W' → -33.3
    if not s or s == '-': return None
    v = float(s[:-1])
    return v if s[-1] in 'NE' else -v

def parse_solar(path):
    out = []
    for line in open(path, encoding='utf-8', errors='replace'):
        s = line.rstrip('\n')
        if not re.match(r'^\s*\d{1,5}\s', s): continue
        t = s.split()
        if len(t) < 17: continue
        try:
            # 列：Cat Plate 日期 时刻 DT Luna Saros Type QLE Gamma Mag Lat Long Alt Azm Width Dur
            date = parse_date(t[2:5]); td = t[5]
            typ = t[9]
            if typ not in ('T','A','H','P'): continue
            saros = int(t[8]); gamma = float(t[11]); mag = float(t[12])
            la = latlon(t[13]); lo = latlon(t[14])
            width = int(t[17]) if t[17] != '-' else None
            dur = t[18] if len(t) > 18 and t[18] != '-' else None
            out.append({'d': date, 'td': td, 't': typ, 's': saros, 'g': gamma, 'm': mag, 'la': la, 'lo': lo, 'w': width, 'du': dur})
        except (ValueError, IndexError):
            continue
    return out

def parse_lunar(path):
    out = []
    for line in open(path, encoding='utf-8', errors='replace'):
        s = line.rstrip('\n')
        if not re.match(r'^\s*\d{5}\s', s): continue
        t = s.split()
        if len(t) < 15: continue
        try:
            # 列：Cat 日期 时刻 DT Luna Saros Type QSE Gamma PenMag UmMag PenDur ParDur TotDur Lat Lng
            date = parse_date(t[1:4]); tm = t[4]            # 最大食时刻（TT）
            typ = t[8][0]  # N/P/T/A（T+→T）
            if typ not in ('N','P','T','A'): continue
            saros = int(t[7]); gamma = float(t[10]); pmag = float(t[11]); umag = float(t[12])
            pdur = float(t[13]) if t[13] != '-' else None   # 半影持续（分钟）
            tdur = float(t[15]) if t[15] != '-' else None   # 全蚀持续（分钟）
            la = latlon(t[16]); lo = latlon(t[17])
            out.append({'d': date, 'tm': tm, 't': typ, 's': saros, 'g': gamma, 'pm': pmag, 'um': umag, 'pd': pdur, 'td': tdur, 'la': la, 'lo': lo})
        except (ValueError, IndexError):
            continue
    return out

solar = parse_solar(os.path.join(BASE, 'SE5catalog.txt'))
lunar = parse_lunar(os.path.join(BASE, 'LE5catalog.txt'))
data = {
    'source': 'NASA Five Millennium Catalog of Solar/Lunar Eclipses (Espenak & Meeus; NASA/TP-2008-214170 / TP-2009-214173); TD approx as UTC for engine use',
    'solar_count': len(solar), 'lunar_count': len(lunar),
    'solar': solar, 'lunar': lunar,
}
with open(os.path.join(BASE, 'eclipses.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print('solar', len(solar), 'lunar', len(lunar))
print('size', os.path.getsize(os.path.join(BASE, 'eclipses.json')))
