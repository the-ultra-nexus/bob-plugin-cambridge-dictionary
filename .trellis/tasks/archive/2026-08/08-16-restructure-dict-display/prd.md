# 重构词典展示为紧凑词性分组

## Goal

重构 `src/entry.ts` 的 `toDict` 组装：用 Bob 原生 `parts`（词性分组）承载「词性 → 释义 + 例句跟随块」，替换现有的 additions 平铺键值 + parts 聚合三明治结构。目标：排版清晰直观、占空间小、内容不重复。

## Background / 确认事实

- Bob `toDict` 官方结构：`phonetics`（音标 us/uk）、`parts`（`{part, means[]}` 词性词义）、`exchanges`（变形）、`additions`（附加内容，官方示例即"例句"）。渲染无 CSS 控制，手段 = 结构 + 文本格式。
- 现状（`7a4ee9e` 之后）：additions 承载全部展示（`adverb-英文释义`/`adverb-中文释义`/`例句n` 平铺键值，词性标签重复 12 次），parts 单独聚合中文释义导致内容重复。
- 剑桥原文提取中发现：部分释义块**没有独立中文释义**（`def-body` 第一个子元素直接是例句块），旧逻辑 `$('.ddef_b').children().first()` 把例句文本误当中释（not 页第 4、5 块）。
- 英文释义 `.ddef_h` 的 text() 会包含等级徽章（A1/A2），纯释义应取 `.ddef_d`。

## Requirements

1. `parts` 词性分组：每个 `.entry-body__el` 一个 `{part, means}`，`part` 为 `.posgram`（短语回退 `.anc-info-head`）trim 后的文本。
2. `means` 平铺顺序，每释义块：
   - 释义行：`{序号}. {英文释义}  {中文释义}`（序号整词条全局连续，跨词性组；英文取 `.ddef_d`；中文取 `.def-body .trans` 首个，**取不到则跳过中文**，不输出空行也不误用例句）。
   - 例句行（≤2，沿用 `MAX_EXAMPLES_PER_DEF`）：`• {英句}  {中句}`（中句取 `.examp` 内 `.trans` 首个，取不到则省略）。
3. `phonetics` 不变（us/uk）；`additions` 置空数组；`word`、`from`/`to`、`fromParagraphs`/`toParagraphs`、`raw` 不变。
4. 请求、守卫、`notFound`、`completion` 恒一次调用等行为不变。
5. 清理不再使用的旧 helper（`pushPart`/`addMap`/`mapToParts`/`transformToAdditions`）。

## Acceptance Criteria

- [ ] `parts` 每个词性一个分组，`means` 为释义行+例句行平铺，无重复键值行
- [ ] 释义行序号整词条全局连续（多词性组之间不断号）
- [ ] 英文释义不含 A1/A2 徽章前缀
- [ ] 无中释义的块不输出中文行（not 页第 4、5 块行为正确）；例句中译缺失时例句行省略中译
- [ ] 每释义块例句 ≤ 2（`MAX_EXAMPLES_PER_DEF` 保留）
- [ ] 用 `test/fixtures/break-down.html`、`build.html`、`iceberg.html` + 新抓的 not 页验证全部通过（`pursuer.html` 为 build 过期副本，不作依据）
- [ ] `completion` 恒被调用一次，`notFound` 路径不变；esbuild 打包通过
- [ ] 更新 `.trellis/spec/plugin/scraping.md` 与 `data-contract.md`；README 展示描述同步

## Out of Scope

- Bob 客户端 means 多行/行首空格的渲染行为（需真机验证；工具链兜底：例句行仅用 `•` 区分，不依赖缩进）
- `exchanges` 词形变化、等级徽章展示
- 请求/抓取选择器结构调整（仅改文本提取与组装）

## Technical Notes

- 序号：整词条全局连续计数（`senseNo++` 跨 `entry-body__el` 不重置）。
- 中文提取：`$('.def-body .trans', block).first().text()`（`def-body` 即 `.ddef_b`）；例句内中文：`$('.trans', ex).first().text()`。
- 展示示例（not, adverb）：
  ```
  ▍adverb ▍
    1. used to form a negative phrase...（用于 be，can...）不
       • He's not fat!  他不胖！
       • I won't tell her.  我不会告诉她。
    2. ...
  ```