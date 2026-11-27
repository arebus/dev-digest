#!/bin/sh
# PreToolUse guard for the `architecture-reviewer` subagent only (wired in its frontmatter).
# Bash: dependency-cruiser (graph only) and read-only git. Edit/Write: never.
# It only ever restricts: exit 2 = block the tool call, stderr is shown to Claude.
# A guard rail against mistakes, not a sandbox.

block() {
  echo "arch-reviewer guard: $1 Do not work around this; list it under 'Not checked'." >&2
  exit 2
}

input=$(cat)
command -v jq >/dev/null 2>&1 || block "jq is not installed, so the call cannot be checked."
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || block "unreadable hook input."
[ -n "$tool" ] || block "unreadable hook input."

case "$tool" in
  Edit | Write) block "this agent is read-only." ;;
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
    [ -n "$cmd" ] || block "empty command."
    [ "$(printf '%s\n' "$cmd" | wc -l)" -eq 1 ] || block "run one command per call."

    # Allowed shape: [cd server|client|reviewer-core && ] [PATH=value ] command [2>&1]
    rest=$(printf '%s' "$cmd" |
      sed -E 's/[[:space:]]+2>&1[[:space:]]*$//; s/^[[:space:]]*cd[[:space:]]+(server|client|reviewer-core)[[:space:]]*&&[[:space:]]*//')
    printf '%s' "$rest" | grep -Eq '[;&|<>`]|\$\(' &&
      block "pipes, redirects, chaining and substitutions are not allowed."
    rest=$(printf '%s' "$rest" | sed -E 's/^[[:space:]]*(PATH=[^[:space:]]*[[:space:]]+)*//')

    has() { printf '%s\n' "$rest" | grep -Eq "$1"; }
    depcruise='^(pnpm[[:space:]]+exec[[:space:]]+depcruise|\./node_modules/\.bin/depcruise|npx[[:space:]]+--no-install[[:space:]]+depcruise)([[:space:]]|$)'

    if has "$depcruise"; then
      # Flag allowlist: anything that writes a file or loads an executable config is refused.
      has '[[:space:]]--no-config([[:space:]]|$)' || block "run depcruise with --no-config."
      set -f
      for word in $(printf '%s' "$rest" | sed -E "s/$(printf '%s' "$depcruise" | sed 's#/#\\/#g')/ /"); do
        case "$word" in
          --no-config | --ts-pre-compilation-deps | --output-type | -T | --ts-config | --exclude | --include-only | --do-not-follow | --focus) ;;
          -*) block "depcruise option '$word' is not allowed." ;;
        esac
      done
    elif has '^git[[:space:]]+(diff|show|log|status|blame)([[:space:]]|$)'; then
      has '[[:space:]]--(output|ext-diff|textconv)' && block "that git option is not allowed."
    elif has '^(ls|wc)([[:space:]]|$)'; then
      :
    else
      block "only depcruise, git diff/show/log/status/blame, ls and wc are allowed."
    fi
    ;;
  *) ;;
esac
exit 0
