# Code Reuse Thinking Guide

> **Purpose**: Stop and think before creating new code — does it already exist?

---

## The Problem

**Duplicated code is the #1 source of inconsistency bugs.** In this repository the single most expensive example is the `src/helper/` directory: a copy-pasted Volcengine OpenAPI SDK (~700 lines across `service.ts`, `sign.ts`, `fetch.ts`, `utils.ts`, plus SDK types) that nobody in the actual plugin flow uses. It exists because someone copied the scaffolding without asking "do we need this here?".

When you copy-paste or rewrite existing logic:
- Bug fixes don't propagate
- Behavior diverges over time
- Dead code grows and confuses future agents

---

## Before Writing New Code

### Step 1: Search First

```bash
# Search for similar function names
grep -rn "pushPart\|addMap\|mapToParts\|makePhonetic\|transformToAdditions" src/

# Search for similar logic / selectors before adding a new one
grep -rn "\.ddef_\|\.examp\|\.eg\b" src/
```

### Step 2: Ask These Questions

| Question | If Yes... |
|----------|-----------|
| Does a similar function already exist in `src/entry.ts`? | Use or extend it |
| Is this cheerio selector already used? | Reuse it, don't re-derive |
| Could this be a shared helper? | Add it at `src/` level, **never** in `src/helper/` |
| Am I copying a pattern from an external SDK (volcengine, etc.)? | **STOP** — that is how `src/helper/` dead code happened |

---

## Local Reuse Patterns (already in `src/entry.ts`)

- `pushPart(parts, part, ...means)` — building display part rows.
- `addMap(map, key, value)` + `mapToParts(map)` — aggregating sense means per part of speech.
- `makePhonetic($textEl, $audioEl, type)` — both US and UK phonetics.
- `transformToAdditions(parts)` — flattening `Part[]` into `additions` display rows.

If you need a new display aggregation, extend these — do not write a second aggregation loop.

---

## Anti-Patterns Specific to This Repo

1. **Copying the SDK**: `src/helper/service.ts` / `sign.ts` / `fetch.ts` already duplicate `@volcengine/openapi` (an optionalDependency). Never copy more of that SDK in.
2. **Duplicate parse loops**: re-implementing `addMap`/`pushPart` inline in a new feature instead of reusing them.
3. **Repeated selector literals**: scatter `.entry-body__el`, `.ddef_b`, etc. across new code instead of following the pattern in `src/entry.ts` (and `spec/plugin/scraping.md`).
4. **New dead scaffolding**: adding a util file nobody imports, "just in case" (see `utils.ts`'s `createDebug` — created, imported by dead code only).

---

## When to Extract

Extract a new module only when logic genuinely grows beyond `entry.ts` (e.g., a dedicated parser for a new page shape, plus fixtures to verify it). Keep extraction at `src/` level (e.g., `src/parser.ts`), tied to a fixture in `test/fixtures/`, not a copy-paste of an external SDK.