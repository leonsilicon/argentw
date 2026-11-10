#!/usr/bin/env bash
# Fails when an upstream merge dropped one of argentw's hooks into upstream files. A
# merge can apply cleanly and still lose one: upstream rewrites the function a hook
# sat in, and the new version simply doesn't call argentw. argentw/PATCH.md explains
# each hook; keep this list in step with it.
set -euo pipefail
cd "$(dirname "$0")/.."

status=0
need() { # <file> <text the file must contain>
  if [[ ! -f "$1" ]]; then
    echo "missing file: $1 (needs: $2)" >&2
    status=1
  elif ! grep -qF -- "$2" "$1"; then
    echo "hook lost: $1 no longer contains: $2" >&2
    status=1
  fi
}

ios=packages/tool-server/src/utils/ios-device
runner=packages/ios-device-runner/ArgentRunner/ArgentRunnerUITests

# Wireless transport (host)
need $ios/devicectl.ts "const info = await readDeviceLink(udid);"
need $ios/devicectl.ts "!isWirelessLink(info)"
need $ios/devicectl.ts "tunnelIPAddress: conn?.tunnelIPAddress ?? null,"
need $ios/runner-route.ts "socketFactory: () => openRunnerSocket("
need $ios/runner-http.ts "[ARGENTW_TOKEN_HEADER]: argentwToken(),"
need $ios/runner-launch.ts "env: argentwRunnerEnvironment(),"
need packages/tool-server/src/tools/devices/list-devices.ts "isReachableTransport(d.transportType, d.tunnelState)"

# Wireless transport (runner)
need $runner/RunnerHTTPServer.swift "if !ArgentwNetwork.listensBeyondLoopback {"
need $runner/RunnerHTTPServer.swift "case .complete where !ArgentwNetwork.authorizes(buffer):"
if [[ $(grep -c "requiredInterfaceType = .loopback" $runner/RunnerHTTPServer.swift) != 1 ]]; then
  echo "hook lost: RunnerHTTPServer.swift must restrict to loopback exactly once, inside the argentw guard" >&2
  status=1
fi

# Updates from argentw's releases, never npm's upstream argent
need packages/update-core/src/index.ts "argentwInstallSpec,"
need packages/update-core/src/pick-target.ts "isPrerelease(version)"
need packages/tool-server/src/utils/update-checker.ts "const REGISTRY_URL = ARGENTW_REGISTRY_URL;"
need packages/argent-installer/src/update-target.ts "fetchRegistryInfo(ARGENTW_REGISTRY_URL)"
need packages/argent-installer/src/update.ts "globalInstallCommand(pm, argentwInstallSpec(target))"
need packages/argent-installer/src/update.ts "localInstallCommand(pm, argentwInstallSpec(target))"

# Agent-facing docs
need packages/skills/skills/argent-ios-device-setup/SKILL.md "argentw: after that first cabled setup"
need packages/skills/rules/argent.md "(argentw) without one over CoreDevice"

if [[ $status == 0 ]]; then
  echo "argentw hooks: all present" >&2
fi
exit $status
