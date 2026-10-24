# 星盘引擎 · 输出层按"结果目的"分类（SPEC v1）

> 2026-10-18 定稿。原则：分类建立在 47 卷规则库真实数据之上，不虚构不存在的分支；每类目的 = 输入 → 引擎管线 → 结构化输出。

## 一、为什么按结果目的分类

现行界面按**排盘类型**（本命/天象/次限/三限/日返/太阳弧）组织——这是"技术视角"（怎么算）。用户实际关心的是**结果视角**（算什么）：打开软件是为了"看我一生的财富"还是"问这东西是不是我丢的"。"结果目的"分类把输出端重新组织成六大目的域，每个域一套输入契约、一条判据管线、一种输出 schema。

## 二、六大目的域（分类总览）

| 域 | 目的 | 典型问题 | 输入 | 核心数据源（47卷） |
|---|---|---|---|---|
| **A 本命解读** | 你是谁、人生领域 | 性格/体质/天赋；财富/职业/婚姻/子女/健康/名声 | 出生时刻+地点（或仅日期） | Tetrabiblos I/III/IV、Valens 本命总论/判断/宫位传递、Lilly 行星/星座/相位释义、Dorotheus I/II、Clavis 基础教义/落座字典、Cardano 箴言 |
| **B 推运应期** | 事情何时发生 | 何时发财/结婚/有灾；寿命与危急年 | 出生盘 + 目标时间 | Valens 推运/寿命时主/判例、Dorotheus III、推运体系、Clavis 本命方向、Centiloquium 定时七法、Sibly/L497/Palchus 判例 |
| **C 卜卦问答** | 问一件事的答案 | 东西丢哪了/生意成不成/婚姻可成否/比赛输赢 | 问事时刻+地点 + 问题类型 | Bonatti146、Bonatti4宫、Dariot 总纲、Gadbury 偷窃、Griffin 盗窃、Clavis 卜卦判例/十二宫问事/补遗、MashallahReception、Neve 档案 |
| **D 择时起卦** | 什么时候做最有利 | 何时建屋/播种/出行/婚嫁/开张/动手术 | 候选时间窗 + 事项 | Bonatti4宫择时、Clavis 择时世俗/择时卷、Dariot 择时要点 |
| **E 关系合盘** | 两人合不合 | 感情/合伙/主仆 | 两套出生数据 | Dorotheus II、Tetrabiblos IV 婚配、Valens 双星/三星组合、Lilly 合盘规则（Centiloquium 合盘规则集） |
| **F 世俗观察** | 国运/天气/大事件 | 蚀象/大合相/国家天气/收成 | 蚀/合相/春分图时刻 | Tetrabiblos II、MashallahEclipses、Clavis 世俗蚀兆、Lilly 蚀判 |

> 卜卦（Horary）与择时（Electional）是两个独立分支：卜卦=问事时刻起盘判答案；择时=选未来时刻行事。不合并。

## 三、每域通用管线（模板）

```
输入契约 → 排盘（swisseph） → 状态提取（行星/宫/相位/尊贵/速度/东西出/燃烧/空亡）
        → 判据链（规则库 query 逐条打标 + 子表对照）
        → 合成（按本域权重） → 结构化输出 { verdict / score / keyFactors / timeHint / notes / sources }
```

所有域共享同一排盘内核（chart.js），差异在判据链与权重。

## 四、第一实现目标：C 卜卦问答（Horary）

### 4.1 为什么先做卜卦
1. 数据最完整：537 条规则 + 30 张子表，闭环独立
2. 目的性最强：输入"问事时刻+问题类型"直接出答案
3. 判据链有古典明文（Bonatti 判断方法论、Dariot Almuten 判序），不靠猜

### 4.2 数据源映射（实事求是：只用已入库的）
- **规则**（rules_index.json，query 按 source 过滤）：
  - Bonatti146（147 条）：通用判断链基座
  - Dariot 卜卦总纲（44 条）：Almuten 判序/成事四法/时限
  - Gadbury 偷窃失物（45 条）、Griffin 盗窃卜卦（140 条）：失物专项
  - Clavis 卜卦判例卷（91 条）+ 十二宫问事判例（48 条）：判例印证
  - MashallahReception（19 条）：接纳/吉凶组合
