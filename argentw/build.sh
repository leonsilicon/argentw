#!/usr/bin/env bash
# Builds the argentw package: upstream argent's published npm tarball of the same
# version, with argentw's JS bundles, runner sources, skills, rules and agents laid
# over it.
#
# Upstream's native binaries (simulator-server, ax-service, dylibs, trace-processor)
# come from Software Mansion's private release repository, so argentw can't build
# them. argentw doesn't change them either: they're taken from the published
# package, and the private assets upstream's bundler insists on are seeded from it.
#
# Usage: argentw/build.sh [version]   (default: argentw/version.sh)
# Output: argentw/.build/argentw-<version>.tgz, and its path on stdout's last line.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

upstream=$(node -p 'require("./packages/argent/package.json").version')
version=${1:-$(argentw/version.sh)}
work="$root/argentw/.build"

echo "argentw $version, on upstream argent $upstream" >&2

rm -rf "$work"
mkdir -p "$work"

# 1. Upstream's published package of the same version.
npm pack "@swmansion/argent@$upstream" --pack-destination "$work" --silent >/dev/null
tar -xzf "$work/swmansion-argent-$upstream.tgz" -C "$work"
published="$work/package"

# 2. The private binaries and assets, where upstream's download scripts would put them
# (all gitignored), so its bundler runs to the end exactly as in its own release.
seed() { # <from, inside the published package> <to, inside the workspace>
  rm -rf "$2"
  mkdir -p "$(dirname "$2")"
  cp -R "$published/$1" "$2"
}
seed bin packages/native-devtools-ios/bin
rm -f packages/native-devtools-ios/bin/argent-simulator-server.cjs packages/native-devtools-ios/bin/*.apk
rm -rf packages/native-devtools-ios/bin/network-inspector
seed dylibs packages/native-devtools-ios/dylibs
seed assets/trace-processor packages/native-devtools-android/assets/trace-processor
mkdir -p packages/native-devtools-android/bin
for apk in "$published"/bin/argent-android-devtools-*.apk; do
  cp "$apk" packages/native-devtools-android/bin/
done
seed bin/network-inspector packages/native-devtools-android/bin/network-inspector

# 3. Upstream's build, with the argentw version stamped where the code reads it (the
# tool-server compares it against argentw's releases). Restored afterwards.
stamped=(packages/argent/package.json packages/tool-server/package.json)
for file in "${stamped[@]}"; do
  cp "$file" "$work/$(echo "$file" | tr / _)"
done
restore() {
  for file in "${stamped[@]}"; do
    cp "$work/$(echo "$file" | tr / _)" "$file"
  done
}
trap restore EXIT
for file in "${stamped[@]}"; do
  node -e '
    const fs = require("node:fs");
    const [file, version] = process.argv.slice(1);
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    pkg.version = version;
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  ' "$file" "$version"
done

npm run build >&2
npm run build -w @swmansion/argent >&2

# 4. Lay argentw's build over the published package. Files the build didn't produce
# (native binaries, downloaded assets) stay as published.
rsync -a packages/argent/dist/ "$published/dist/"
rsync -a --delete packages/argent/dist/ios-device-runner/ "$published/dist/ios-device-runner/"
for dir in skills rules agents; do
  rsync -a --delete "packages/argent/$dir/" "$published/$dir/"
done

node -e '
  const fs = require("node:fs");
  const [file, version] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.version = version;
  pkg.description = "argentw: argent with wireless iPhone control. " + pkg.description;
  pkg.repository = { type: "git", url: "git+https://github.com/leonsilicon/argentw.git" };
  pkg.bin = { ...pkg.bin, argentw: pkg.bin.argent };
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
' "$published/package.json" "$version"

# The published package.json keeps upstream's prepack script, whose script isn't shipped.
(cd "$work" && npm pack ./package --ignore-scripts --silent >/dev/null)
mv "$work/swmansion-argent-$version.tgz" "$work/argentw-$version.tgz"
echo "$work/argentw-$version.tgz"
