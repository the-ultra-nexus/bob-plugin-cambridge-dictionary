# Data Contract

## Interfaces

The only type definitions consumed by `src/entry.ts` come from `src/helper/types.ts`:

```ts
interface Part { part: string; means: string[] }
interface Phonetic { type?: string; value?: string; tts?: TTS }
interface TTS { type: string; value: string }
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
    additions,                  // { name, value }[] — display rows, one per part/example group
    parts,                      // Part[] — aggregated means per part of speech
    word
  },
  raw: ''
}
```

The ordering of `phonetics` is `[us, uk]` (built via the two `makePhonetic` calls in `entry.ts`).

## Naming Conventions

- camelCase fields everywhere (`fromParagraphs`, `toDict`, `phonetics`, `means`).
- Collection fields are plain arrays (`means: string[]`, `phonetics: Phonetic[]`).
- String types are union-style literals where stable: `type: 'url'`, `type: 'us' | 'uk'`.

## Boundaries

- `types.ts` also exports a large Volcengine OpenAPI surface (`OpenApiResponse`, `STS`, `RequestObj`, `SignerOptions`, `Credentials`, `Policy`, …) used only by the dead `helper/` SDK files. Do not import those from plugin logic or add new SDK types for plugin features.
- Do not invent a parallel result model for `toDict`; extend `Part`/`Phonetic` only when the Bob rendering genuinely needs a new field, and give new fields optional (`?`) types to avoid breaking existing consumers.
- Tests for the contract: none automated today; `test/fixtures/*.html` are the closest thing to "expected page → expected fields". When changing the shape, note it in the task so the fixture-based manual check is rerun.