# argentw

**argent, with wireless iPhone control.** argentw is [software-mansion/argent](https://github.com/software-mansion/argent), the MCP server that lets AI agents drive iOS simulators, Android emulators, physical iPhones and more, plus one change. AI agents can drive a physical iPhone **without a cable** once the phone is on the same network as the Mac.

Upstream drives a physical iPhone only over USB. argentw reaches the same on-device runner through CoreDevice's encrypted, pairing-authenticated network tunnel, the one Xcode uses for wireless debugging. A per-Mac token keeps anyone else on the network from commanding the runner. [argentw/PATCH.md](../argentw/PATCH.md) lists everything argentw changes and how it works.

argentw follows upstream's releases. A scheduled workflow merges each new upstream release, rebuilds argentw's patch onto it (with Claude when the merge needs it), and opens a pull request. Merging it publishes a release.

## Requirements

- Set the iPhone up with a cable once, the way upstream argent requires: Developer Mode on, this Mac trusted, and the runner signed and installed. The `argent-ios-device-setup` skill walks through it.
- For cable-free use, the iPhone must be **unlocked on a network where it and the Mac can reach each other**: home Wi-Fi, or the Mac joined to the iPhone's Personal Hotspot. Campus and other enterprise Wi-Fi usually isolate clients, and then nothing wireless works there, Xcode's own wireless debugging included.
- `list-devices` shows a reachable phone as `connected` with `transportType: "localNetwork"`.

## Install

argentw installs in place of `@swmansion/argent` (it keeps the package name, so existing MCP entries keep working) and adds an `argentw` command next to `argent`.

```sh
git clone https://github.com/leonsilicon/argentw && argentw/argentw/install.sh
```

`install.sh` installs the newest release through Vite+ (`vp install -g`), refreshes every agent's MCP entry, skills and rules (`argent init -y`), and restarts the tool-server. Open agent sessions then need to reconnect argent (`/mcp`). To install one release by hand:

```sh
cd ~ && vp install -g "@swmansion/argent@https://github.com/leonsilicon/argentw/releases/download/v<version>/argentw-<version>.tgz" && argent init -y
```

To go back to upstream: `cd ~ && vp install -g @swmansion/argent@latest && argent init -y`.

## Versions

`<upstream version>-argentw.<n>`: for example, `0.32.0-argentw.1` is upstream 0.32.0 with argentw's patch, release 1. argent's update check reads [argentw's releases](https://github.com/leonsilicon/argentw/releases), never npm, so updating can't silently replace argentw with upstream.

## License

Apache-2.0, like upstream ([LICENSE.txt](../LICENSE.txt)). argent is © Software Mansion. argentw isn't affiliated with or endorsed by Software Mansion.
