# Scraping (Cheerio Parsing)

`src/entry.ts` parses Cambridge dictionary HTML with cheerio. All selector patterns below are load-bearing — keep them in sync with the live site and the fixtures.

## Selector Map

All from `main(file, completion)` in `src/entry.ts`:

| Data | Selector | Notes |
|------|----------|-------|
| Word | `.headword` first node, `.text()` | Also used as the presence check via `.html()` |
| US phonetic | `.us .pron .ipa` | `makePhonetic(..., 'us')` |
| US audio | `.us [type="audio/mpeg"]`, `attr('src')` | Prefixed with base URL: `https://dictionary.cambridge.org${src}` |
| UK phonetic | `.uk .pron .ipa` | `makePhonetic(..., 'uk')` |
| UK audio | `.uk [type="audio/mpeg"]` | |
| Part of speech | `.posgram`; fallback `.anc-info-head` | Phrase entries use `.anc-info-head` instead of `.posgram` |
| Entry container | `.entry-body__el` | One per part-of-speech block |
| Sense | `.dsense` (nested in entry) | |
| Definition block | `.def-block` (nested in sense) | |
| EN definition | `.ddef_d` (in `.ddef_h`), `.text()` | Pure definition text; `.ddef_h` includes the level badge (A1/A2) — use `.ddef_d` to exclude it |
| CN definition | `.def-body .trans` first node, `.text()` | `.def-body` is `.ddef_b`. Some blocks have **no** CN translation (first child is the example block) — skip the CN row when empty instead of misreading an example |
| Example block | `.examp` (nested in def-block) | |
| Example EN | `.eg`, `.text()` | |
| Example CN | `.trans` first node inside the `.examp`, `.text()` | Not a sibling `.next()` — inside recent page markup the CN translation lives inside `.examp` |

## Assembly Pattern (parts grouping)

The parser produces Bob `parts` directly — one group per part of speech, means flat in page order:

- Per `.entry-body__el` (part of speech): `part = (.posgram || .anc-info-head).trim()`.
- Per `.def-block`: one sense row `` `${senseNo}. ${en}  ${cn}` `` (global `senseNo` counter across all groups; CN omitted when the block has no CN translation), then up to `MAX_EXAMPLES_PER_DEF` example rows `` `• ${enExample}  ${cnExample}` `` (CN omitted when missing).
- `toDict.additions` stays `[]`; all display content lives in `parts`.

## Example Cap

Every def-block contributes **at most 2 examples** (`MAX_EXAMPLES_PER_DEF = 2` in `src/entry.ts`), numbered `例句1`, `例句2` contiguously within the block. This replaced an older inconsistent rule (unlimited for single-POS words, 1 for multi-POS words). Keep the cap when refactoring the parse loop.

## Fixtures for Offline Checks

`test/fixtures/` holds saved page snapshots (no automated runner — verify by parsing a fixture in a scratch script):

- `break-down.html` — phrase entry (`break down`), uses `.anc-info-head`.
- `build.html` — multi-part-of-speech verb/noun entry, uses `.posgram`.
- `iceberg.html` — single part-of-speech word.
- `not.html` — 6 sense blocks where two blocks have **no CN translation**; exercises the CN-skip behavior.
- `pursuer.html` — ⚠️ **stale duplicate of `build.html`** (same `<title>build...`). Do not use it as authoritative; prefer a fresh snapshot when testing new shapes.

## Anti-Patterns

- Using `.text()` on `.ddef_h` for definitions (picks up the A1/A2 badge) or relying on the first child of `.def-body` being the CN translation (blocks without CN start with the example block — check `def-body .trans` first instead).
- Assuming every entry has `.posgram` — phrases need the `.anc-info-head` fallback.
- Building the audio URL without the `baseUrl` prefix.
- Relying on the live page structure without re-checking the fixtures after a Cambridge markup change (site updates have broken this parser before).