# Error Handling

## Query Guards (in `translate()`)

All guards return `completion({ error: { type: 'notFound' } })` **before any network call**:

1. `query.detectFrom !== 'en'` — the plugin serves en→zh-Hans only.
2. `!query.text` — empty text.
3. `query.text.split(' ').length > 3` — Cambridge dictionary is word/short-phrase level; longer input hits the wrong page shape. (Phrases up to 3 words are normalized to a hyphenated slug: `query.text.split(' ').join('-')`.)

## `completion` Protocol

Two shapes only — success `{ result: {...} }`, failure `{ error: { type: 'notFound' } }`. Keep the dictionary page's "no entry" case in `main()` on the same path: no `.headword` node → `notFound` (see `hasWord` check).

## Logging

- Use `Bob.api.$log.info(...)` / `Bob.api.$log.error(...)` for diagnostics (the plugin runs inside Bob; console output is invisible to users).
- Avoid `console.log` — `src/entry.ts` has one stray `console.log('explanationCnt', ...)`; replace it with `Bob.api.$log` when touched rather than copying the pattern.

## Known Weakness — fix when touching the request handler

The current HTTP handler in `translate()`:

```ts
handler: (res) => {
  main(res.data, completion);   // runs even when res.error is set
  if (res.error) { Bob.api.$log.error(...); }
}
```

This parses potentially-garbage data on error responses. Preferred pattern:

```ts
handler: (res) => {
  if (res.error) {
    Bob.api.$log.error(`reserr: ${JSON.stringify(res.error)}`);
    completion({ error: { type: 'notFound' } });
    return;
  }
  main(res.data, completion);
}
```

## Anti-Patterns

- Returning `notFound` only after the network call when a synchronous guard would have caught it.
- Producing a `result` with an empty `toDict` instead of an error when the page clearly has no headword.
- Swallowing exceptions from the parse step — `main()` has no try/catch; `completion` must always be called exactly once per `translate` invocation on all paths.