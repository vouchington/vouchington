import { hasPlaywrightSetupAptLockFailure } from './playwright-log-fingerprints.mts'
import { isAreaGateJob } from './ci-aggregate-jobs.mts'
import type { TransientRetryRule } from './types.mts'

const setupPlaywrightWorkflowNames = new Set(['Web'])
const storybookSetupJobNames = new Set(['storybook / storybook'])
export const isPlaywrightShardSetupJob = (name: string): boolean =>
  name.startsWith('test-playwright / playwright-tests (')
export const isPlaywrightSetupJob = (name: string): boolean =>
  isPlaywrightShardSetupJob(name) || name.includes('/ playwright-credentialed-tests')
const isSetupPlaywrightJob = (name: string) =>
  isPlaywrightSetupJob(name) || storybookSetupJobNames.has(name)

export function getFailedPlaywrightShardNames(
  failedJobNames: string[],
  workflowName: string,
): string[] | null {
  if (
    failedJobNames.some(name => !isSetupPlaywrightJob(name) && !isAreaGateJob(workflowName, name))
  ) {
    return null
  }

  const failedPlaywrightShardNames = failedJobNames.filter(name => isSetupPlaywrightJob(name))
  return failedPlaywrightShardNames.length > 0 ? failedPlaywrightShardNames : null
}

export const mainWebPlaywrightSetupAptLockRule: TransientRetryRule = {
  id: 'main-web-playwright-setup-apt-lock',
  consumerKey: 'setup-playwright',
  rootCauseKey: 'host-package-manager-lock',
  description:
    'Retry Playwright/Storybook jobs that fail in `Run ./.github/actions/setup-playwright` because of apt/dpkg lock contention or host package-manager lock timeout.',
  rationale:
    "A fresh GitHub-hosted runner's boot-time unattended-upgrades/apt-daily timer can still hold the dpkg lock when a job starts. When the Playwright dependency probe finds host drift, `setup-playwright` repairs it with `playwright install-deps` under the host package-manager lock. APT contention or host-lock timeout can fail that fallback; both are transient.",
  exampleRunIds: ['27805129632'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!setupPlaywrightWorkflowNames.has(ctx.workflowName) || ctx.conclusion !== 'failure')
      return false

    const failedPlaywrightShardNames = getFailedPlaywrightShardNames(
      ctx.failedJobNames,
      ctx.workflowName,
    )
    if (!failedPlaywrightShardNames) return false

    const logs = await ctx.failedJobLogs()
    return failedPlaywrightShardNames.every(jobName =>
      hasPlaywrightSetupAptLockFailure(logs.get(jobName) ?? ''),
    )
  },
}
