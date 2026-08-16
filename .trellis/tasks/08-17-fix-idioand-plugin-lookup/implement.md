# Implement: 修复 plugin 与多词短语查词无结果

## 执行清单（顺序执行，每步含验证）

### Step 1 — 现状基线
- [ ] 用现有 fixtures 跑一遍解析基线：构造或复用 `/tmp/verify-final.js`（31 断言），确认 v1.0.6 输出快照。
- [ ] 记录每次 `query.text` 的现有 URL 与结果行为（`read` 核对 `src/entry.ts` `translate()` 当前守卫与 handler）。

### Step 2 — 实现改动（`src/entry.ts` 单文件）
- [ ] 新增 `buildSlug(text)` 顶层私有函数（设计 §1）。
- [ ] 修改 `translate()` 守卫：token≤8、slug 非空且 ≤64（设计 §2）。
- [ ] 新增 `ZHS_PREFIX` / `EN_PREFIX` 常量；slug 拼接 `encodeURIComponent`（设计 §3）。
- [ ] 新增 `hasHeadword(file)`；重构为统一 en→zhs 管道：`lookup` 封装（先查 `res.error` → notFound，再判 headword）、`resolveHeadword(slug, completion)` 请求 1、`main` 解析请求 2（设计 §4）。
- [ ] 回归确认：`main()` 函数体（解析/组装/`MAX_EXAMPLES_PER_DEF`/`makePhonetic`）未做任何语义改动；英文站页面只提取 `.headword`，绝不使用其截断中文预览；`supportLanguages`/`buryPoint` 未动。

**验证门 G1（实现后）**：`node build.js`（非 watch 用直接构建，确认 `dist/main.js` 生成）后跑：
- 离线 fixture 断言脚本全绿（输出与基线逐项一致）；
- 新增 fixture 断言：`plug-in.html`、`dig-idiom.html` 有 headword + 中文 `.trans`；
- 端到端 node 脚本：`plugin` / `dig (deep) into your pocket(s)/resources/savings` / `asdfqwzx` / `break down` / `iPhone` 真实 HTTP 请求全链路，记录 headword 与请求次数（≤2）。

### Step 3 — 版本与构建
- [ ] `package.json` version `1.0.6 → 1.0.7`。
- [ ] 本地 `node build.js -- --no-watch?`（若 build.js 默认 watch）：产物到 `dist/` 用于 Bob 本地导入测试。
- [ ] README 如涉版本/截图为单次构建产物则同步（不主动改宣传文案）。

**验证门 G2（构建后）**：`dist/*.bobplugin` 存在且含新逻辑（`grep buildSlug dist/main.js`）；包装为最终 `release` 前先手工 Bob 测试。

### Step 4 — 手工 Bob 验收（用户侧）
- [ ] Bob 导入 `dist` 包，依次查询：`plugin`、`dig (deep) into your pocket(s)/resources/savings`、`break down`、`call it a day`、`iPhone`、`asdfqwzx`（应 notFound）。
- [ ] 对拍输出格式与 v1.0.6：普通词条（如 `book`）样式/分隔线/`> CN` 前缀一致。

### Step 5 — 规范更新（Phase 3.3）
- [ ] `.trellis/spec/plugin/error-handling.md`：守卫规则 `>3` → 新规则（token≤8 + slug≤64）；known weakness（handler 先解析后判错）标记为已修复并改为推荐模式；补充 en→zhs 统一管道说明。
- [ ] `.trellis/spec/plugin/architecture.md`：数据流图改为 en→zhs 两段管道；URL 段说明补 `EN_PREFIX` 与 `encodeURIComponent(slug)`。
- [ ] `.trellis/spec/plugin/scraping.md`：Selectors 无变化；fixtures 列表追加 `plug-in.html`、`dig-idiom.html`、`en-plug-in.html` 三个 fixture 形态说明；备注 en 页面仅提取 `.headword`。
- [ ] 新增 fixture 文件：`test/fixtures/plug-in.html`（zhs 双语词条页）、`test/fixtures/dig-idiom.html`（zhs 双语习语 canonical 直连页）、`test/fixtures/en-plug-in.html`（en 词条页，resolution 用）。
- [ ] implement.jsonl / check.jsonl 填入规划引用的 spec 文件（错误处理/架构/抓取/构建发布）。

### Step 6 — 提交
- [ ] `git status` 核对改动集合（src/entry.ts、package.json、fixtures、spec、release 产物）。
- [ ] 提交信息按仓库习惯（feat:/fix:），关联任务摘要。
- [ ] （可选）`node build.js --release` 由用户在确认发布时执行，自动更新 appcast.json。

## 回滚点

- R1（实现前）：`git stash` 即回滚 working tree。
- R2（构建后、提交前）：删除 `dist/` 新产物 + 还原 `src/entry.ts`、`package.json`。
- R3（提交后）：`git revert` 该 commit；发布未推送时直接 reset。

## 验收映射

| AC | 验证门 |
|----|--------|
| AC1 plugin→plug-in | G1 端到端 + G2 + Step4 手工 |
| AC2 dig 习语 | G1 端到端 + Step4 手工 |
| AC3 不存在词/请求≤2/无死循环/completion 一次 | G1 端到端记录请求次数 + 代码走查 |
| AC4 每次查询 ≤2 次 + fixtures 回归 | G1 离线断言 + 端到端请求计数 |
| AC5 网络错误不抛异常 | 代码走查（handler 先判错）+ 断网手工测试 |
| AC6 大小写专名 | G1 端到端 `iPhone` |
| AC7 新 fixture | G1 离线断言 |