# 词典输出格式改为词性分组 + `*` 分隔

## Goal

将 `src/entry.ts` 的输出格式从当前平铺式 additions 改为按词性（part of speech）分组聚合的样式。顶部显示词性概要（各词性中文释义 `；` 拼接），每词性详细内容用 `*` 分隔，词性标签作为区块标题。

## 确认事实

- 当前代码已正确提取每个 `.entry-body__el`（对应一个词性）的数据：词性标签、dsense 释义块、习语/短语动词 xref、中文释义、例句等。
- 当前 `additions` 结构：先 unshift `cnGroups`（词性级中文释义汇总），再按 DOM 顺序平铺 dsense_h 分组、习语、短语动词。
- 当前 `cnGroups` 中每词性一条，`name = posTitle`（如 `wet adjective`），`value = 每行一个中文释义`。
- 当前普通释义块的中文释义已从详细区域移除，只出现在 `cnGroups` 汇总中。
- Bob 的 `additions` 渲染顺序固定：`name` 非空时显示为区块标题，空时只显示 `value` 文本。
- 测试 fixtures：`dig.html`（verb + noun）、`not.html`（仅 adverb）、`wet.html`（adjective + verb + noun）。

## Requirements

### 总体格式

```
[phonetics: us/uk 音标]
[exchanges: 词形变化]

[pos_label_1：cn1；cn2；cn3]
[pos_label_2：cn1；cn2；cn3]

************************************************************
[pos_label_1]
[详细释义内容]
[习语/短语动词]

************************************************************
[pos_label_2]
[详细释义内容]
[习语/短语动词]
```

### 顶部区域（Bob phonetics + exchanges 维持不变）

- `phonetics`：音标 us/uk（不变）
- `exchanges`：词形变化（不变，如 `present participle: digging`）

### 词性概要（additions 第一条）

- 每词性一行，格式：`<词性标签>. <中文释义1>；<中文释义2>；<中文释义3>`
- 词性标签取 `.posgram > .pos` 的纯词性名（如 `verb`、`noun`、`adjective`、`adverb`），不包含语法标签如 `[T]`、`[C]`
- 中文释义取自该词性下所有普通释义块（非词组面板）的 `.def-body > .trans`，去重保序，用 `；` 拼接
- 多词性时多行（`\n` 分隔）
- `name` 为空字符串，`value` 为拼接后的概要文本

### 分隔线（additions 第二条）

- `name` 为空字符串
- `value` 为 `************************************************************`（60 个 `*`）

### 词性详细区（additions 后续条目）

- 每词性一条 addition，`name` = 纯词性标签（如 `verb`、`noun`、`adjective`、`adverb`）
- `value` 包含该词性下所有详细释义内容：
  - 每组 dsense 块按 DOM 顺序
  - 等级 + 语法标签（如 `B1 [ I or T ]`）一行
  - 英文释义 （`.ddef_d`）
  - 中文释义（`.def-body > .trans`）：`> 中文释义`（`> ` 前缀）
  - 例句（≤2）：`• 英句  中句`
  - 词组面板标题用 `(title)` 圆括号包裹
  - 普通释义块后空行分隔
- 习语和短语动词按 DOM 位置插入，格式同当前（`①`、`②` 序号前缀），`name` 不重复添加（已包含在词性 addition 的 value 内）
- 多词性之间用分隔线 `*` 条目隔开

### 点击标注

- 示例中的 `{可点击}`、`{同上}`、`{按照；分割组合}` 等标注均为给开发者的说明，**不出现在实际输出中**
- 习语、短语动词、词形变化保持当前 Bob 渲染方式（exchanges 可点击跳查，additions 文本显示）

## Acceptance Criteria

- [ ] `dig` 输出：顶部 `verb：挖，挖掘（土）；凿出，打（洞）` + `noun：C1（考古）挖掘；挖苦`（或页面实际内容），`*` 分隔后接 verb 详细区 → `*` → noun 详细区
- [ ] `not` 输出：顶部 `adverb：不；没；...`（或页面实际内容），`*` 分隔后接 adverb 详细区，无变形留空
- [ ] `wet` 输出：顶部 `adjective：湿的；潮湿的` + `verb：弄湿`，`*` 分隔后接 adjective 详细区（含习语）→ `*` → verb 详细区（含习语）
- [ ] 词性标签取纯词性名（`verb`/`noun`/`adjective`/`adverb`），不含语法标签
- [ ] 中文释义在概要行用 `；` 拼接，在详细区也恢复显示
- [ ] 分隔线 `*` 出现在词性概要之后、每词性详细区之间
- [ ] 示例中的标注文字（`{可点击}`、`{同上}` 等）不出现在输出中
- [ ] 所有现有测试 fixtures 解析通过

## Out of Scope

- Bob 客户端渲染顺序/样式调整（phonetics → exchanges → additions 固定顺序不变）
- 请求/抓取/选择器逻辑变更（仅改 additions 组装）
- 新增用户配置项
- 词形变化 exchanges 的格式变更
- 音标 phonetics 的格式变更
- 非 `dig/not/wet` 以外的新测试 fixture

## Open Questions

暂无 — 所有用户决策已明确。