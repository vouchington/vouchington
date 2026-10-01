import { classifyArtifact } from './cleanup-artifacts-patterns.mts'
import {
  defaultDeps,
  sweepCleanup as sweepCleanupEngine,
  type CleanupDeps,
  type DeletionSummary,
} from 'vouchington-tooling/gha-artifacts-cleanup'

export type { CleanupDeps }
export { defaultDeps }

export async function sweepCleanup(
  repo: string,
  token: string,
  olderThanHours: number,
  deps: CleanupDeps = defaultDeps,
  log: (message: string) => void = console.error,
): Promise<DeletionSummary> {
  return sweepCleanupEngine({
    repo,
    token,
    olderThanHours,
    classify: classifyArtifact,
    deps,
    log,
  })
}
