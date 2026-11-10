# argentw's patch to upstream argent

argentw is [software-mansion/argent](https://github.com/software-mansion/argent) plus one change: it drives a physical iPhone without a cable. Everything else is upstream's, so this file is the complete list of what argentw changes. `argentw/check.sh` fails if an upstream merge drops one of the hooks below.

## How it works

Upstream drives only a cabled iPhone. `ensureDeviceReady` rejects any CoreDevice transport but `wired`, and usbmux carries each runner command to the XCUITest runner, which binds the phone's loopback.

When a paired iPhone is unlocked on the same network as the Mac, CoreDevice still reaches it: `devicectl device info details` reports `transportType: "localNetwork"`, `tunnelState: "connected"` and a `tunnelIPAddress`, the phone's address inside CoreDevice's encrypted, pairing-authenticated tunnel. argentw sends runner commands to that address.

The runner then has to accept connections that don't arrive on loopback. Each Mac has a token: 32 random bytes in `~/.argent/argentw-token`, mode 0600. The tool-server passes it to the runner as `TEST_RUNNER_ARGENTW_TOKEN`, and xcodebuild forwards it without the prefix. With a token, the runner listens on every interface, and it answers 401 to any request whose `X-Argentw-Token` header doesn't match. That covers its port on the Wi-Fi interface too. The host only ever sends the token through the tunnel or the cable. Without a token, the runner behaves exactly like upstream's.

A cabled phone keeps upstream's usbmux path. To test the tunnel path without a network the phone and Mac share, start the tool-server with `ARGENTW_TRANSPORT=tunnel`: a cabled phone's commands then go through the tunnel too, because CoreDevice runs the same tunnel over USB.

## New files

- `packages/tool-server/src/utils/ios-device/network.argentw.ts`: picks the tunnel or usbmux for each command, dials the tunnel, and manages the token.
- `packages/ios-device-runner/ArgentRunner/ArgentRunnerUITests/RunnerHTTPServer+Argentw.swift`: the runner's token check. The Xcode project uses synchronized groups, so it compiles without a project-file change.
- `packages/update-core/src/argentw.ts`: where argentw's updates come from.
- `packages/tool-server/test/ios-device-network.argentw.test.ts`
- `argentw/`: packaging, version, install, hook check, the sync prompt, and this file.
- `.github/README.md` (shown on GitHub in place of upstream's README) and `.github/workflows/argentw-*.yml`.

## Removed

- `.github/dependabot.yml`: its dependency-update PRs belong upstream. The sync keeps it deleted when upstream edits it. Upstream's workflows stay in the tree, but they are disabled on GitHub (the sync workflow's last step).

## Hooks in upstream files

Each is a line or two, marked with an `argentw:` comment.

| File                                                         | Hook                                                                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool-server/src/utils/ios-device/devicectl.ts`              | `deviceInfoDetails` also returns `tunnelIPAddress`; new `readDeviceLink` records it; `ensureDeviceReady` accepts a wireless link with its tunnel connected |
| `tool-server/src/utils/ios-device/runner-route.ts`           | the socket factory is `openRunnerSocket` (tunnel or usbmux) instead of `openUsbmuxRunnerSocket`                                                            |
| `tool-server/src/utils/ios-device/runner-http.ts`            | sends the `X-Argentw-Token` header                                                                                                                         |
| `tool-server/src/utils/ios-device/runner-launch.ts`          | spawns xcodebuild with `TEST_RUNNER_ARGENTW_TOKEN`                                                                                                         |
| `tool-server/src/tools/devices/list-devices.ts`              | a phone on the network with its tunnel connected lists as `connected`; the tool description says so                                                        |
| `ios-device-runner/.../RunnerHTTPServer.swift`               | loopback-only unless a token is set; refuses a complete request without the token                                                                          |
| `update-core/src/pick-target.ts`, `update-core/src/index.ts` | `-argentw.N` versions count as stable; exports the argentw helpers                                                                                         |
| `tool-server/src/utils/update-checker.ts`                    | update checks read argentw's `registry.json`, not npm                                                                                                      |
| `argent-installer/src/update-target.ts`, `update.ts`         | `argent update` resolves and installs argentw releases, not npm's upstream argent                                                                          |
| `skills/skills/argent-ios-device-setup/SKILL.md`             | the cable is optional after the first setup                                                                                                                |
| `skills/rules/argent.md`                                     | the same, in the rule every agent loads                                                                                                                    |

Three upstream tests changed to argentw's behavior: `tool-server/test/ios-device-devicectl-ready.test.ts` (a phone on the network is accepted), `tool-server/test/list-devices.test.ts` (it lists as `connected`) and `argent-installer/test/update-target.test.ts` (updates resolve from argentw's registry).

## Packaging

Upstream's native binaries (simulator-server, ax-service, dylibs, trace-processor) come from Software Mansion's private release repository, so argentw can't build them, and it doesn't change them. `argentw/build.sh` downloads upstream's published npm package of the same version, seeds those binaries where upstream's download scripts would put them, runs upstream's own build, and lays argentw's JS bundles, runner sources, skills, rules and agents over the published package. The package keeps the name `@swmansion/argent`, so every path that resolves it still works, and adds an `argentw` bin.

Versions are upstream's plus `-argentw.N`, where N counts argentw's commits since upstream's release tag (`argentw/version.sh`). `pick-target.ts` treats them as stable.

## Releases and updates

`argentw-release.yml` releases every trunk commit: the tarball goes on a GitHub release, and the version goes into `registry.json` on the `registry` branch. argent's update check reads that file instead of npm. Installing from npm would bring back upstream argent and drop this patch.

argent's own updater can't update a Vite+ global install, because the Vite+ shim hides the package root. `argentw/install.sh` does it instead.
