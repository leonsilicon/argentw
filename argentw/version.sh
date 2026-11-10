#!/usr/bin/env bash
# Prints this checkout's argentw version: upstream's version with an -argentw.N
# prerelease tag, where N counts argentw's own commits on top of upstream's
# release tag v<upstream> (fetched from software-mansion/argent).
set -euo pipefail

cd "$(dirname "$0")/.."
upstream=$(node -p 'require("./packages/argent/package.json").version')

if ! git rev-parse -q --verify "refs/tags/v$upstream" >/dev/null; then
  git fetch -q --no-tags https://github.com/software-mansion/argent.git \
    "refs/tags/v$upstream:refs/tags/v$upstream"
fi

echo "$upstream-argentw.$(git rev-list --count "v$upstream..HEAD")"
