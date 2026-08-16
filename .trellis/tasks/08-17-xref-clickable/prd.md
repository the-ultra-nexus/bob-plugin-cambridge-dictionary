# 习语/短语动词改为 relatedWordParts 可点击

## Goal

将习语和短语动词从 `additions`（纯文本）移出，放入 `relatedWordParts`（Bob 原生字段，`word` 蓝色可点击跳查），使其在保持各自词性分组的同时支持点击跳查。

## 改动

- `src/entry.ts`：移除 `collect` 中 xref 追加到 `lines` 的逻辑，改为收集到 `xrefs` 数组，后处理构建 `relatedWordParts`
- 移除不再需要的 `numbered`、`xrefSeq`、`circle` 变量
- `relatedWordParts` 格式：`{ part: "verb 习语", words: [{ word: "dig your heels in" }, ...] }`
- 添加到 `toDict` 结果中

## Acceptance Criteria

- [ ] dig: verb 习语/短语动词出现在 `relatedWordParts` 可点击
- [ ] wet: adjective 习语和 verb 习语各自分组
- [ ] `additions` 中不再包含习语/短语动词行
- [ ] esbuild 打包通过