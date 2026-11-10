import semver from "semver";

/**
 * argentw: updates come from leonsilicon/argentw, never from npm.
 *
 * argentw ships as a tarball on its GitHub releases, still named
 * `@swmansion/argent` so every path that resolves the package keeps working.
 * Updating from npm would replace it with upstream argent and drop the
 * wireless patch. So the update check reads argentw's own registry document
 * (npm packument shape: `dist-tags.latest` and `time`), and installs take the
 * release tarball's URL in place of a registry spec.
 */

export const ARGENTW_REPOSITORY = "leonsilicon/argentw";

/**
 * Kept on the `registry` branch by the release workflow, so releases add no commits to
 * trunk. raw.githubusercontent.com answers 200 without a redirect, which
 * fetchRegistryInfo needs.
 */
export const ARGENTW_REGISTRY_URL = `https://raw.githubusercontent.com/${ARGENTW_REPOSITORY}/registry/registry.json`;

/** argentw versions are upstream's with an `-argentw.N` prerelease tag, e.g. 0.32.0-argentw.3. */
export function isArgentwVersion(version: string): boolean {
  const pre = semver.prerelease(version);
  return pre !== null && pre[0] === "argentw";
}

/** An argentw release's tarball. */
export function argentwTarballUrl(version: string): string {
  return `https://github.com/${ARGENTW_REPOSITORY}/releases/download/v${version}/argentw-${version}.tgz`;
}

/**
 * The install spec for an argentw version: its release tarball under the package's own
 * name. npm, pnpm, yarn, bun and Vite+ (`vp install -g`) all take `name@url`; Vite+
 * rejects a bare URL.
 */
export function argentwInstallSpec(version: string): string {
  return `@swmansion/argent@${argentwTarballUrl(version)}`;
}