- **子表**（rule_tables.json，tables.js 取）：
  - Bonatti146：月亮 17 阻碍、行星 10 阻碍、行星喜乐、落陷与速度、龙尾宫位损害、判断 14 点、行星赠赐世代、上升双庙规则、恒星星表
  - Dariot：行星性质、光束半径、成事四法与时限、时限判定、偶然吉凶条件、Almuten 判序
  - Gadbury：方位判据、距离换算、窃贼年龄性别、家贼识别、应期换算
  - Griffin：12 星座方位、土星 12 星座相貌、行星互置相貌、牲畜方向判据

### 4.3 判据链（第一版：通用盘面评估 + 失物专项）
```
输入：天象盘 chart + questionType
1. 盘面状态（每个参与行星）：
   - 宫位/星座/相位/速度（顺逆停）/尊贵分（dignity.js）
   - 东西出（太阳相对）、燃烧（距日<8.5°）、空亡（无入相位）
   - 月亮：应用/分离/空亡/受困（Bonatti 月亮17阻碍）
2. 示义星识别：
   - 问事方 = ASC 主星 + 月亮（通用）；失物=上升双庙/4宫主（Bonatti）
   - 应事方 = 相关宫主（按 questionType 映射：盗窃→8宫/2宫/4宫，买卖→7宫/10宫…）
3. 接纳检验：示义星互接纳（MashallahReception + Bonatti 赠赐世代）
4. 专项子表对照：失物 → Griffin 方位 + 土星相貌 + Gadbury 方位/距离/应期
5. 合成：判据命中加权（Bonatti 判据 +1，专项 +1.5，月亮空亡/燃烧 -2 等）
输出：{ verdict, score(≥0成/≤0败), keyFactors[], timeHint, suspectProfile?, locationHint?, sources[] }
```

### 4.4 输出 schema（目的端统一）
```
{
  domain: 'horary',
  questionType: '盗窃失物' | '买卖' | '婚姻' | '诉讼' | '出行' | '比赛' | '一般',
  chartTime: '2026-10-18 12:00 (+08)',
  verdict: '倾向成' | '倾向败' | '中性',
  score: 3.5,
  keyFactors: [{factor:'月亮空亡', weight:-2, detail:'月离土星不入新相位', source:'Bonatti146'}],
  timeHint: '短则数日，长不过数周（移动星座主导）',
  special: { locationHint:'西南，近水/低处', suspectProfile:'年轻、面色土黄、圆脸' },
  sources: ['规则库-Bonatti146.xlsx', '规则库-Griffin盗窃卜卦.xlsx']
}
```

## 五、后续批次（每域实现顺序）
1. **C 卜卦**（本轮第一批：通用盘面 + 盗窃失物专项）
2. **A 本命**：子表消费进尊贵计算（界/面逐度化、三分主星校验 dignity_tables.json）、行星条件判定（planetary_conditions.json 得时/失时/灼烧/东出西没）→ 本命性格/领域输出
3. **B 推运**：法达（firdaria.json）、小限（profections.json）接入计算 + 应期合成
4. **D 择时**：候选时间窗批量扫描 → 吉凶评分曲线（用 Bonatti4宫/Clavis 择时判据）
5. **E 合盘**：比较盘相位 + Valens 双星组合表
6. **F 世俗**：蚀图/合相图 + Tetrabiblos II/MashallahEclipses 判据

## 六、界面落地（最终端）
左侧排盘区保留（技术层），右侧输出按目的域切换：
- 顶部新增"结果目的"选择器：本命解读 / 推运应期 / 卜卦问答 / 择时 / 合盘 / 世俗
- 选"卜卦问答"时：输入区变为 问题类型下拉 + 问事时间，输出区出 verdict 卡片
- 选"本命解读"时：输出区按 性格/体质/财富/职业/婚姻/子女 分区
