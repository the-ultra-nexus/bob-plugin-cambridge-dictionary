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
| Inflection (word forms) | `.irreg-infls .inf-group` | `.lab` = label, `.inf` = form; joined into one plain-text line (`lab inf`, groups joined by ` | `)
| Idioms xref | `.xref.idioms .x-h`, `.xref.idiom .x-h` | Phrase names, one per line |
| Phrasal verbs xref | `.xref.phrasal_verbs .x-h` | Phrase names, one per line |
| Excluded xrefs | `.xref.grammar`, `.xref.related_words` | Usage notes / related words — never rendered |

## Assembly Pattern (additions only)

Bob renders `phonetics → additions` in fixed order. `exchanges` and `relatedWordParts` are always empty (Bob renders exchange/related-word items as tappable links; user requires plain text). The parser produces:

### additions (built from `posData` array after the DOM loop)

Each `.entry-body__el` is processed into a `posData` entry: `{ posLabel, cnMeanings[], lines[] }`.
`posLabel` = pure POS name from `.posgram > .pos` (fallback `.anc-info-head > .pos`).
`cnMeanings` = CN translations from ordinary def-blocks (deduped, for the summary entries).
`lines` = all detailed content lines (definitions, `> CN`, examples, idioms, phrasal verbs).

After the loop, `additions` is assembled from `posData`:

1. **Inflections line** (only when inflections exist): one entry, `name = ''`, value = `present participle digging | past tense and past participle dug` + trailing `\n`. Plain text (non-clickable).
2. **POS summary**: one entry per POS with CN meanings, `name = <pure POS label>` (Bob renders non-empty name as **bold title** — this is the only native bolding; markdown `**` is NOT rendered by Bob). `value` = CN meanings joined by `；`. Last summary entry `value` ends with `\n` (blank line after summary).
3. **Separator**: one entry, `name = ''`, value = leading `\n` + 60 `=` characters (the newline renders a blank line above the separator).
4. **Per-POS detailed sections**: for each POS, one additions entry with `name = <pure POS label>` (e.g. `verb`, `noun`, `adjective`, `adverb`, `phrasal verb`). Between POS sections, another separator entry is inserted.

### Detailed section content (within a POS addition)

- **Definition blocks**: `(phraseTitle)` / `<level+grammar>` + ` <usage>` / EN line / `> CN` / `    • examples` (examples indented with 4 spaces). All CN translations are shown in the detailed section with `> ` prefix (exactly one space; both ordinary and phrase-panel).
- **Every def-block** ends with a trailing blank line (ordinary, phrase-panel `(if not)`, and labeled blocks alike) — blocks are always separated by one empty line.
- **Phrase-panel blocks** (`(if not)`, `(dig someone in the ribs)`, `(digs)`…): CN is shown inline with `> ` prefix (same as ordinary blocks).
- **dsense_h** guide-word titles are **not** shown in the output (used only for DOM grouping).
- **Idioms / phrasal verbs**: appended directly to `lines` in DOM position with header `习语` / `短语动词` and `① ② ③…` numbered items (numbering restarts per POS per type via `xrefSeq`).

### CN summary behavior
- CN from ordinary def-blocks goes to both the summary entries (joined by `；`) and the detailed section (`> CN`).
- CN from phrase-panel blocks goes only to the detailed section (`> CN`), not to the summary.
- Summary `name` = pure POS label (`.posgram > .pos`), without grammar tags like `[T]` `[C]` — Bob renders it as a bold title.

### Fallbacks
- No `.pos-body` (phrase entries): iterate `$('.dsense', el)` in document order.
- No `.dsense` at all: treat the word's `.def-block`s as one loose group.
- `posgram` empty on phrase entries: use `.anc-info-head > .pos` for the POS title.

## Example Cap

Every def-block contributes **at most 2 examples** (`MAX_EXAMPLES_PER_DEF = 2` in `src/entry.ts`), rendered as `    • en  cn` lines (4-space indentation). Keep the cap when refactoring the parse loop.

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