# Error Handling

## Query Guards (in `translate()`)

All guards return `completion({ error: { type: 'notFound' } })` **before any network call**:

1. `query.detectFrom !== 'en'` — the plugin serves en→zh-Hans only.
2. `!query.text` — empty text.
3. `query.text.trim().split(/\s+/).length > 8` — Cambridge dictionary is word/short-phrase level (max 8 whitespace-separated tokens; covers idioms like `dig (deep) into your pocket(s)/resources/savings` = 5 tokens, blocks sentence-level input).
4. `!slug || slug.length > 64` — slug is `buildSlug(query.text)`; empty after cleaning, or still longer than 64 chars → notFound (dirty-input backstop).

## Request Pipeline (en→zhs)

Since v1.0.7 every lookup runs the two-stage pipeline (exactly 1–2 HTTP requests, no recursion):

```
buildSlug(query.text) ─> request 1: EN {slug} (resolver)
   │ en page without .headword (e.g. garbage word → en homepage) ─> notFound   [1 request, end]
   ▼ en page with .headword ─> canonicalSlug = buildSlug(headword text)
request 2: ZHS bilingual {canonicalSlug}
   │ no .headword (EN-only edge words) ─> notFound                             [2 requests, end]
   ▼ has .headword ─> main(parse) ─> completion(result)                        [2 requests, end]
```

- EN site is the **only variant resolver** (`plugin`→`plug-in`, near-miss phrase slugs → canonical page). The EN page carries only truncated CN previews — extract `.headword` only, never its `.trans`.
- The ZHS page itself 302s near-miss slugs to the canonical entry (e.g. `dig-deep-into-your-pockets-resources-savings` → canonical) — one request covers it.
- Rationale (verified): ZHS bilingual paths never resolve variants (`/plugin` → homepage); EN paths never carry full CN. ≤2 requests + full-quality output ⇒ this pipeline.

## `completion` Protocol

Two shapes only — success `{ result: {...} }`, failure `{ error: { type: 'notFound' } }`. Keep the dictionary page's "no entry" case in `main()` on the same path: no `.headword` node → `notFound`. Every path (guards / en miss / zhs miss / network error / parse) calls `completion` exactly once; `lookup` verifies `.headword` before delegating to `onParse`, so `main`'s internal `hasWord` check never double-completes.

## Logging

- Use `Bob.api.$log.info(...)` / `Bob.api.$log.error(...)` for diagnostics (the plugin runs inside Bob; console output is invisible to users).
- Avoid `console.log` — `src/entry.ts` has one stray `console.log('explanationCnt', ...)`; replace it with `Bob.api.$log` when touched rather than copying the pattern.

## Request Handler (required pattern — fixed in v1.0.7)

The pre-v1.0.7 handler parsed `res.data` before checking `res.error` (garbage input could reach `load(undefined)`). All `$http.get` calls now go through one `lookup(url, onParse, completion)` wrapper:

```ts
const lookup = (url, onParse, completion) => {
  Bob.api.$http.get({
    url,
    handler: (res) => {
      if (res.error) {
        Bob.api.$log.error(`reserr: ${JSON.stringify(res.error)}`);
        completion({ error: { type: 'notFound' } });
        return;
      }
      if (!hasHeadword(res.data)) {
        completion({ error: { type: 'notFound' } });
        return;
      }
      onParse(res.data);
    }
  });
};
```

Order is load-bearing: `res.error` first, then `.headword` presence, then parse.

## Anti-Patterns

- Returning `notFound` only after the network call when a synchronous guard would have caught it.
- Producing a `result` with an empty `toDict` instead of an error when the page clearly has no headword.
- Swallowing exceptions from the parse step — `main()` has no try/catch; `completion` must always be called exactly once per `translate` invocation on all paths.