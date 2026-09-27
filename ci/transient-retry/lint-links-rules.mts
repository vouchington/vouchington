import {
  getGithubActionsStepGroupSlices,
  terminalFailedGithubActionsStepLog,
} from './github-actions-log.mts'
import { isGithubReleasesDownloadFlake } from './github-releases-download-fingerprint.mts'
import type { TransientRetryRule } from './types.mts'

const lintLinksJobName = 'lint-links'
const githubHostPattern = /^https:\/\/github\.com\//
const lycheeFailureLinePattern = /(?:^|\s)\[(?<marker>[^\s\]]+)\] (?<url>\S+)/
const github5xxMarkerPattern = /^5\d{2}$/

type LycheeFailure = { marker: string; url: string }

function lycheeFailureLines(log: string): LycheeFailure[] {
  const marker = 'Issues found in '
  const lastMarkerIndex = log.lastIndexOf(marker)
  const terminalLog = lastMarkerIndex !== -1 ? log.slice(lastMarkerIndex) : log

  const failures: LycheeFailure[] = []
  for (const rawLine of terminalLog.split('\n')) {
    const match = lycheeFailureLinePattern.exec(rawLine.trim())
    if (match?.groups?.marker !== undefined && match.groups.url !== undefined) {
      failures.push({ marker: match.groups.marker, url: match.groups.url })
    }
  }
  return failures
}

function isGithub5xxLycheeFailure({ marker, url }: LycheeFailure): boolean {
  return github5xxMarkerPattern.test(marker) && githubHostPattern.test(url)
}

function hasOnlyGithub5xxLycheeFailures(log: string): boolean {
  if (!log.includes('Issues found in ') || !log.includes('Process completed with exit code 2.')) {
    return false
  }

  const failures = lycheeFailureLines(log)
  return failures.length > 0 && failures.every(isGithub5xxLycheeFailure)
}

const githubComDnsResolutionFailurePattern =
  /curl: \(6\) Could not resolve host: github\.com(?:\s|$)/m

function terminalLycheeSetupFailureLog(log: string): string {
  const slices = getGithubActionsStepGroupSlices(log)
  let exit6Index = -1
  for (let index = slices.length - 1; index >= 0; index -= 1) {
    if ((slices[index]?.log ?? '').includes('Process completed with exit code 6.')) {
      exit6Index = index
      break
    }
  }

  const sharedTerminalLog = terminalFailedGithubActionsStepLog(log)
  if (exit6Index === -1) return sharedTerminalLog

  const exit6Log = slices[exit6Index]?.log ?? ''
  if (sharedTerminalLog === '') return exit6Log

  const sharedIndex = slices.findIndex(slice => slice.log === sharedTerminalLog)
  return exit6Index > sharedIndex ? exit6Log : sharedTerminalLog
}

function hasSetupLycheeReleasesDownloadFlake(log: string): boolean {
  const setupLog = terminalLycheeSetupFailureLog(log)
  const mentionsLycheeInstaller =
    setupLog.includes('--repo lycheeverse/lychee') ||
    setupLog.includes('github.com/lycheeverse/lychee/releases/download/')
  if (!mentionsLycheeInstaller) return false

  if (
    githubComDnsResolutionFailurePattern.test(setupLog) &&
    setupLog.includes('Process completed with exit code 6.')
  ) {
    return true
  }

  if (!setupLog.includes('Process completed with exit code 1.')) return false

  const curlFlake =
    setupLog.includes('curl: (28)') ||
    setupLog.includes('curl: (56)') ||
    /curl: \(22\).* (?:000|5\d\d)/.test(setupLog)
  if (curlFlake) return true

  const downloadFailedIndex = setupLog.lastIndexOf('DOWNLOAD FAILED: ')
  if (downloadFailedIndex === -1) return false
  return isGithubReleasesDownloadFlake(
    setupLog.slice(downloadFailedIndex),
    'github.com/lycheeverse/lychee/releases/download/',
  )
}

function isOnlyFailedLintLinksJob(ctx: {
  workflowName: string
  conclusion: string
  failedJobNames: string[]
}): boolean {
  return (
    ctx.workflowName === 'Lint Links' &&
    ctx.conclusion === 'failure' &&
    ctx.failedJobNames.length === 1 &&
    ctx.failedJobNames[0] === lintLinksJobName
  )
}

export const lintLinksGithub5xxRule: TransientRetryRule = {
  id: 'lint-links-github-5xx',
  consumerKey: 'lychee-link-check',
  rootCauseKey: 'github-http-5xx',
  description: 'Lint Links fails only because Lychee reports transient GitHub-hosted 5xx URLs.',
  rationale:
    'The Markdown links are valid references, the only failed job is the standalone Lychee job, and 5xx responses from github.com are upstream server failures rather than repository content bugs.',
  exampleRunIds: ['27894821921'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!isOnlyFailedLintLinksJob(ctx)) return false

    const logs = await ctx.failedJobLogs()
    return hasOnlyGithub5xxLycheeFailures(logs.get(lintLinksJobName) ?? '')
  },
}

export const lintLinksSetupLycheeDownloadFlakeRule: TransientRetryRule = {
  id: 'lint-links-setup-lychee-download-flake',
  consumerKey: 'setup-lychee',
  rootCauseKey: 'github-release-download-failure',
  description:
    'Lint Links fails before link checking because setup-lychee cannot download the pinned Lychee release asset from GitHub Releases, including when DNS cannot resolve github.com.',
  rationale:
    'The Markdown link checker never starts; the only failed job is lint-links and the stable fingerprint is an external GitHub Releases download or github.com DNS failure, not a broken repository link.',
  exampleRunIds: ['29263881027'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!isOnlyFailedLintLinksJob(ctx)) return false

    const logs = await ctx.failedJobLogs()
    return hasSetupLycheeReleasesDownloadFlake(logs.get(lintLinksJobName) ?? '')
  },
}
