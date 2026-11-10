#!/usr/bin/env bash
# Installs argentw globally through Vite+, in place of upstream @swmansion/argent, and
# points every agent at it.
#
# Usage: argentw/install.sh [version | path/to/argentw-<version>.tgz]
#        (default: the newest release on leonsilicon/argentw)
#
# argent's own updater can't update a Vite+ install (its shim hides the package root),
# so this does what it would: install, refresh MCP entries, skills and rules with
# `argent init -y`, and replace the running tool-server, whose folder Vite+ deletes.
# Open agent sessions have to reconnect their argent MCP afterwards (/mcp).
set -euo pipefail

repo=leonsilicon/argentw
arg=${1:-}

if [[ -n "$arg" && -f "$arg" ]]; then
  spec="@swmansion/argent@file:$(cd "$(dirname "$arg")" && pwd)/$(basename "$arg")"
else
  version=${arg:-$(curl -fsSL "https://raw.githubusercontent.com/$repo/registry/registry.json" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)["dist-tags"].latest))')}
  spec="@swmansion/argent@https://github.com/$repo/releases/download/v$version/argentw-$version.tgz"
fi

# The tool-servers of the install being replaced. Their folders are about to go.
old_servers=$(
  for file in "$HOME"/.argent/tool-server-*.json; do
    [[ -f "$file" ]] || continue
    pid=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).pid ?? ""' "$file")
    if [[ -n "$pid" ]] && ps -o command= -p "$pid" 2>/dev/null | grep -q "/.vite-plus/packages/@swmansion/argent/"; then
      echo "$pid"
    fi
  done
)

echo "Installing $spec" >&2
(cd "$HOME" && vp install -g "$spec")
(cd "$HOME" && argent init -y)

for pid in $old_servers; do
  kill "$pid" 2>/dev/null || true
done

# Starts the new install's tool-server, detached.
(cd "$HOME" && argent run list-devices >/dev/null)
echo "argentw $(argent --version) is installed. Reconnect argent in open agent sessions (/mcp)." >&2
