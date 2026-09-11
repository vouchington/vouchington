import { classifyArtifact } from './cleanup-artifacts-patterns.mts'
import {
  defaultDeps,
  runCleanup as runCleanupEngine,
  sweepCleanup as sweepCleanupEngine,
  type CleanupDeps,
  type DeletionSummary,
} from 'vouchington-tooling/gha-artifacts-cleanup'

export type { CleanupDeps }
export { defaultDeps }

export async function runCleanup(
  repo: string,
  token: string,
  runId: string,
  deps: CleanupDeps = defaultDeps,
  log: (message: string) => void = console.error,
): Promise<DeletionSummary> {
  return runCleanupEngine({ repo, token, runId, classify: classifyArtifact, deps, log })
}

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
