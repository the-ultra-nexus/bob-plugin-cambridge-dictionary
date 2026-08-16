# Build & Release

## Commands

| Command | Effect |
|---------|--------|
| `node build.js` | esbuild-bundles `src/entry.ts` → `dist/main.js` (watch mode, rebuilds on change), then zips `main.js` + `static/icon.png` + generated `info.json` into `dist/bob-plugin-cambridge-dictionary{version}.bobplugin` |
| `node build.js --release` | Same bundle + artifact written to `release/bob-plugin-cambridge-dictionary{version}.bobplugin`, and appends a version entry to `appcast.json` (sha256 + jsDelivr CDN url) |

`build.js` uses esbuild with `platform: "node"` and `treeShaking: false` — keep both (plugins run in a Node-like runtime inside Bob; bundling must not drop top-level lifecycle functions).

## Versioning

- **Single source of truth: `version` in `package.json`.** `build.js` reads it for the artifact name and `info.json`; `appcast.json` entries are derived from it.
- Bump `package.json` first, then run `node build.js --release` — never hand-edit `appcast.json` or rename artifacts.
- `info.json` (generated at zip time): `identifier: "bob-plugin-cambridge-dictionary"`, `category: "translate"`, `minBobVersion: "0.8.0"`, `appcast` pointing at the jsDelivr-hosted `appcast.json`.

## Release Flow

1. Bump `version` in `package.json` (and `README.md`/release notes as needed).
2. `node build.js --release` → produces `release/*.bobplugin` and updates `appcast.json`.
3. Commit and push to `main`. jsDelivr serves both `release/` artifacts and `appcast.json` at `@main`, which is what Bob's update check and the README badge consume.
4. Create a GitHub release from the new tag; the badge `github/downloads/...` tracks it.

## Anti-Patterns

- Hand-editing `release/*.bobplugin` or `appcast.json`.
- Building locally with `--release` for a version you do not intend to publish (it mutates `appcast.json` — re-run without `--release` for local testing via `dist/` artifact).
- Checking in artifact changes that do not match `package.json` version.