import {
  ARGENTW_REGISTRY_URL,
  detectMinReleaseAgeMsForPm,
  fetchRegistryInfo,
  pickInstallableTarget,
} from "@argent/update-core";
import type { PackageManager } from "./utils.js";

interface ResolvedUpdateTarget {
  latestVersion: string;
  latestPublishedAt: string | null;
  /** Newest stable upgrade installable now under the release-age policy. */
  targetVersion: string | null;
  minReleaseAgeMs: number;
}

/**
 * Resolve the version `argent update` should install for `pm`: the newest
 * stable release newer than `current` that also clears the machine's
 * minimum-release-age policy. Returns null when the registry lookup fails.
 */
export async function resolveInstallableUpdateTarget(
  pm: PackageManager,
  current: string | null
): Promise<ResolvedUpdateTarget | null> {
  // argentw: its own releases, not npm's upstream argent.
  const info = await fetchRegistryInfo(ARGENTW_REGISTRY_URL);
  if (info === null) return null;

  const minReleaseAgeMs = await detectMinReleaseAgeMsForPm(pm);
  const target = pickInstallableTarget(info.latest, info.times, current, minReleaseAgeMs);

  return {
    latestVersion: info.latest.version,
    latestPublishedAt: info.latest.publishedAt,
    targetVersion: target?.version ?? null,
    minReleaseAgeMs,
  };
}
