import { isAreaGateJob } from './ci-aggregate-jobs.mts'
import { getGithubActionsStepGroupSlices } from './github-actions-log.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

const detectChangesWorkflowNames = new Set([
  'Backend',
  'Web',
  'Cloudflare Worker',
  'Lambdas',
  'Tooling',
])
const detectChangesJobNames = new Set(['changes / detect-changes'])
const githubServerErrorDoctypeMarker = '<!DOCTYPE html>'
const githubServerErrorUnicornTitleMarker = '<title>Unicorn! &middot; GitHub</title>'
const pathsFilterStepHeaderPrefix = '##[group]Run dorny/paths-filter@'
const pullRequestFilesGroupMarker = 'Fetching list of changed files for PR'
const listFilesInvocationMarker = 'Invoking listFiles('
const connectTimeoutErrorMarker = '##[error]Connect Timeout Error'
const connectTimeoutAnnotation = 'Connect Timeout Error'

function soleGenuinelyFailedDetectChangesJob(ctx: WorkflowRunContext): string | null {
  const genuinelyFailed = ctx.failedJobNames.filter(
    name => !isAreaGateJob(ctx.workflowName, name) && ctx.jobConclusions?.get(name) !== 'cancelled',
  )
  if (genuinelyFailed.length !== 1) return null
  const [jobName] = genuinelyFailed
  return jobName !== undefined && detectChangesJobNames.has(jobName) ? jobName : null
}

// The octokit RequestError surfaced by dorny/paths-filter's getChangedFilesFromApi call
// carries GitHub's branded server-error HTML page as its message when the
// pull-request-files API returns a 5xx. Other error shapes (a JSON error body, a
// non-GitHub 5xx page, a generic step failure) are intentionally not matched here.
function isGitHubServerErrorPageAnnotation(message: string): boolean {
  return (
    message.startsWith(githubServerErrorDoctypeMarker) &&
    message.includes(githubServerErrorUnicornTitleMarker)
  )
}

export const detectChangesPathsFilterGithub5xxRule: TransientRetryRule = {
  id: 'detect-changes-paths-filter-github-5xx',
  consumerKey: 'detect-changes-paths-filter',
  rootCauseKey: 'github-http-5xx',
  description:
    "The detect-changes job fails only because dorny/paths-filter's pull-request-files API call receives a GitHub 5xx server-error page.",
  rationale:
    'detect-changes is the sole genuinely-failed job and every annotation on it is the branded GitHub 5xx HTML error page that octokit surfaces from a failed pull-request-files API call, not a repository content or configuration problem.',
  exampleRunIds: ['29542126581'],
  maxAttempts: 1,
  needsAnnotations: true,
  match: async ctx => {
    if (!detectChangesWorkflowNames.has(ctx.workflowName) || ctx.conclusion !== 'failure')
      return false
    const jobName = soleGenuinelyFailedDetectChangesJob(ctx)
    if (jobName === null) return false

    const annotations = await ctx.failedJobAnnotations(jobName)
    return annotations.length > 0 && annotations.every(isGitHubServerErrorPageAnnotation)
  },
}

function isSoleConnectTimeoutError(log: string): boolean {
  const errorLines = log.split('\n').filter(line => line.includes('##[error]'))
  if (errorLines.length !== 1) return false
  const line = errorLines[0] ?? ''
  const markerAt = line.indexOf(connectTimeoutErrorMarker)
  return markerAt >= 0 && line.slice(markerAt).replace(/\r$/, '') === connectTimeoutErrorMarker
}

// dorny/paths-filter prints only the error message, not undici's TypeError/UND_ERR_CONNECT_TIMEOUT
// dump, so hasUndiciConnectTimeout() cannot see this failure. Anchor to the paths-filter step and
// its pull-request file-list call instead of copying those undici markers.
function hasPathsFilterPullRequestFilesConnectTimeout(log: string): boolean {
  if (!isSoleConnectTimeoutError(log)) return false
  return getGithubActionsStepGroupSlices(log).some(slice => {
    if (!slice.header.startsWith(pathsFilterStepHeaderPrefix)) return false
    const fetchAt = slice.log.indexOf(pullRequestFilesGroupMarker)
    const listAt = slice.log.indexOf(listFilesInvocationMarker)
    const errorAt = slice.log.indexOf(connectTimeoutErrorMarker)
    return fetchAt >= 0 && listAt > fetchAt && errorAt > listAt
  })
}

export const detectChangesPathsFilterGithubConnectTimeoutRule: TransientRetryRule = {
  id: 'detect-changes-paths-filter-github-connect-timeout',
  consumerKey: 'detect-changes-paths-filter',
  rootCauseKey: 'github-api-connect-timeout',
  description:
    "The detect-changes job fails only because dorny/paths-filter's pull-request-files API call times out while connecting.",
  rationale:
    'detect-changes is the sole genuinely-failed job. The paths-filter step had started listing pull-request files, and both the job log and its only annotation are the connect-timeout error. No HTTP status or filter diagnostic was produced.',
  maxAttempts: 1,
  needsLogs: true,
  needsAnnotations: true,
  match: async ctx => {
    if (!detectChangesWorkflowNames.has(ctx.workflowName) || ctx.conclusion !== 'failure')
      return false
    const jobName = soleGenuinelyFailedDetectChangesJob(ctx)
    if (jobName === null) return false

    const annotations = await ctx.failedJobAnnotations(jobName)
    if (
      annotations.length === 0 ||
      !annotations.every(message => message === connectTimeoutAnnotation)
    ) {
      return false
    }

    const logs = await ctx.failedJobLogs()
    return hasPathsFilterPullRequestFilesConnectTimeout(logs.get(jobName) ?? '')
  },
}
