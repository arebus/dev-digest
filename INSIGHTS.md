# repo — INSIGHTS

Append-only log of non-obvious things learned. Read before working, write only what is new.
Entry: `YYYY-MM-DD — claim — why / what to do (`path` · `symbol`)`. No line numbers.

## What Works
<!-- Approaches that succeeded after alternatives were weighed or tried. -->

## What Doesn't Work
<!-- Dead ends and antipatterns, with the reason. Most valuable section. -->

## Codebase Patterns
<!-- Conventions and architecture decisions not obvious from a single file. -->

## Tool & Library Notes
<!-- Dependency / CLI quirks, versions. -->

- 2026-11-26 — Commit everything BEFORE running `/pr-self-review` — `diff-hash.sh` hashes committed, staged and unstaged diffs separately, so committing the same code afterwards makes `last.json` stale and the PR gate blocks (`.claude/skills/pr-self-review/scripts/diff-hash.sh`).
- 2026-11-26 — `/pr-self-review` diffs against LOCAL `main`; run `git fetch origin main:main` first, or already-merged work is reviewed again (22 agents instead of a few) (`.claude/skills/pr-self-review/SKILL.md`).
- 2026-11-26 — dependency-cruiser resolves npm deps to `node_modules/.pnpm/<pkg>@…/node_modules/<pkg>/…`, so the `^node_modules/drizzle-orm`-style rules proposed in `enforcement.md` would never match — match on the package name, and verify with a known violation before trusting a clean run (`.claude/skills/onion-architecture/references/enforcement.md`).
- 2026-11-26 — Running `server/node_modules/.bin/depcruise ../client/src --ts-config ../client/tsconfig.json` from `server/` resolves client aliases to `server/src/vendor/shared` (a false cross-package edge) — omit `--ts-config` for other packages (`.claude/agents/architecture-reviewer.md`).
- 2026-11-26 — Agent files added to `.claude/agents/` are not callable right away (`Agent type '…' not found`); they appeared later in the same session — don't smoke-test a new agent in the turn that creates it.
- 2026-11-27 — `checks.sh main` on a branch stacked on unmerged commits reports their boundary violations as new (e.g. `conventions/helpers.ts` → `repository.ts`) — run it with the default base `HEAD` to judge only the working-tree change (`.claude/scripts/checks.sh`).

## Recurring Errors & Fixes
<!-- `exact error text` — cause — fix. -->

## Session Notes
<!-- ### YYYY-MM-DD — task, then 1–3 bullets of what was added. -->

### 2026-11-26 — PR self-review and ConfigTab fix
- Added the commit-before-review and stale local `main` traps.

### 2026-11-26 — test-writer, architecture-reviewer, plan-verifier, doc-writer agents
- Added two dependency-cruiser traps and the delay before new agents become callable.

## Open Questions
<!-- - [ ] YYYY-MM-DD — question — look at: … -->
- [ ] 2026-11-26 — Do the new agents behave and do their frontmatter hooks block live? Smoke tests not run yet — look at: `.claude/agents/`, `.claude/hooks/*-guard.sh`.
