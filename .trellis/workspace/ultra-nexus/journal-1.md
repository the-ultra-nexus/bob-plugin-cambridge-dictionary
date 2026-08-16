# Journal - ultra-nexus (Part 1)

> AI development session journal
> Started: 2026-08-16

---

## 2026-08-17 — task: fix-idioand-plugin-lookup

- 用户反馈 `plugin` / `dig (deep) into your pocket(s)/resources/savings` 查词无结果。
- 根因（实测）：① 守卫 `split(" ").length > 3` 拦截多词短语；② URL 未清洗未编码（括号+斜杠 → 404）；③ 剑桥双语站把 plugin 索引在 plug-in 下，`/plugin` 302 跳首页。
- 设计迭代：初始「zhs→en fallback→zhs」= 最坏 3 请求；用户要求 ≤2 → 改为**统一 en→zhs 双站管道**（en 解析 canonical headword → zhs 抓双语），请求预算 1–2，全质量输出。
- 已验证的剑桥机制（写入 design.md）：双语路径不解析变体；en 路径不带完整中文；en 词条页中文是截断预览。
- 实施：buildSlug + 守卫 token≤8/slug≤64 + lookup/resolveHeadword；main() 零改动；R4（handler 先判错）顺手修复；新增 3 个 fixture。
- 验证：基线 31/31、新 fixture 5/5、e2e（plugin→plug-in、dig 习语、垃圾词 1 请求 notFound、请求计数 ≤2）全绿；trellis-check 放行；补 canonicalSlug 空值防御。
- 版本 1.0.6 → 1.0.7（patch）；dist 重建；release/ + appcast 留给用户发布时 `node build.js --release`。
- 待用户侧：Bob 手工验收（含 $http 302 跟随行为确认、断网路径）。
