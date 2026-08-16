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
    additions,                  // Addition[] — inflections line + POS summary + per-POS detailed sections
    exchanges: [],              // always empty (inflections moved to additions; Bob exchanges words are tappable)
    word
  },
  raw: ''
}
```

`parts` is **not** populated (all display content lives in `additions`). `phonetics` order is `[us, uk]`. `exchanges` is always an empty array (see below).

### additions semantics (Bob renders `phonetics → additions` in fixed order)

Additions are grouped by part of speech (POS) with separator lines:

```
[inflections line, plain text, one line]  (only when the word has inflections)
[POS label as bold header]                (Bob renders non-empty name as bold title)
[CN meanings joined by ；]
...one such header+meaning pair per POS...
[separator line]
[POS label as bold header]
[detailed definitions, > CN, examples, 习语/短语动词]
[separator line]  (if more than one POS)
[next POS section]
```

- **Inflections line** (first entry, `name = ''`, only when inflections exist): one plain-text line, e.g. `present participle digging | past tense and past participle dug`. Never in `exchanges` (Bob renders exchange words as tappable links; user requires non-clickable).
- **POS summary**: one entry per POS with CN meanings, `name = <pure POS label>` (e.g. `verb`, `noun` — Bob renders the name as a **bold title**, this is how labels get bolded; markdown `**` is NOT supported by Bob). `value` = CN meanings joined by `；`. The last summary entry's `value` ends with a trailing newline (blank line after summary).
- **Separator**: `name = ''`, `value` = 60 characters of `=` (user-chosen; previously `*`).
- **POS detailed sections**: one entry per POS, `name = <pure POS label>`, `value` = all definitions (`level+grammar` → EN → `> CN` → `• examples`), phrase panels (`(title)` → EN → `> CN` → `• examples`), then 习语/短语动词 with `① ② …` numbered items inline. Between POS sections, a separator entry is inserted.
- `dsense_h` guide-word titles are not shown (used only for DOM grouping).
- No `{可点击}` / `{同上}` / `{按照；分割组合}` annotations appear in output.
- CN lines always use `> ` prefix (exactly one space after `>`).

## Naming Conventions

- camelCase fields everywhere (`fromParagraphs`, `toDict`, `phonetics`, `means`).
- Collection fields are plain arrays (`means: string[]`, `phonetics: Phonetic[]`, `additions: Addition[]`).
- String types are union-style literals where stable: `type: 'url'`, `type: 'us' | 'uk'`.

## Boundaries

- `types.ts` also exports a large Volcengine OpenAPI surface (`OpenApiResponse`, `STS`, `RequestObj`, `SignerOptions`, `Credentials`, `Policy`, …) used only by the dead `helper/` SDK files. Do not import those from plugin logic or add new SDK types for plugin features.
- Do not invent a parallel result model for `toDict`; extend `Addition`/`Exchange`/`Phonetic` only when the Bob rendering genuinely needs a new field, and give new fields optional (`?`) types to avoid breaking existing consumers.
- Tests for the contract: none automated today; `test/fixtures/*.html` + `/tmp/verify-final.js` (31 assertions) are the offline mirror of "expected page → expected fields". When changing the shape, update the verify script and re-run all fixtures before shipping.