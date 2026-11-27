#!/bin/sh
# PreToolUse guard for the `implementer` subagent only (wired in its frontmatter).
# It only ever restricts: exit 2 = block the tool call, stderr is shown to Claude.
# A guard rail against mistakes, not a sandbox: a determined shell command can get around it.

block() {
  echo "implementer guard: $1 Do not work around this; report it as BLOCKED or 'Not done'." >&2
  exit 2
}

input=$(cat)
command -v jq >/dev/null 2>&1 || block "jq is not installed, so the call cannot be checked."
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || block "unreadable hook input."

case "$tool" in
  Edit | Write)
    path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
    case "/$path" in
      */server/src/db/migrations/*) block "migrations are generated; use 'pnpm db:generate'." ;;
      */.env.example) ;;
      */.env | */.env.* | */.devdigest/*) block "env and secret files are off limits." ;;
      */pnpm-lock.yaml | */package-lock.json) block "lockfiles are not edited by hand." ;;
    esac
    ;;
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
    # Command position: start of line or after ; & | (, optionally after VAR=value.
    start='(^|[;&|(])[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'
    # Global options, with or without a value (git -C dir, pnpm --dir x).
    opts='([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*'
    end='([^[:alnum:]_-]|$)'
    protected='(db/migrations|\.devdigest|-lock\.(yaml|json)|\.env([[:space:]]|$))'
    has() { printf '%s\n' "$cmd" | grep -Eq "$1"; }

    has "${start}git${opts}[[:space:]]+(commit|push|reset|checkout|switch|restore|clean|stash|rebase|merge)${end}" &&
      block "git commands that change history or discard work are not allowed."
    has "${start}gh${end}" && block "the GitHub CLI is not allowed."
    has "${start}(pnpm|npm)${opts}[[:space:]]+(add|install|i|ci|remove|rm|uninstall|update|up)${end}" &&
      block "installing or changing dependencies is not allowed."
    has "${start}(rm|mv|cp|tee|sed[[:space:]]+-i)${end}[^;&|]*${protected}" &&
      block "that command changes a protected file."
    has ">[[:space:]]*[^[:space:];&|]*${protected}" &&
      block "redirecting into a protected file is not allowed."
    ;;
esac
exit 0
