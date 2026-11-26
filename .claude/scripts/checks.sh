#!/bin/sh
# Every mechanical check, no LLM. Prints one line per check; details go to log files.
# Usage: checks.sh [--no-it] [base]      base for the change-set checks (default HEAD)
# Exit 1 if any check FAILs. SKIP is not a pass: report it.
# Server tests run with an empty HOME and empty keys, so they never call real services.

it=1
[ "${1:-}" = "--no-it" ] && { it=0; shift; }
root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
base=${1:-HEAD}
[ "$base" = HEAD ] || base=$(git merge-base "$base" HEAD) || exit 1
out=$(mktemp -d "${TMPDIR:-/tmp}/dd-checks.XXXXXX")
mkdir "$out/home"
failed=0
export NO_COLOR=1 FORCE_COLOR=0

if ! command -v node >/dev/null 2>&1; then
  for d in "$HOME"/.nvm/versions/node/*/bin; do [ -x "$d/node" ] && PATH="$d:$PATH"; done
  export PATH
fi

report() { # name status detail
  printf '%-20s %-5s %s\n' "$1" "$2" "$3"
  [ "$2" = FAIL ] && failed=1
}

run() { # name dir command...
  name=$1 dir=$2
  shift 2
  if [ ! -x "$root/$dir/node_modules/.bin/tsc" ]; then
    report "$name" SKIP "dependencies not installed in $dir/"
    return
  fi
  log="$out/$name.log"
  if (cd "$root/$dir" && "$@") >"$log" 2>&1; then
    report "$name" PASS "$(grep -E '^ +Tests ' "$log" | sed -E 's/^ +Tests +//' | tail -1)"
  else
    report "$name" FAIL "log: $log"
    grep -E 'FAIL |error TS|Error:|^ +Tests ' "$log" | head -15 | sed 's/^/    /'
  fi
}

isolated() {
  env HOME="$out/home" OPENAI_API_KEY= ANTHROPIC_API_KEY= OPENROUTER_API_KEY= GITHUB_TOKEN= "$@"
}

# Rancher Desktop: testcontainers needs its socket (server/INSIGHTS.md).
if [ -z "${DOCKER_HOST:-}" ] && [ -S "$HOME/.rd/docker.sock" ]; then
  export DOCKER_HOST="unix://$HOME/.rd/docker.sock" TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
fi
export DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}"

run server-typecheck server ./node_modules/.bin/tsc --noEmit -p tsconfig.json
run server-unit server isolated ./node_modules/.bin/vitest run --exclude '**/*.it.test.ts'
run client-typecheck client ./node_modules/.bin/tsc --noEmit
run client-test client ./node_modules/.bin/vitest run
run core-typecheck reviewer-core ./node_modules/.bin/tsc --noEmit -p tsconfig.json
run core-test reviewer-core ./node_modules/.bin/vitest run --passWithNoTests
run e2e-typecheck e2e ./node_modules/.bin/tsc --noEmit -p tsconfig.json

# ---- change-set checks -------------------------------------------------------
changed=$({
  git -c core.quotePath=false diff --name-only --no-renames "$base"
  git -c core.quotePath=false ls-files --others --exclude-standard
} | sort -u)

# The two vendor/shared contract copies have old drift, so compare what CHANGED.
hunks() {
  if git ls-files --error-unmatch "$1" >/dev/null 2>&1; then
    git diff -U0 "$base" -- "$1" | grep -E '^[+-]' | grep -vE '^(\+\+\+|---) '
  elif [ -f "$1" ]; then
    sed 's/^/+/' "$1"
  fi
}
drift=""
for name in $(printf '%s\n' "$changed" |
  sed -nE 's#^(server|client)/src/vendor/shared/contracts/(.*)$#\2#p' | sort -u); do
  a=$(hunks "server/src/vendor/shared/contracts/$name")
  b=$(hunks "client/src/vendor/shared/contracts/$name")
  [ "$a" = "$b" ] || drift="$drift $name"
done
if [ -n "$drift" ]; then
  report contracts-sync FAIL "changed differently in server and client:$drift"
else
  report contracts-sync PASS "changed contract files match in both copies"
fi

# Import boundaries: violations in changed files fail, older ones are only counted.
if [ -x server/node_modules/.bin/depcruise ]; then
  log="$out/boundaries.log"
  (cd server && ./node_modules/.bin/depcruise src ../reviewer-core/src \
    --config ../.claude/scripts/depcruise-boundaries.cjs --output-type err) >"$log" 2>&1
  violations=$(grep -E '^ +error ' "$log")
  if [ -z "$violations" ] && ! grep -q 'no dependency violations' "$log"; then
    report boundaries FAIL "depcruise did not run, log: $log"
  else
    new="" old=0
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      from=$(printf '%s' "$line" | sed -E 's/^ +error [^:]+: ([^ ]+) .*/\1/')
      case "$from" in ../*) path=${from#../} ;; *) path="server/$from" ;; esac
      if printf '%s\n' "$changed" | grep -qxF "$path"; then
        new="$new$line
"
      else old=$((old + 1)); fi
    done <<LINES
$violations
LINES
    if [ -n "$new" ]; then
      report boundaries FAIL "violations in changed files ($old more elsewhere):"
      printf '%s' "$new" | sed -E 's#node_modules/\.pnpm/[^/]+/node_modules/#npm:#'
    else
      report boundaries PASS "none in changed files ($old older violations elsewhere)"
    fi
  fi
else
  report boundaries SKIP "depcruise not installed in server/"
fi

if [ "$it" = 0 ]; then
  report server-integration SKIP "--no-it"
elif ! docker info >/dev/null 2>&1; then
  report server-integration SKIP "Docker not available"
else
  run server-integration server isolated ./node_modules/.bin/vitest run .it.test
fi

echo "logs: $out"
exit $failed
