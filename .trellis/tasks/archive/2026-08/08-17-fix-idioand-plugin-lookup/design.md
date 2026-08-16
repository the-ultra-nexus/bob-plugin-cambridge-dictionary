# Design: 修复 plugin 与多词短语查词无结果（v2：统一 en→zhs 管道）

## 背景事实（已实测验证）

| 请求 | 结果 |
|------|------|
| zhs `.../plugin` | 302 → 词典首页（丢词条；无 `.headword`）→ 当前 notFound |
| zhs `.../plug-in` | 200 词条页，含中文 `（计算机程序的）…` |
| zhs `.../dig-(deep)-into-your-pocket(s)/resources/savings`（未清洗） | 404（`/resources` 截断路径）|
| zhs `.../dig-deep-into-your-pockets-resources-savings`（清洗后） | 302 → canonical `dig-deep-into-pocket-s-resources-savings?q=…` → 200 词条页，含 `.headword` + 中文 `.trans` |
| en `.../dictionary/english/plugin` | 302 → `plug-in?q=plugin` → 200 词条页，`.headword` = plug-in |
| en `.../dictionary/english/dig-deep-into-your-pockets-resources-savings` | 302 → canonical `dig-deep-into-pocket-s-resources-savings?q=…` → 200，`.headword` 存在 |
| en `break-the-ice` / `call-it-a-day` / `if-not` | 200 词条页，`.headword` 存在 |
| en 垃圾词 `asdfqwzx` | 302 → en 首页，无 `.headword`（终止条件成立）|
| en `plug-in` 词条页 | 内嵌各语翻译仅为**截断预览**（`（计算机程序的）插件…`），完整中文需双语页 |

剑桥机制结论：
- **zhs 双语站**：对不存在 slug 直接 302 跳首页（无联想）；但**对近形 slug 会 302 到 canonical 词条**（清洗后的 dig 短语一次请求即命中完整双语页）。
- **英文站**：是唯一的"变体解析器"——`plugin`→`plug-in`、近形短语 slug→canonical 全部 302 到正确词条页，`.headword` 即 canonical headword。
- **任何单 URL 都无法同时做到「变体解析 + 完整双语内容」**：双语路径不解析变体，英文路径不带完整中文。因此「≤2 次请求 + 全质量输出」的唯一解是统一双站管道：en 解析 → zhs 双语。

## 架构与数据流（改动前 → 后）

```
改动前：
  query ─> guard(detectFrom / empty / >3词) ─> $http.get(zhs URL, 不编码) ─> main(parse) ─> completion
                 │(handler 先 main 后查 error，网络错误时 load(undefined) 抛异常)

改动后（v2：统一 en→zhs 管道）：
  query ─> guard(detectFrom / empty / token≤8 / slug≠空 / slug≤64 且清洗后有效)
         ─> $http.get(EN {slug})  ...................... 请求 1
                │ 有 .headword → canonicalSlug = buildSlug(headword)
                │ 无 .headword（垃圾词 → en 首页）→ completion(notFound)   [总 1 次，终止]
                ▼
         ─> $http.get(zhs {canonicalSlug}) ............... 请求 2
                │ 有 .headword → main(parse) → completion(result)          [总 2 次]
                │ 无 .headword（en 有而双语站无的边缘词）→ completion(notFound) [总 2 次，终止]
```

**请求预算证明（每条路径都恰好或小于 2 次）**：

| 输入形态 | 请求 1 (en) | 请求 2 (zhs) | 结论 |
|----------|-------------|--------------|------|
| 精确词条（book / break-the-ice / if-not） | headword→canonical | headword→parse | 2 次 ✓ |
| 拼写变体（plugin→plug-in） | 302 后 headword=plug-in | plug-in 双语→parse | 2 次 ✓ |
| 短语近形 slug（cleaned dig 习语） | 302 后 headword 存在 | zhs 再 302→canonical→parse | 2 次 ✓ |
| 不存在词（asdfqwzx） | en 首页无 headword→notFound | 不发 | 1 次 ✓ |
| en 有而双语站无（边缘） | headword 存在 | zhs 无 headword→notFound | 2 次 ✓ |

- 无递归（`resolveHeadword` 只做一次 en 请求，之后 zhs 请求的 handler 不再触发第二次解析），无环。
- `completion` 在每条路径恰好调用一次：`main()` 只在确认 `.headword` 命中后调用，且 `main` 自身只调一次 completion。

## 代码改动点（全部在 `src/entry.ts`）

### 1. slug 清洗（新增私有顶层函数）

```ts
const buildSlug = (text: string): string =>
    text.trim()
        .split(/\s+/)
        .join('-')
        .replace(/[^\w-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
```

- 保留大小写（AC6，iPhone/eBay）；`[\w-]` 之外的 `(` `)` `/` `,` `'` `.` 等一律 → `-`。
- 例：`dig (deep) into your pocket(s)/resources/savings` → `dig-deep-into-your-pockets-resources-savings`（en、zhs 双侧实测均可 302 到 canonical）。
- 清洗后只剩 `[\w-]`，`encodeURIComponent(slug)` 为幂等，仍作为防御性编码保留。
- **zhs canonical slug = `buildSlug(en 页 .headword 文本)`**：headword 含括号/斜杠（如 `dig (deep) into your pocket(s)/resources/savings`）时转出的是近形 slug（`…pockets-resources-savings`），zhs 站会对近形 slug 再 302 到 canonical（已验证），无需依赖 Bob 暴露重定向后的最终 URL。

