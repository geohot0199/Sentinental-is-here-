/**
 * Tiny bridge so triage.ts (which deals in plain JSON shapes on both sides of
 * the client/server boundary) can use the strict semver engine without
 * importing types across the wire.
 */
import { classifyBump, compareVersions, versionInRange } from "./semver";

export { classifyBump, compareVersions, versionInRange };

const RANKS: Record<string, number> = {
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1,
  unknown: 0,
};

export function severityRankSafe(severity: string): number {
  return RANKS[severity] ?? 0;
}
