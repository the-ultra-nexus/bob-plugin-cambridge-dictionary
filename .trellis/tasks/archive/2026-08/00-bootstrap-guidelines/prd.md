# Bootstrap Task: Fill Project Development Guidelines

**You (the AI) are running this task. The developer does not read this file.**

The developer just ran `trellis init` on this project for the first time.
`.trellis/` now exists with empty spec scaffolding, and this bootstrap task
exists under `.trellis/tasks/`. When they want to work on it, they should start
this task from a session that provides Trellis session identity.

**Your job**: help them populate `.trellis/spec/` with the team's real
coding conventions. Every future AI session — this project's
`trellis-implement` and `trellis-check` sub-agents — auto-loads spec files
listed in per-task jsonl manifests. Empty spec = sub-agents write generic
code. Real spec = sub-agents match the team's actual patterns.

Don't dump instructions. Open with a short greeting, figure out if the repo
has any existing convention docs (CLAUDE.md, .cursorrules, etc.), and drive
the rest conversationally.

---

## Status (update the checkboxes as you complete each item)

- [x] Fill plugin guidelines (frontend 模板已删除，改为 plugin 层)
- [x] Add code examples

执行记录：仓库分析发现 init 把本项目误判为 frontend
（实际是 Bob 翻译插件，单一入口 src/entry.ts + cheerio 抓取）。
`src/helper/` 是拷贝的火山引擎 SDK 死代码（仅 types.ts 的 Part/Phonetic
被 entry.ts 使用）。因此删除 `.trellis/spec/frontend/` 与不适用的
cross-layer-thinking-guide，新建 `.trellis/spec/plugin/` 五份指南
（architecture/scraping/data-contract/error-handling/build-release），
并重写 code-reuse-thinking-guide 加入死代码教训。

---

## Spec files populated


### Plugin guidelines (本仓库唯一运行时层)

| File | What to document |
|------|------------------|
| `.trellis/spec/plugin/index.md` | 层导航与关键事实 |
| `.trellis/spec/plugin/architecture.md` | Bob 插件生命周期、文件归属、死代码红线 |
| `.trellis/spec/plugin/scraping.md` | cheerio 选择器映射、聚合与去重模式、fixtures 说明 |
| `.trellis/spec/plugin/data-contract.md` | Part/Phonetic 接口与 toDict 结果结构 |
| `.trellis/spec/plugin/error-handling.md` | query 守卫、notFound、completion 协议、日志 |
| `.trellis/spec/plugin/build-release.md` | esbuild 打包、版本单源、appcast |

注意：`test/fixtures/pursuer.html` 是 `build.html` 的过期副本（title 同为
build），spec 中已标注勿作权威用例。


### Thinking guides (改写为项目具体版本)

`.trellis/spec/guides/` 已改写：code-reuse 指南加入 src/helper 死代码教训
与本地复用模式；cross-layer 指南删除（单入口插件无跨层场景）。

---

## How to fill the spec

### Step 1: Import from existing convention files first (preferred)

Search the repo for existing convention docs. If any exist, read them and
extract the relevant rules into the matching `.trellis/spec/` files —
usually much faster than documenting from scratch.

| File / Directory | Tool |
|------|------|
| `CLAUDE.md` / `CLAUDE.local.md` | Claude Code |
| `AGENTS.md` | Codex / Claude Code / agent-compatible tools |
| `.cursorrules` | Cursor |
| `.cursor/rules/*.mdc` | Cursor (rules directory) |
| `.windsurfrules` | Windsurf |
| `.clinerules` | Cline |
| `.roomodes` | Roo Code |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.vscode/settings.json` → `github.copilot.chat.codeGeneration.instructions` | VS Code Copilot |
| `CONVENTIONS.md` / `.aider.conf.yml` | aider |
| `CONTRIBUTING.md` | General project conventions |
| `.editorconfig` | Editor formatting rules |

### Step 2: Analyze the codebase for anything not covered by existing docs

Scan real code to discover patterns. Before writing each spec file:
- Find 2-3 real examples of each pattern in the codebase.
- Reference real file paths (not hypothetical ones).
- Document anti-patterns the team clearly avoids.

### Step 3: Document reality, not ideals

**Critical**: write what the code *actually does*, not what it should do.
Sub-agents match the spec, so aspirational patterns that don't exist in the
codebase will cause sub-agents to write code that looks out of place.

If the team has known tech debt, document the current state — improvement
is a separate conversation, not a bootstrap concern.

---

## Quick explainer of the runtime (share when they ask "why do we need spec at all")

- Every AI coding task spawns two sub-agents: `trellis-implement` (writes
  code) and `trellis-check` (verifies quality).
- Each task has `implement.jsonl` / `check.jsonl` manifests listing which
  spec files to load.
- The platform hook auto-injects those spec files + the task's `prd.md`
  into every sub-agent prompt, so the sub-agent codes/reviews per team
  conventions without anyone pasting them manually.
- Source of truth: `.trellis/spec/`. That's why filling it well now pays
  off forever.

---

## Completion

When the developer confirms the checklist items above are done with real
examples (not placeholders), guide them to run:

```bash
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
```

After archive, every new developer who joins this project will get a
`00-join-<slug>` onboarding task instead of this bootstrap task.

---

## Suggested opening line

"Welcome to Trellis! Your init just set me up to help you fill the project
spec — a one-time setup so every future AI session follows the team's
conventions instead of writing generic code. Before we start, do you have
any existing convention docs (CLAUDE.md, .cursorrules, CONTRIBUTING.md,
etc.) I can pull from, or should I scan the codebase from scratch?"
