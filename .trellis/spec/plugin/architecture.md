# Architecture

## Runtime Shape

The plugin is bundled to a single `dist/main.js` by esbuild (`build.js`), so module boundaries exist only in source. All runtime logic lives in `src/entry.ts` as top-level functions; there is no frontend/backend split, no state store, and no UI layer.

File ownership:

| File | Role | Extend? |
|------|------|---------|
| `src/entry.ts` | All runtime logic: `translate`, `supportLanguages`, cheerio parsing, result assembly, install tracking | Yes — this is the only active code |
| `src/helper/types.ts` | Type interfaces; only `Part`, `Phonetic`, `TTS` are used by `entry.ts` | Only the used subset; see [Data Contract](./data-contract.md) |
| `src/helper/service.ts`, `sign.ts`, `fetch.ts`, `utils.ts` | Copied Volcengine OpenAPI SDK (`@volcengine/openapi` already exists as an optional dependency) | **No** — dead code, not imported anywhere |
| `test/fixtures/*.html` | Saved Cambridge dictionary pages for offline scraping checks | Yes — add snapshots of new word shapes |
| `static/icon.png` | Plugin icon (packed into every `.bobplugin`) | Rarely |
| `appcast.json` | Update feed; written by `build.js --release` | No — generated |
| `build.js` | Bundle + zip + appcast pipeline | Yes, for build changes |

## Bob Plugin Lifecycle

The bundle must export the standard Bob plugin functions (see `src/entry.ts`):

- `translate(query, completion)` — the only translation path.
- `supportLanguages()` — returns `['zh-Hans', 'en']` (en→zh-Hans only; the `otherLang` / `langMap` / `items` arrays in `entry.ts` are leftover dead code and must not be extended — if the plugin ever supports more languages, also update `INFO_JSON.category`/landing docs).

Packaging metadata lives once, in `build.js` `INFO_JSON` (mirrors `package.json` fields plus `identifier`, `category: "translate"`, `minBobVersion: "0.8.0"`).

## Data Flow

```
query ──> guard (detectFrom / empty / token≤8 / buildSlug 非空且 ≤64)
   ──> request 1: Bob.api.$http.get(EN {slug})        // variant resolver (plugin→plug-in, phrases)
   │      no .headword (garbage → en homepage) ─> notFound          [1 request, end]
   ▼      yes ─> canonicalSlug = buildSlug(.headword text)
   ──> request 2: Bob.api.$http.get(ZHS bilingual {canonicalSlug})  // full bilingual content
   │      no .headword (EN-only edge) ─> notFound                   [2 requests, end]
   ▼      yes ─> cheerio load(res.data) ─> main parse (phonetics, additions)
   ──> completion({ result })   |   completion({ error: { type: 'notFound' } })
```

Every query = 1–2 HTTP requests (no recursion). `buildSlug` normalizes input (`( ) / , ' .` → `-`, case preserved) before both requests; both URLs use `encodeURIComponent(slug)` (identity for the `[\w-]`-only slug, kept defensively).

URL roots (start with the fixed zh-CN entry / the English resolver; Chinese path segments stay as literal percent-encoded text):

- `ZHS_PREFIX = 'https://dictionary.cambridge.org/zhs/词典/英语-汉语-简体/'` (percent-encoded literal)
- `EN_PREFIX = 'https://dictionary.cambridge.org/dictionary/english/'`

## Rules

- New parsing/extraction helpers belong as private top-level functions in `src/entry.ts` or, if they grow, in a new focused module at `src/` level — never inside `src/helper/`.
- Never `import` from `src/helper/service.ts`, `sign.ts`, `fetch.ts`, or `utils.ts` (`fetch.ts` pulls in axios + `createDebug`, which is dead weight in the bundle).
- Do not remove the existing `src/helper/` files casually (they are referenced by `package.json` optionalDependency docs), but treat them as read-only legacy.
- Follow the existing style: ordinary `function` declarations (no classes), `const` + arrow functions inside, 4-space indent, semicolons.