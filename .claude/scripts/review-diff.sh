#!/bin/sh
# Builds what a reviewer agent needs for a change set, without generated files.
# Usage: review-diff.sh <out-dir> [base]      base: HEAD (default, uncommitted work) or e.g. main
# Writes: files.txt     status, +added -removed, path   (every non-generated file)
#         changes.diff  hunks of MODIFIED files only; added files are read from the repo
#         code.diff     the same, .ts/.tsx only
set -eu
[ $# -ge 1 ] || { echo "usage: review-diff.sh <out-dir> [base]" >&2; exit 1; }
mkdir -p "$1"
out=$(cd "$1" && pwd)
base=${2:-HEAD}
cd "$(git rev-parse --show-toplevel)"
[ "$base" = HEAD ] || base=$(git merge-base "$base" HEAD)

X1=':(exclude)server/src/db/migrations/meta'
X2=':(exclude,glob)**/pnpm-lock.yaml'
X3=':(exclude,glob)**/package-lock.json'
GENERATED='^server/src/db/migrations/meta/|(^|/)(pnpm-lock\.yaml|package-lock\.json)$'

tab=$(printf '\t')
{
  git -c core.quotePath=false diff --no-renames --name-status "$base" -- . "$X1" "$X2" "$X3" |
    while IFS="$tab" read -r status path; do
      stat=$(git --literal-pathspecs diff --no-renames --numstat "$base" -- "$path" |
        awk -F'\t' '{printf "+%s -%s", $1, $2}')
      printf '%s %s %s\n' "$status" "$stat" "$path"
    done
  git -c core.quotePath=false ls-files --others --exclude-standard | grep -Ev "$GENERATED" |
    while IFS= read -r path; do
      [ -f "$path" ] || continue
      printf 'A +%s -0 %s\n' "$(wc -l <"$path" | tr -d ' ')" "$path"
    done
} >"$out/files.txt"

git diff --no-renames --diff-filter=ad "$base" -- . "$X1" "$X2" "$X3" >"$out/changes.diff"
git diff --no-renames --diff-filter=ad "$base" -- ':(glob)**/*.ts' ':(glob)**/*.tsx' "$X1" >"$out/code.diff"

echo "files:        $out/files.txt ($(wc -l <"$out/files.txt" | tr -d ' ') files, $(grep -c '^A ' "$out/files.txt" || true) added)"
echo "changes.diff: $out/changes.diff ($(wc -c <"$out/changes.diff" | tr -d ' ') bytes)"
echo "code.diff:    $out/code.diff ($(wc -c <"$out/code.diff" | tr -d ' ') bytes)"
