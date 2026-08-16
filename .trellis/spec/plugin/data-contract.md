# Data Contract

## Interfaces

Type definitions consumed by `src/entry.ts` come from `src/helper/types.ts`:

```ts
interface Part { part: string; means: string[] }
interface Phonetic { type?: string; value?: string; tts?: TTS }
interface TTS { type: string; value: string }
interface Exchange { name: string; words: string[] }
interface Addition { name: string; value: string }
```

`Phonetic.tts` is set only when an audio element exists: `{ type: 'url', value: <baseUrl + src> }`, otherwise `tts` is `undefined`.

## `translate` Result Shape

`completion({ result })` object assembled in `main()`:

```ts
{
  from: 'en',
  to: 'zh-Hans',
  fromParagraphs: [word],        // the headword
  toParagraphs: [word],          // identical today — keep as-is unless Bob UI behavior requires a change
  toDict: {
    phonetics,                  // Phonetic[] — us + uk entries
    additions,                  // Addition[] — CN summary groups, EN sense sections, idiom/phrasal-verb sections
    exchanges,                  // Exchange[] — word-form inflections only (+ tappable phrase words if placement tradeoff flips back)
    word
  },
  raw: ''
}
```

`parts` is **not** populated (all display content lives in `additions` + `exchanges`). `phonetics` order is `[us, uk]`.

### additions semantics (Bob renders `phonetics → exchanges → additions` in fixed order)

Additions are grouped by part of speech (POS) with `*` separators:

```
[POS summary: one line per POS, CN meanings joined by ；]
[************************************************************]
[POS label as section header, detailed definitions, idioms, phrasal verbs]
[************************************************************]  (if more than one POS)
[next POS section]
```

- **POS summary** (first entry, `name = ''`): one line per POS, format `<posLabel>：<cn1>；<cn2>；<cn3>`. `posLabel` is the pure POS name (`.posgram > .pos`), without grammar tags like `[T]` `[C]`. CN meanings from ordinary def-blocks, deduped, joined by `；`.
- **Separator** (second entry, `name = ''`): `************************************************************` (60 `*`).
- **POS detailed sections** (subsequent entries, `name = <pure POS label>` e.g. `verb`, `noun`, `adjective`, `adverb`, `phrasal verb`): each contains all definitions, `> CN` lines, examples, and idioms/phrasal verbs for that POS. Between POS sections, another `*` separator entry is inserted.
  - Definition blocks: level + grammar → EN definition → `> CN` → `• examples`
  - Phrase panels: `(title)` → EN → `> CN` → `• examples`
  - Idioms: `习语` header → `① item` / `② item` ...
  - Phrasal verbs: `短语动词` header → `① item` / `② item` ...
- No `dsense_h` guide-word titles are shown in the output (they are used only for DOM grouping).
- No `{可点击}` / `{同上}` / `{按照；分割组合}` annotations appear in output.

### exchanges semantics

Only inflections: one per `.irreg-infls .inf-group`, `{ name: <lab>, words: [<inf>] }` (e.g. `present participle: digging`). Bob renders `name: word` and **words are tappable** (re-query). Never put non-inflection content here unless the user approves losing the in-POS placement.

## Naming Conventions

- camelCase fields everywhere (`fromParagraphs`, `toDict`, `phonetics`, `means`).
- Collection fields are plain arrays (`means: string[]`, `phonetics: Phonetic[]`, `additions: Addition[]`).
- String types are union-style literals where stable: `type: 'url'`, `type: 'us' | 'uk'`.

## Boundaries

- `types.ts` also exports a large Volcengine OpenAPI surface (`OpenApiResponse`, `STS`, `RequestObj`, `SignerOptions`, `Credentials`, `Policy`, …) used only by the dead `helper/` SDK files. Do not import those from plugin logic or add new SDK types for plugin features.
- Do not invent a parallel result model for `toDict`; extend `Addition`/`Exchange`/`Phonetic` only when the Bob rendering genuinely needs a new field, and give new fields optional (`?`) types to avoid breaking existing consumers.
- Tests for the contract: none automated today; `test/fixtures/*.html` + `/tmp/verify-final.js` (31 assertions) are the offline mirror of "expected page → expected fields". When changing the shape, update the verify script and re-run all fixtures before shipping.