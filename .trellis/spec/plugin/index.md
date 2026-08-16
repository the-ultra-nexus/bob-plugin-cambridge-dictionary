# Plugin Development Guidelines

> Coding guidelines for the Bob translation plugin in this repository.

---

## Overview

This project is a single-entry **Bob plugin** (`bob-plugin-cambridge-dictionary`, "剑桥词典中英文翻译") that translates English words to Simplified Chinese by scraping the Cambridge Dictionary website. It is not a web frontend: there are no components, hooks, or UI state.

The runtime surface is exactly one bundled file (`dist/main.js`, built from `src/entry.ts`). Everything else is tooling (build/packaging) or stale scaffolding that must not be extended.

---

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Architecture](./architecture.md) | Plugin lifecycle, file ownership, dead-code boundaries |
| [Scraping](./scraping.md) | Cheerio selectors and HTML parsing patterns for Cambridge pages |
| [Data Contract](./data-contract.md) | `Part` / `Phonetic` / `toDict` result shape |
| [Error Handling](./error-handling.md) | Query guards, `completion` protocol, logging |
| [Build & Release](./build-release.md) | esbuild bundling, `.bobplugin` packaging, appcast updates |

---

## Key Facts

- Plugin runtime API is `@bob-plug/core` (`Bob.api.$http`, `Bob.api.$log`, `Bob.Cache`).
- Only two lifecycle entry points are exported: `translate(query, completion)` and `supportLanguages()`.
- `src/helper/` contains a copy-pasted Volcengine OpenAPI SDK. Only `types.ts`'s `Part` and `Phonetic` interfaces are consumed by `src/entry.ts`; `service.ts`, `sign.ts`, `fetch.ts`, `utils.ts` are unused and should not be extended or imported.
- Offline page snapshots live in `test/fixtures/*.html` for manual scraping checks; there is no automated test runner.