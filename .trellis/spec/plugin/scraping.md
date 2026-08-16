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
| EN definition | `.ddef_h`, `.text()` | |
| CN definition | `.ddef_b`, `.children().first().text()` | Use first child, NOT `.text()` — full text picks up extra wrapper content |
| Example block | `.examp` (nested in def-block) | |
| Example EN | `.eg`, `.text()` | |
| Example CN | `.eg` sibling via `.next()`, `.text()` | The CN translation is the element right after `.eg` |

## Aggregation Pattern (multi-sense words)

Senses are aggregated per part of speech with a `Map<string, string[]>`:

- `addMap(map, key, value)` — push value onto the array for `key`.
- `mapToParts(map)` — convert to `Part[]` (`{ part, means }`).
- Display parts are built with `pushPart(parts, part, ...means)`, using keys like `` `${partOfSpeech}-英文释义` ``, `` `${partOfSpeech}-中文释义` ``, and `` `例句${n}` `` (value is `enExample\ncnExample`).
- `transformToAdditions(parts)` — flattens each part to `{ name, value: means.join(';') }` for the `additions` display rows.

## Example Dedup

When a word has multiple `.entry-body__el` blocks (`explanationCnt > 1`), only the **first** example of each def-block is collected (`shouldPushEg` flag resets per def-block). This keeps the result compact for multi-definition words. Preserve this behavior when refactoring the parse loop.

## Fixtures for Offline Checks

`test/fixtures/` holds saved page snapshots (no automated runner — verify by parsing a fixture in a scratch script):

- `break-down.html` — phrase entry (`break down`), uses `.anc-info-head`.
- `build.html` — multi-part-of-speech verb/noun entry, uses `.posgram`.
- `iceberg.html` — single part-of-speech word.
- `pursuer.html` — ⚠️ **stale duplicate of `build.html`** (same `<title>build...`). Do not use it as authoritative; prefer a fresh snapshot when testing new shapes.

## Anti-Patterns

- Using `.text()` on `.ddef_b` (loses the intended first-child boundary) or on `.headword` blocks for the presence check.
- Assuming every entry has `.posgram` — phrases need the `.anc-info-head` fallback.
- Building the audio URL without the `baseUrl` prefix.
- Relying on the live page structure without re-checking the fixtures after a Cambridge markup change (site updates have broken this parser before).