### 2. 查询守卫

```ts
const tokens = query.text.trim().split(/\s+/);
if (query.detectFrom !== 'en' || !query.text || tokens.length > 8) → notFound
const slug = buildSlug(query.text);
if (!slug || slug.length > 64) → notFound
```

- `>8` token 覆盖本短语（5 token）与更长习语（`there is no such thing as a free lunch` = 9 token 会被挡，属可接受边界；句子级输入保留拦截意图）。
- `slug.length > 64` 作为脏输入兜底：清洗后仍超长 → notFound。

### 3. URL 构造

```ts
const ZHS_PREFIX = 'https://dictionary.cambridge.org/zhs/%E8%AF%8D%E5%85%B8/%E8%8B%B1%E8%AF%AD-%E6%B1%89%E8%AF%AD-%E7%AE%80%E4%BD%93';  // 保留字面量（architecture.md）
const EN_PREFIX  = 'https://dictionary.cambridge.org/dictionary/english';
// 请求 1：`${EN_PREFIX}/${encodeURIComponent(slug)}`
// 请求 2：`${ZHS_PREFIX}/${encodeURIComponent(canonicalSlug)}`
```

### 4. 请求流重构（lookup / resolveHeadword / main）

- 新增唯一请求封装 `lookup(url, onParse, completion)`：`$http.get`；**先查 `res.error`**（log + notFound；修复 R4 既有缺陷：网络错误时不再 `load(undefined)` 抛异常）；再判 `.headword` 存在性。
- 新增 `hasHeadword(file)`：`!!load(file)('.headword').html()` —— 与 `main()` 内部判定同一选择器。
- 新增 `resolveHeadword(slug, completion)`（请求 1 handler）：无 headword → notFound（终止）；有 headword → `canonicalSlug = buildSlug($('.headword').first().text())` → 请求 2（zhs canonicalSlug）→ `main` 解析 / notFound。
- `main()` 函数体（解析/组装/`MAX_EXAMPLES_PER_DEF`/`makePhonetic`）**零语义改动**。
- 英文站页面**只提取 headword**，绝不用其 `.trans`/预览内容作输出（AC 输出格式一致性）。

### 5. 明确不改的部分

- `main()` 解析/组装逻辑、`additions` 结构、`MAX_EXAMPLES_PER_DEF`、`makePhonetic`、`supportLanguages`、`buryPoint`——全部保持原样。
- 不做 slug→canonical 缓存（Bob.Cache）：本次保持管道无状态、预算可预期；缓存留作后续优化（`design.md` 记录）。

## 兼容性与风险

| 风险 | 缓解 |
|------|------|
| Bob `$http` 是否跟随 302 | 若跟随：一次请求内完成解析（en 302→词条页、zhs 近形 302→canonical）；若不跟随：302 响应无 `.headword` → 走 notFound（行为不劣于现状）。手工 Bob 测试时验证 |
| en 页 `?q=` 形态下多词条页 | `.headword` first() 启发式，取首个解析词条，可接受 |
| 大写专名（iPhone） | slug 保留大小写，en/zhs 对大小写均可解析（en 兜底） |
| en 有、zhs 双语无的词（边缘） | 请求 2 notFound（≤2 次内终止）；不尝试第 3 次请求 |
| 每用户查询从 1 次→2 次（快路径回归） | 用户明确要求 ≤2 上限；每请求均为 CDN 快速响应；正确性收益（变体/短语全解）高于一次往返成本 |
| 误伤现有词输出 | fixtures 回归（build/not/dig/wet/iceberg/break-down）+ 新 fixture 离线断言 |

## 测试与验证

1. **离线 fixture 回归**：现有 `test/fixtures/*.html` 6 个页面解析输出与 v1.0.6 一致（31 断言脚本复跑）。
2. **新增 fixture**：
   - `plug-in.html`（zhs 双语 plug-in 词条页）→ 断言 `.headword` + 中文 `.trans`；
   - `dig-idiom.html`（zhs 双语 dig 习语 canonical 直连页）→ 断言 `.headword` + 中文 `.trans`；
   - `en-plug-in.html`（en 词条页，resolution fixture）→ 断言 `.headword` 提取 = `plug-in`。
3. **端到端**：node 脚本真实请求 en→zhs 全链路，断言：`plugin`（headword=plug-in，CN 含 插件）、dig 习语（headword 含 dig (deep)…，CN 存在）、`asdfqwzx`（1 次请求 notFound）、`break down`、`iPhone`；**记录并断言每个查询的 HTTP 请求次数 ≤ 2**。
4. **手工**：Bob 中分别查询 `plugin`、`dig (deep) into your pocket(s)/resources/savings`、`break down`、`asdfqwzx`、`iPhone`；断网路径不抛异常。