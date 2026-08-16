# 修复词性尾部空格与例句数量逻辑

## Goal

修复 `src/entry.ts` 抓取解析的两个展示问题：

1. 聚合的 partMap key（词性名）带尾部空格（如 `"— phrasal verb with break "`）。
2. 例句输出数量规则不统一：单词性词不限条数、多词性词每释义块仅 1 条。
   现统一改为：**每个 def-block 最多 2 条例句**。

## Scope

- 修改文件：`src/entry.ts`（`main()` 内词性提取与例句收集逻辑）
- 验证方式：用 `test/fixtures/*.html` 离线跑解析，断言输出
- 不改动：请求 URL、发音、`additions`/`parts` 结果结构、`build.js`、版本号（是否发版由开发者决定）

## Acceptance Criteria

- [ ] `partMap` 的 key（词性名）与展示用的 `-英文释义`/`-中文释义` key 均无首尾空白
- [ ] 每个 def-block 最多输出 2 条 `例句n`（原来单义项词可超出）
- [ ] 原「多词性词每块只取 1 条」的特殊分支被替换，逻辑统一
- [ ] 使用 `test/fixtures/break-down.html`、`build.html`、`iceberg.html` 验证通过；
      `pursuer.html` 是 build 的过期副本，不作为依据
- [ ] `completion` 仍恒被调用一次，`notFound` 路径不变