import { sliceGithubActionsStepGroup } from './github-actions-log.mts'

// Exported so the marker-freshness guard (step-group-marker-freshness.test.mts) can assert these
// stay in sync with the `run:` values in the workflows below, rather than drifting silently the way
// the oxlint marker did when #8754 wrapped the command in ci/with-heavy-slot.sh.
export const cloudflareWorkerTscStepMarker =
  '##[group]Run pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json'
export const oxlintTypeAwareStepMarker =
  '##[group]Run pnpm exec oxlint --type-aware --deny-warnings'

export function hasCloudflareWorkerTscRuntimeCrash(log: string): boolean {
  const cloudflareWorkerStepLog = sliceGithubActionsStepGroup(log, cloudflareWorkerTscStepMarker)

  return (
    cloudflareWorkerStepLog.includes(
      'pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
    ) &&
    cloudflareWorkerStepLog.includes('runtime: g ') &&
    cloudflareWorkerStepLog.includes(
      'unexpected return pc for github.com/microsoft/typescript-go/',
    ) &&
    cloudflareWorkerStepLog.includes('fatal error: unknown caller pc') &&
    cloudflareWorkerStepLog.includes('##[error]Process completed with exit code 2.')
  )
}

export function hasOxlintTsgolintRuntimeFault(log: string): boolean {
  const oxlintStepLog = sliceGithubActionsStepGroup(log, oxlintTypeAwareStepMarker)

  return (
    oxlintStepLog.includes('pnpm exec oxlint --type-aware --deny-warnings') &&
    oxlintStepLog.includes('unexpected fault address ') &&
    oxlintStepLog.includes('fatal error: fault') &&
    // The Go import path, not a filesystem path: stable across the 0.23.0 vendored-checkout
    // traceback shape (symbol-line prefix) and the 7.0.2001 -trimpath'd module shape (both symbol
    // and file-line prefix), unlike the old `/tsgolint/typescript-go/internal/` build-path fragment
    // that only matched a checkout layout tsgolint@7.0.2001 no longer has.
    oxlintStepLog.includes('github.com/microsoft/typescript-go/internal/') &&
    // Only the prefix: the exact doubled "exit status: exit status: 2" composition was a 0.23.0
    // formatting artifact that cannot be verified against the current oxlint-tsgolint@7.0.2001
    // binary. The four other conjuncts plus the exit-code line below keep this anchored.
    oxlintStepLog.includes('Error running tsgolint: ') &&
    oxlintStepLog.includes('##[error]Process completed with exit code 1.')
  )
}
