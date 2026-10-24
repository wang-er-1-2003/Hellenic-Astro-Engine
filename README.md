# 星盘引擎子件（Astrology Engine Submodule）

Electron 独立子件：完整复原西方星占软件机制的第 3 层（排盘）与第 4 层（解读）规则引擎。输入出生/问事时间地点，输出结构化星盘 JSON（行星位置、宫位、落宫、相位、尊贵），并按六大结果目的域（本命/推运/卜卦/择时/合盘/世俗）给出判读。

**方案定案**：桌面本地应用，自家窗口展示本地 HTML（无远程网页注入）。

## 架构

```
星盘引擎子件/
├── main.js              Electron 主进程（窗口 + IPC 排盘服务 + 六域判读 IPC + smoke 验证）
├── preload.js           安全桥（contextBridge：astrology.* 含 rulesSearch/davisonAnalyze/marriageAnalyze）
├── index.html           本地界面（左：星盘图 + 盘型切换；右：可折叠输入/输出列）
├── renderer/
│   ├── chart-view.js    SVG 星盘图渲染（星座带/宫位带/行星环/四轴/相位线）
│   └── app.js           界面逻辑（六盘型切换/输入收集/20 折叠输出块/规则检索高亮）
├── engine/
│   ├── cli.js           CLI 排盘入口（electron engine/cli.js <case>）
│   ├── cli_rules.js     规则库命中 CLI
│   ├── cli_tables.js    子表查询 CLI
│   ├── cli_horary.js    卜卦 CLI（demo/now）
│   ├── cli_progress.js  推运 CLI（法达/小限）
│   ├── cli_election.js  择时 CLI（含本命协同）
│   ├── cli_synastry.js  合盘 CLI
│   ├── cli_davison.js   戴维斯组合盘 CLI
│   ├── cli_marriage.js  婚姻判读 CLI（本命/伴侣盘）
│   ├── cli_mundane.js   世俗 CLI（Y M D [H] 可指定）
│   ├── core/            引擎核心（纯 Node，可独立测试）
│   │   ├── swe.js       SwissEph wasm 单例封装（本地→儒略日，支持格里/儒略历）
│   │   ├── constants.js 行星/星座/相位/分宫制/尊贵权重常量
│   │   ├── ecliptic.js  黄道工具（归一化/最短差/度数格式化/落宫）
│   │   ├── aspects.js   相位计算（主相位 + 两套容许度：modern/Lilly）
│   │   ├── dignity.js   尊贵计算（庙/擢/三分/界/面 + 陷/落 + 权重计分 + 三套界对照）
│   │   ├── chart.js     排盘编排（6 盘型：本命/天象/次限/三限/日返/太阳弧；产前朔望 meta.prenatalLunation）
│   │   ├── progress.js  推运模块（次限/三限/日返迭代/太阳弧）
│   │   ├── rules.js     第4层规则库查询（47卷 2888 条索引 + 整盘解读 + 全文检索）
│   │   ├── tables.js    第4层子表查询（249 张：行星档案/三分主星/界/面/宫位/尊贵对照）
│   │   ├── conditions.js 行星条件判定 + 偶然尊贵计分（Clavis CE-042/043，Schoener SD 表补强）
│   │   ├── almuten.js   Almuten 命主判定（现代/古法 + CP3-307 平局四层细则）
│   │   ├── life.js       Hyleg 寿命主 + Alcocoden 年限主（产前朔望牛顿迭代 + 并列裁定）+ 固定星本命证
│   │   ├── progressions.js B 推运域：法达（Firdaria hand/zoller 分歧）+ 小限（Valens IV.11）
│   │   ├── horary.js     C 卜卦域：Bonatti146 判据链 + 月亮17阻碍/行星10阻碍 + 固定星征象（BO-099/100）
│   │   ├── election.js   D 择时域：BT-001~055 判据链 + 本命协同（CE-163）+ 置业专项（CE-175）+ 固定星
│   │   ├── synastry.js   E 合盘域：双盘相位/光体判婚/互落/接纳互溶 + 组合盘中点
│   │   ├── davison.js    戴维斯组合盘（双出生 UTC 时间中点 + 地理中点重排完整盘）
│   │   ├── marriage.js   婚卷专项（9 阿拉伯点 + TTB-421~429 婚判据 + CP3-178/522 + DOR2 判据）
│   │   ├── mundane.js    F 世俗域：NASA 五千年蚀目录 + 蚀应期 + 蚀黄经精确落宫（蚀时刻整盘）
│   │   └── fixed_stars.js 固定星（BO-100 助成恒星表 25 条 + Algol，17 世纪黄经岁差校正）
│   ├── data/            引擎数据
│   │   ├── dignity_tables.json  Ptolemy/Lilly 尊贵总表（自规则库提取）
│   │   ├── ptolemy_terms.json   Ptolemy 修正界（三套界对照）
│   │   ├── rules_index.json     47 卷规则全量索引（2888 条，build_rules_index.py 生成）
│   │   ├── rule_tables.json     47 卷子表全量（249 张）
│   │   ├── firdaria.json       法达年限/昼夜序/版本分歧警示
│   │   ├── profections.json    小限公式/映射（Valens IV.11）
│   │   ├── planetary_conditions.json 行星条件判定元数据
│   │   ├── fixed_stars.json     固定星表（BO-100）
│   │   └── eclipses.json        NASA 五千年日/月蚀目录（日 7306/月 12064，build_eclipses.py 生成）
│   └── sweph-wasm/package/  Swiss Ephemeris wasm 库（GPL-3.0-or-later）
└── node_modules/electron/  Electron 31.7.7 运行时（自用副本）
```

