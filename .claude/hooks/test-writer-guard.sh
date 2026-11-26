#!/bin/sh
# PreToolUse guard for the `test-writer` subagent only (wired in its frontmatter).
# Edit/Write: test files and test helpers only. Bash: a fixed list of commands.
# It only ever restricts: exit 2 = block the tool call, stderr is shown to Claude.
# A guard rail against mistakes, not a sandbox: a test that is run can still write files.

block() {
  echo "test-writer guard: $1 Do not work around this; report it in your Test Report." >&2
  exit 2
}

input=$(cat)
command -v jq >/dev/null 2>&1 || block "jq is not installed, so the call cannot be checked."
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || block "unreadable hook input."
[ -n "$tool" ] || block "unreadable hook input."

case "$tool" in
  Edit | Write)
    path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
    cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
    # The cwd's repository first: in a worktree CLAUDE_PROJECT_DIR still points at the original root.
    root=$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null) || root=$CLAUDE_PROJECT_DIR
    [ -n "$root" ] || block "cannot find the repository root."

    case "$path" in
      */../* | */./* | */.. | *//*) block "the path must be normalised." ;;
      "$root"/*) rel=${path#"$root"/} ;;
      *) block "writes outside the repository are not allowed." ;;
    esac
    [ -L "$path" ] && block "writing through a symlink is not allowed."

    case "/$rel" in
      */vitest.config.* | */package.json | */pnpm-lock.yaml | */package-lock.json | */db/migrations/* | */.env*)
        block "config, lockfiles, migrations and env files are off limits."
        ;;
    esac
    case "$rel" in
      client/src/*.test.ts | client/src/*.test.tsx | client/src/test/*) ;;
      server/test/* | server/src/*.test.ts) ;;
      client/*/__tests__/* | server/*/__tests__/*) ;;
      *) block "only test files and test helpers in client/ and server/ may be written." ;;
    esac
    ;;
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
    [ -n "$cmd" ] || block "empty command."
    [ "$(printf '%s\n' "$cmd" | wc -l)" -eq 1 ] || block "run one command per call."

    # Allowed shape: [cd <dir> && ] [PATH|DOCKER_HOST|TESTCONTAINERS_...=value ]... command [2>&1]
    rest=$(printf '%s' "$cmd" |
      sed -E 's/[[:space:]]+2>&1[[:space:]]*$//; s/^[[:space:]]*cd[[:space:]]+[A-Za-z0-9_./-]+[[:space:]]*&&[[:space:]]*//')
    printf '%s' "$rest" | grep -Eq '[;&|<>`]|\$\(' &&
      block "pipes, redirects, chaining and substitutions are not allowed."
    rest=$(printf '%s' "$rest" |
      sed -E 's/^[[:space:]]*((PATH|DOCKER_HOST|TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE)=[^[:space:]]*[[:space:]]+)*//')

    has() { printf '%s\n' "$rest" | grep -Eq "$1"; }

    has '^(pnpm[[:space:]]+(test|typecheck)|pnpm[[:space:]]+exec[[:space:]]+(vitest|tsc)|\./node_modules/\.bin/(vitest|tsc)|git[[:space:]]+(status|diff|log|show)|ls)([[:space:]]|$)' ||
      block "only pnpm test/typecheck, vitest, tsc, git status/diff/log/show and ls are allowed."
    has '[[:space:]]--(output|outputFile)' && block "writing output to a file is not allowed."
    if ! has '^(git|ls)([[:space:]]|$)'; then
      has '[[:space:]](-u|--update)([[:space:]=]|$)' && block "updating snapshots is not allowed."
    fi
    if has '^(pnpm[[:space:]]+exec[[:space:]]+tsc|\./node_modules/\.bin/tsc)([[:space:]]|$)'; then
      has '[[:space:]]--noEmit([[:space:]]|$)' || block "run tsc with --noEmit."
    fi
    ;;
  *) ;;
esac
exit 0
