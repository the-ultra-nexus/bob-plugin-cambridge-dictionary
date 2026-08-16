# Scraping (Cheerio Parsing)

`src/entry.ts` parses Cambridge dictionary HTML with cheerio. All selector patterns below are load-bearing — keep them in sync with the live site and the fixtures.

## Selector Map

All from `main(file, completion)` in `src/entry.ts`:

| Data | Selector | Notes |
|------|----------|-------|
| Word | `.headword` first node, `.text()` | Also used as the presence check via `.html()` |
| US phonetic | `.us .pron .ipa` | `makePhonetic(..., 'us')`; audio via `.us [type="audio/mpeg"]` `src` prefixed with `https://dictionary.cambridge.org` |
| UK phonetic | `.uk .pron .ipa` | Same pattern as US |
| Part of speech label | `.posgram > .pos` text | Body of the part-of-speech title (e.g. `adjective`, `verb [ T ]`) — NOT the full title |
| Full POS title | `.di-title .headword` + `.posgram` text | e.g. `wet adjective`, `dig noun [ C ]`, `not adverb`; phrase entries fall back to `.anc-info-head > .pos` (`break down phrasal verb`) |
| Entry container | `.entry-body__el` | One per part-of-speech block |
| Group heading (guide word) | `.dsense_h` (h3) text | Page-native heading like `dig verb (MOVE SOIL)`; **empty when the page has no such heading** (not/build/iceberg) — never fabricate a combined title |
| Sense body | `.pos-body` children in DOM order | Mix of `.dsense` and `.xref` sections |
| Definition block | `.def-block` (nested in sense) | |
| EN definition | `.ddef_d` (in `.ddef_h`), `.text()` | `.ddef_h` includes the level badge (A1/A2) — use `.ddef_d` to exclude it |
| CN definition | `.def-body` direct child `.trans`, `.text()` | `.def-body` is `.ddef_b`; use `children('.trans').first()` so example translations are never misread as the sense CN |
| Level badge | `.def-info .epp-xref` | e.g. `A1`, `B1` |
| Grammar | `.def-info .gram` | e.g. `[ I or T ]` |
| Usage label | `.def-info .lab` | e.g. `UK disapproving`, `old-fashioned slang`; can nest region+usage spans |
| Phrase panel title | `$(blockEl).parents('.phrase-block').find('.phrase-title')` | e.g. `if not`, `dig someone in the ribs`, `digs` — rendered as `(title)` on its own line |
| Example block | `.examp` (nested in def-block) | EN `.eg`, CN `:first .trans` inside the same `.examp` |
| Inflection (word forms) | `.irreg-infls .inf-group` | `.lab` = label, `.inf` = form; one exchange per group |
| Idioms xref | `.xref.idioms .x-h`, `.xref.idiom .x-h` | Phrase names, one per line |
| Phrasal verbs xref | `.xref.phrasal_verbs .x-h` | Phrase names, one per line |
| Excluded xrefs | `.xref.grammar`, `.xref.related_words` | Usage notes / related words — never rendered |

## Assembly Pattern (additions + exchanges)

Bob renders `phonetics → exchanges → additions` in fixed order, so nothing in `additions` can appear above the exchanges block. The parser produces:

### exchanges (words are tappable in Bob)
- Inflections only: one per `.inf-group` (`{ name: <lab>, words: [<inf>] }`).
- Idioms / phrasal verbs are **not** in exchanges: they would be pinned to the top of the card, but they must sit under their own part of speech (user requirement) — see additions.

### additions (append order == page DOM order)
1. **CN summary groups** (unshifted to the front so they appear right below exchanges): one per POS with ordinary-block CN translations, `name = <full POS title>`, value = one CN per line (deduped, order preserved). Phrase-panel CN (`(if not)`, `(dig someone in the ribs)`, `(digs)`…) is **excluded** from the summary and stays inline in its panel.
2. **EN sense sections** after `cnGroups` (so overall order is summary → senses):
   - With `.dsense_h`: one additions entry, `name = <h3 text>`.
   - Without: merged into a single loose entry with empty name (`''`) to close the POS block.
   - Ordinary blocks: `(phraseTitle)` / `<level+grammar>` + ` <usage>` / EN line / examples. CN line was **moved to the summary** — ordinary blocks no longer print `> CN`.
   - Phrase-panel blocks keep their inline `> CN`.
   - Blank-line rule: an ordinary plain block (`!phraseTitle && !lab`) gets a trailing blank line (level badges like `A1` / `B1` do not suppress it).
3. **Idioms / phrasal verbs xrefs** inline in DOM position (per POS body): one additions entry `name = 习语` / `短语动词`, value = phrase names one per line prefixed with circled digits `① ② ③…` (unique line starts; the "no repeated prefix" requirement). Multiple same-name xrefs in one POS merge (docs merge only within the current POS — `slice(posStart)`, never across POS).

### Fallbacks
- No `.pos-body` (phrase entries): iterate `$('.dsense', el)` in document order.
- No `.dsense` at all: treat the word's `.def-block`s as one loose group.
- `posgram` empty on phrase entries: use `.anc-info-head > .pos` for the POS title and `(label || anc-text)` as fallback pronunciation data.

## Example Cap

Every def-block contributes **at most 2 examples** (`MAX_EXAMPLES_PER_DEF = 2` in `src/entry.ts`), rendered as `• en  cn` lines. Keep the cap when refactoring the parse loop.

## Fixtures for Offline Checks

`test/fixtures/` holds saved page snapshots. Verify with a scratch script (`/tmp/verify-final.js` mirrors the parser: 31 assertions over not/dig/wet/build/break-down/iceberg):

- `break-down.html` — phrase entry (`break down`), uses `.anc-info-head`; 3 dsense groups under one POS without `.pos-body`.
- `build.html` — multi-POS verb/noun; idiom 2 + phrasal-verb 5 under verb.
- `iceberg.html` — single POS.
- `not.html` — 1 POS, 4 CN-translated ordinary blocks + 3 phrase panels (`(if not)`/`(or not)`/`(humorous)`); CN summary has 4 lines, panels have no CN at all on the live page.
- `dig.html` — online snapshot: 7 dsense groups (verb 4 + noun 3) + verb idioms (4) + phrasal verbs (6) between verb and noun groups.
- `wet.html` — online snapshot: 3 POS; **idioms split per POS** (`a wet weekend`, `be wet behind the ears` under adjective; `wet your whistle` under verb [ T ]) — regression guard for cross-POS merging.

## Anti-Patterns

- Using `.text()` on `.ddef_h` for definitions (picks up the A1/A2 badge) or relying on the first child of `.def-body` being the CN translation.
- Assuming every entry has `.posgram` — phrases need the `.anc-info-head` / `.pos` fallback.
- Merging idiom xrefs with a global `findLast` — merges across parts of speech (wet regression found this); always scope to the current POS slice.
- Building the audio URL without the `baseUrl` prefix.
- Putting idioms/phrasal verbs in `exchanges` when the in-POS placement is required (Bob pins exchanges to the top).
- Relying on the live page structure without re-checking the fixtures after a Cambridge markup change (site updates have broken this parser before).