## 六大结果目的域

| 域 | 模块 | 核心判据源 | 状态 |
|---|---|---|---|
| A 本命 | conditions/almuten/life | Clavis CE-042/043、CP3-504/307、Schoener SD、固定星证 | 已接入（平局四层细则；5 宫分值原文实缺不补造） |
| B 推运 | progressions | Firdaria（hand/zoller）、Valens IV.11 小限 | 已接入（当前副段+剩余年数） |
| C 卜卦 | horary | Bonatti146、Dariot Almuten 判序、MashallahReception、Griffin/Gadbury 失物 | 已接入（月亮17/行星10阻碍含弃纳就拒 + 固定星） |
| D 择时 | election | BT-001~055、CE-163 本命协同、CE-175 置业、BT-011/017 固定星 | 已接入（三版本命协同） |
| E 合盘 | synastry/davison/marriage | TTB-421~429、CP3-178/522、DOR2、TTB-425 | 已接入（婚卷专项 9 点） |
| F 世俗 | mundane | Tetrabiblos II（45）、MashallahEclipses（42）、Clavis 蚀兆（34）、NASA 蚀目录 | 已接入（蚀黄经精确落宫 + TTB-218 蚀主择定 + BO-054 出没强弱） |

## 运行

```powershell
# 界面（左星盘图 + 右可折叠输入/输出，顶部切换六盘型）
electron .                # 或 npm start
# 排盘 CLI（输出 JSON，含 conditions/accidental/totalScore/almuten/hyleg/alcocoden/产前朔望/固定星证）
electron engine/cli.js ny2000
electron engine/cli.js l497
electron engine/cli.js beijing
electron engine/cli.js beijing_prog    # 次限 35 岁
electron engine/cli.js beijing_sr      # 日返
# 规则库/子表 CLI
electron engine/cli_rules.js beijing
electron engine/cli_tables.js profile 土星
electron engine/cli_tables.js triplicity 白羊
# 六域判读 CLI
electron engine/cli_horary.js demo        # 盗窃失物案例
electron engine/cli_progress.js beijing   # 法达+小限
electron engine/cli_election.js           # 择时（含 synergy 本命协同）
electron engine/cli_synastry.js           # 合盘
electron engine/cli_davison.js            # 戴维斯组合盘
electron engine/cli_marriage.js beijing   # 婚姻判读（beijing-partner 带伴侣盘）
electron engine/cli_mundane.js 2026 8 12 10 0   # 世俗（2026-08-12 日全蚀精确落宫）
# smoke 自检（窗口启动 → 遍历盘型 → 全链路报告 → 自动退出）
electron . --smoke
```

## 输入 / 输出

**输入**：`{type, year, month, day, hour, minute, tzOffsetHours, lat, lon, houseSystem, orbSet, calendar}`

- `type`: `natal`(默认) | `transit`(天象) | `progressed`(次限) | `tertiary`(三限) | `solar-return`(日返) | `solar-arc`(太阳弧)
- 推运盘型（次限/三限/太阳弧）需 `years`；默认行星推进+本命宫位，`useProgressedHouses:true` 则宫位也推进
- 天象：`useNow:true` 或 `txYear..txMinute + txTzOffsetHours` 指定时刻
- `houseSystem`: P=Placidus O=Porphyry W=Whole Sign R=Regiomontanus K=Koch A/E=Equal C=Campanus T=Polich/Page
- `calendar`: g=格里历（默认）| j=儒略历（1582 前及古代判例）

**输出**：`{meta, planets[12], houses{cusps, angles}, aspects[]}`

- `meta`: {type, natalJd, chartJd, houseJd, years?, solarArcDeg?, isDay, prenatalLunation(本命), fixedStars(本命)}
- `planets[]`: {idx, zh, glyph, lon, lat, dist, speed, retrograde, house, position, dignityScore, essential[], accidental, totalScore, conditions[]}
- `houses`: {systemName, cusps, angles:{asc,mc,dc,ic}}
- `aspects[]`: {p1, p2, aspect, orb, applying}

## 验证记录（已通过）

