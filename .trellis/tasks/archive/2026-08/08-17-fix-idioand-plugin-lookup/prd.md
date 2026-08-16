# 修复 plugin 与多词短语查词无结果

## Goal

修复两个真实用户场景查不到翻译结果的问题：

1. **`plugin`（单数）**：剑桥 英语-汉语-简体 词典没有 `plugin` 词条（收录在 `plug-in` 下）。当前插件请求 `.../plugin`，剑桥直接 302 跳词典首页 → 无 `.headword` → notFound。
2. **`dig (deep) into your pocket(s)/resources/savings`（多词习语）**：`translate()` 的字数守卫 `split(" ").length > 3` 直接拦截（5 个 token，请求未发出）；即使放行，`split(" ").join("-")` 不做清洗/编码，括号+斜杠会生成 404 URL。

## Requirements

- R1. 放宽/修正 `translate()` 查询守卫：支持至多 8 个空格分隔 token 的多词短语/习语；同时设 slug 长度上限作为句子级输入的兜底拦截。
- R2. 新增 slug 清洗函数：空白归一、空格→`-`、非 `[\w-]` 字符（`(` `)` `/` `,` `'` 等）→ `-`、合并连续 `-`、去首尾 `-`；**保留大小写**（iPhone/eBay 等专有名词不能破坏）。构造 URL 时对 slug 做 `encodeURIComponent`。
- R3. 统一双站管道：请求 1 = 英文站 `/dictionary/english/{slug}`（唯一解析入口：词条精确命中、拼写变体 `plugin`→`plug-in`、近形短语 slug 均会 302/200 到 canonical 词条页），提取 `.headword` 得 canonical slug；请求 2 = zhs 双语站 `.../{canonicalSlug}` 抓取完整双语内容。**全链路最多 2 次请求**，无死循环。英文站页面仅作解析器（其内嵌中文是截断预览，不得作为输出源）。
- R4. 修复请求 handler 的既有缺陷：先检查 `res.error` 再解析；网络错误路径不得 `load(undefined)` 抛异常，必须走 `completion({ error: { type: 'notFound' } })`。
- R5. 输出格式与 v1.0.6 完全一致：不动 `main()` 的解析/组装逻辑，不动 Bob `toDict` 的 additions 结构。
- R6. 兼容既有行为：`break down` / 习语短语等现有查询的输出不回退；请求次数语义从「普通词 1 次」统一为「每次查询 ≤2 次」（en 解析 + zhs 双语）。

## Acceptance Criteria

- [ ] AC1. `plugin` 返回 `plug-in` 词条完整翻译，中文释义含 "（计算机程序的）…"。
- [ ] AC2. `dig (deep) into your pocket(s)/resources/savings` 返回该习语词条（页面实测含中文译文，如例句 "在应对诸如污染这样的全球问题时，富国必须掏更多的钱。"）。
- [ ] AC3. 不存在的词（如 `asdfqwzx`）返回 notFound；**全链路最多 2 次网络请求**（垃圾词 1 次即终止），无死循环，`completion` 恰好调用一次。
- [ ] AC4. 每次成功查询 ≤2 次请求（en 解析 1 + zhs 双语 1）；`test/fixtures/*.html` 离线解析结果与 v1.0.6 逐项一致（用 `/tmp/verify-final.js` 类断言脚本回归）。
- [ ] AC5. 网络错误（断网/超时）路径不抛异常、返回 notFound 或合理错误。
- [ ] AC6. iPhone/eBay 等大小写专有名词可正常查询（大小写不被 slug 清洗破坏）。
- [ ] AC7. 新增 `plug-in.html`（zhs 词条页）与 `dig-idiom.html`（习语 canonical 页，含 `?q=` 重定向形态）两个 fixture，离线验证可解析出 headword + 中文 `.trans`。

## Constraints / Non-Goals

- 不改剑桥输出格式（additions 组装、60 `=` 分隔线、`> CN` 前缀、`① ②` 编号等全部保持）。
- 不进入 `src/helper/`（死代码，只读）。
- 不引入新依赖；只在 `src/entry.ts` 内做私有顶层函数。
- 版本按 patch 提升（1.0.6 → 1.0.7），发布流程遵循 `build-release.md`。
- 英文站页面仅作为"解析器"使用（其内嵌中文是截断预览 `…`），**不**直接解析英文站内容作为结果。