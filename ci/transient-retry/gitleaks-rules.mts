import { terminalFailedGithubActionsStepLog } from './github-actions-log.mts'
import { isGithubReleasesDownloadFlake } from './github-releases-download-fingerprint.mts'
import type { TransientRetryRule } from './types.mts'

const gitleaksJobName = 'gitleaks'

function hasGitleaksInstallReleasesDownloadFlake(log: string): boolean {
  const installLog = terminalFailedGithubActionsStepLog(log)
  const installStepTimedOut = installLog.includes("The action 'Install gitleaks' has timed out")
  const usesGitleaksInstaller =
    installLog.includes('--repo gitleaks/gitleaks') ||
    installLog.includes('github.com/gitleaks/gitleaks/releases/download/')

  const downloadFailedIndex = installLog.lastIndexOf('DOWNLOAD FAILED: ')
  const downloadFailedSlice =
    downloadFailedIndex === -1 ? '' : installLog.slice(downloadFailedIndex)
  const curlFlake =
    installLog.includes('curl: (28)') ||
    installLog.includes('curl: (56)') ||
    /curl: \(22\).* (?:000|5\d\d)/.test(installLog)

  return (
    (usesGitleaksInstaller && installStepTimedOut) ||
    (usesGitleaksInstaller &&
      curlFlake &&
      installLog.includes('Process completed with exit code 1.')) ||
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
  failedJobNames: string[]
}): boolean {
  return (
    ctx.workflowName === 'Gitleaks' &&
    ctx.conclusion === 'failure' &&
    ctx.failedJobNames.length === 1 &&
    ctx.failedJobNames[0] === gitleaksJobName
  )
}

export const gitleaksInstallReleasesDownloadFlakeRule: TransientRetryRule = {
  id: 'gitleaks-install-releases-download-flake',
  consumerKey: 'gitleaks-install',
  rootCauseKey: 'github-release-download-failure',
  description:
    'Gitleaks fails before scanning because the install step cannot download the release archive or checksum file from GitHub Releases (timeout, transport failure, or 5xx).',
  rationale:
    'The scan never starts; the only failed job is the standalone Gitleaks job and the stable fingerprint is an external GitHub Releases download failure, not a repository secret finding or local code failure.',
  exampleRunUrls: [
    'https://github.com/jonathanong/filaments/actions/runs/26831005135',
    'https://github.com/jonathanong/filaments/actions/runs/27120697184',
    'https://github.com/jonathanong/filaments/actions/runs/27121476157',
  ],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!isOnlyFailedGitleaksJob(ctx)) return false

    const logs = await ctx.failedJobLogs()
    return hasGitleaksInstallReleasesDownloadFlake(logs.get(gitleaksJobName) ?? '')
  },
}