| 项目 | 方法 | 结果 |
|---|---|---|
| 星历核心 | wasm vs PyEphem 10 行星黄经 | 最大差 0.0097°（≈35″） |
| 儒略日 | JD 2000-01-01 12UT | 2451545.000000 精确匹配 |
| 宫位算法 | wasm vs 官方 swehouse.c 公式 | 逐位吻合 |
| 判例回测 L497 | 497-10-28 12:35 LMT 亚历山大，儒略历，Porphyry | 引擎 升 宝瓶2°08′/MC 天蝎19°27′ vs Houlding 2°09′/19°28′（差 0.02°）✓ |
| Hyleg-Alcocoden | beijing（1990-06-15 12:00）产前朔望牛顿迭代 | 1990-05-24 双子 3.05°；hyleg=太阳（10宫）；alcocoden=水星（12分）✓ |
| 法达/小限 | beijing | 夜生手版法达 + Valens IV.11 小限副段年数 ✓ |
| 卜卦三版 | demo 盗窃失物盘 | 倾向败 -5.5（月亮17/行星10阻碍 + 固定星）✓ |
| 择时三版 | beijing 天象候选 | score 6 + 本命协同 synergy 2/0 ✓ |
| 婚卷专项 | beijing 本命 + partner | 9 阿拉伯点全可算，判读 5 条、中性 0 分 ✓ |
| 固定星 | beijing | 无命中如实；demo 盘月亮合射手 7°55′ 吉性恒星 +1 ✓ |
| 命主平局 | 单元四用例 | ASC尊贵/吉照升点/吉照升主/仍并列全列出 全过 ✓ |
| 蚀三版 | 2026-08-12 日全蚀 Saros126 | 蚀时刻 17:47 整盘排算 → 蚀黄经 140.0° 落 1 宫火象（第二版近似 11 宫，误差实锤翻 2 宫）✓ |
| 蚀主择定 | 2026-08-12 日蚀 / 2026-03-03 月蚀 | TTB-218 相熟计数：日蚀主木星（9 分吉主得势 +1）/ 月蚀主土星（15 分自身尊贵 −2 如实不硬判）✓ |
| 出没强弱 | 2026-08-12 日蚀蚀时刻盘 | BO-054 七政全覆盖：月/水 cazimi −3、金晚升 +2、火/土晨升 +2、木日辉下 −1（BO-053 补）✓ |
| 弃纳就拒 | 构造盘单元 | 火星分离于接纳之金星、应用向不接纳之木星 → 行星10阻碍#7 触发 ✓ |
| 界面渲染 | smoke 遍历六盘型 | 6 盘型 SVG 无错误；20 折叠块全渲染；SMOKE_OK |

### 关键踩坑记录
1. **SEFLG_SPEED 必须显式 OR 上**：缺它速度恒 0 → 逆行/相位出入/日返迭代全错。
2. **日返迭代方向**：粗估 jd 已越过目标时 `jdShift = -diff/speed`（符号反会发散）。
3. L497 历法：wasm `swe.julday()` 硬编码格里历，古代判例须 `calendar:'j'`。
4. **规则库表头定位**：21 张表第 1 行为跨列标题、真表头在第 2 行——固定取第 1 行会致 39% 条目的 condition/result 全空；已修为找含 rule_id 的行。
5. **蚀表字段**：月蚀最大食时刻曾被 `td`（全蚀时长）覆盖丢失，已独立 `tm` 字段。
6. **平局自照 bug**：候选行星与自身 0° 必成合相，吉照判定须排除同星。

## 数据来源与许可

- 规则库：`astrology-resources/rulebooks/`（47 卷 xlsx：Valens/Tetrabiblos/Clavis/Dorotheus/Lilly/Bonatti/Mashallah/Dariot/Griffin/Gadbury/Schoener/Cardano 等），PDF→OCR→Excel→JSON 结构化；每条判据带卷名编号。
- 蚀目录：NASA Five Millennium Catalog（Espenak & Meeus，日蚀 7306/月蚀 12064），build_eclipses.py 解析。
- 尊贵表：规则库-Lilly星座释义卷 > Ptolemy 尊贵总表；权重见 essential_dignity_weights.json（5/4/3/2/1）。
- swisseph-wasm：GPL-3.0-or-later（自用不分发无碍；若对外分发需遵 GPL）。
- 存疑数据（已标注 dubious）：天蝎擢升载「火星28°」与主流（摩羯28°）不符；双子擢升「水星0°」有争议；摩羯固定星原文称 3 只列 2 且 7°55′ 与射手重复转录取存疑。

## 实事求是约束

- 每条判据带卷名编号；未计项在输出 unscored 如实列出并说明原因。
- 工程参数（容许度、近似口径）一律标注；有分歧版本（如法达 hand/zoller、命主古法/现代法）并行输出。
- 无确切数据来源的项目不编造阈值，记待办。

## 后续

- F 域余项：BO-056 德性交付东出/西没（需德性交付场景判定）、蚀色/对象分派等 TB II 余条目；世运法达大限——规则库无判据原文（年主=Lord of the Year 已按 Ptolomy 法实现），并入需规则依据不做无据编造
- A 域：离焦脱离阈值；5 宫分值——CE-042/043 原文实缺（唯福点表 CE-044 有"2或5宫=3"），不补造
- D 域：行星时辰（需 swe riset 接口，已验证 wasm 无）
- C 域：月亮 14-17（Azimene/Pitted/Smoky/Dark）——Clavis H 度数性质表深陷/减损列为原文图像未数字化，需原图提取或他源度数表
- E 域：DOR2-10 婚期应期（需行运盘）
- 检索增强：命中数精确统计、拼音/别名同义扩展
