import type { TransientRetryRule, WorkflowRunContext } from './types.mts'
import { isAreaGateJob } from './ci-aggregate-jobs.mts'

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
