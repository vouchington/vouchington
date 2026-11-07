import { terminalFailedGithubActionsStepLog } from 'vouchington-tooling/transient-retry'
import {
  hasCurlGithubReleaseTransportExit,
  isGithubReleasesDownloadFlake,
} from './github-releases-download-fingerprint.mts'
import type { TransientRetryRule } from './types.mts'

// The reusable scan reports as `<caller job> / <callee job>`; the local `gitleaks` gate job fails with it.
const gitleaksJobName = 'gitleaks-scan / gitleaks'
const gitleaksGateJobName = 'gitleaks'

function hasGitleaksInstallReleasesDownloadFlake(log: string): boolean {
  const installLog = terminalFailedGithubActionsStepLog(log)
  const installStepTimedOut = installLog.includes("The action 'Install gitleaks' has timed out")
  const usesGitleaksInstaller =
    installLog.includes('--repo gitleaks/gitleaks') ||
    installLog.includes('github.com/gitleaks/gitleaks/releases/download/')

  const downloadFailedIndex = installLog.lastIndexOf('DOWNLOAD FAILED: ')
  const downloadFailedSlice =
    downloadFailedIndex === -1 ? '' : installLog.slice(downloadFailedIndex)

  return (
    (usesGitleaksInstaller && installStepTimedOut) ||
    (usesGitleaksInstaller && hasCurlGithubReleaseTransportExit(installLog)) ||
    (downloadFailedSlice !== '' &&
      isGithubReleasesDownloadFlake(
        downloadFailedSlice,
        'github.com/gitleaks/gitleaks/releases/download/',
      ))
  )
}

function isOnlyFailedGitleaksJob(ctx: {
  workflowName: string
  conclusion: string
  failedJobNames: readonly string[]
}): boolean {
  return (
    ctx.workflowName === 'Gitleaks' &&
    ctx.conclusion === 'failure' &&
    ctx.failedJobNames.length === 2 &&
    ctx.failedJobNames.includes(gitleaksJobName) &&
    ctx.failedJobNames.includes(gitleaksGateJobName)
  )
}

export const gitleaksInstallReleasesDownloadFlakeRule: TransientRetryRule = {
  id: 'gitleaks-install-releases-download-flake',
  consumerKey: 'gitleaks-install',
  rootCauseKey: 'github-release-download-failure',
  description:
    'Gitleaks fails before scanning because the install step cannot download the release archive or checksum file from GitHub Releases (timeout, transport failure, or 5xx).',
  rationale:
    'The scan never starts. The only failed jobs are the Gitleaks scan and its gate, and the fingerprint is an external GitHub Releases download failure. install-github-release.sh runs curl -fsSL under set -e, so HTTP 5xx and transport failures exit 22, 28, or 56; older wrappers exited 1 for the same curl lines. A secret finding or any other install error stays closed.',
  exampleRunIds: ['42157598394', '26831005135', '27120697184', '27121476157'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!isOnlyFailedGitleaksJob(ctx)) return false

    const logs = await ctx.failedJobLogs()
    return hasGitleaksInstallReleasesDownloadFlake(logs.get(gitleaksJobName) ?? '')
  },
}
