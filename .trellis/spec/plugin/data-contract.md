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

- **CN summary** (unshifted first, so it renders directly below exchanges): one per part of speech, `name = <full POS title>` (e.g. `wet verb [ T ]`), `value` = one CN translation per line. Only ordinary def-block CN; phrase-panel CN stays inline and never enters the summary.
- **EN sense sections**: `name = <dsense_h text>` (page-native group heading, `''` when the page has none), `value` = block rows (`(phraseTitle)` / level+grammar+usage / EN / examples, blank line after plain blocks).
- **Idioms / phrasal verbs**: `name = '习语' | '短语动词'`, `value` = phrase names one per line, each prefixed with circled digits `① ② ③…` (unique line starts). Header + rows combine into one additions entry (Bob shows the `name` as the block title).

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