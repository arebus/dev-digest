#!/bin/sh
# PreToolUse guard for the `doc-writer` subagent only (wired in its frontmatter).
# Edit/Write: package docs/, specs/ and README.md only.
# It only ever restricts: exit 2 = block the tool call, stderr is shown to Claude.

block() {
  echo "doc-writer guard: $1 Do not work around this; put it under 'Suggested edits outside scope'." >&2
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

    case "$rel" in
      */CLAUDE.md | */INSIGHTS.md) block "CLAUDE.md and INSIGHTS.md are not documentation pages." ;;
      client/README.md | server/README.md | reviewer-core/README.md) ;;
      client/docs/*.md | server/docs/*.md | reviewer-core/docs/*.md) ;;
      client/specs/*/* | server/specs/*/* | reviewer-core/specs/*/*) block "specs/ is flat: no subfolders." ;;
      client/specs/*.md | server/specs/*.md | reviewer-core/specs/*.md) ;;
      *) block "only <package>/docs/**/*.md, <package>/specs/*.md and <package>/README.md may be written." ;;
    esac
    ;;
  *) ;;
esac
exit 0
