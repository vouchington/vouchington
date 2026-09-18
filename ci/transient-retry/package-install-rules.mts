import { hasSetupBackendPnpmActivationTimeout } from './package-install-log-fingerprints.mts'
import { CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'
import type { TransientRetryRule } from './types.mts'

const isPlaywrightShard = (name: string) => name.startsWith('test-playwright / playwright-tests (')
const postgresSchemaJobName = 'postgres-schema-tests / postgres-schema-tests'
const mainChecksTsSharedJobName = 'ts-shared-tests / ts-shared'

function getFailedPlaywrightShardNames(failedJobNames: string[]): string[] | null {
  if (
    failedJobNames.some(
      name => !isPlaywrightShard(name) && !CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES.has(name),
    )
  ) {
    return null
  }
  const failedPlaywrightShardNames = failedJobNames.filter(name => isPlaywrightShard(name))
  return failedPlaywrightShardNames.length > 0 ? failedPlaywrightShardNames : null
}

export const playwrightSetupBackendPnpmActivationTimeoutRule: TransientRetryRule = {
  id: 'playwright-setup-backend-pnpm-activation-timeout',
  consumerKey: 'setup-backend-pnpm-activation',
  rootCauseKey: 'npm-install-timeout',
  description:
    'A setup-backend job times out while the pnpm activation fallback is still running npm install.',
  rationale:
    'The failure happens before Playwright, SQL safety checks, migrations, schema tests, ts-shared tests, snapshot verification, or app builds run; the timed-out setup-backend job was still installing the pinned pnpm version.',
  exampleRunIds: ['27902627869', '29881162902', '30664444111'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.conclusion !== 'failure') return false

    if (ctx.workflowName === 'CI') {
      const failedPlaywrightShardNames = getFailedPlaywrightShardNames(ctx.failedJobNames)
      if (!failedPlaywrightShardNames) return false

      const logs = await ctx.failedJobLogs()
      return failedPlaywrightShardNames.every(jobName =>
        hasSetupBackendPnpmActivationTimeout(logs.get(jobName) ?? ''),
      )
    }

    if (
      ctx.workflowName === 'Main CI (checks)' &&
      ctx.failedJobNames.length === 1 &&
      ctx.failedJobNames[0] === mainChecksTsSharedJobName
    ) {
      const logs = await ctx.failedJobLogs()
      return hasSetupBackendPnpmActivationTimeout(logs.get(mainChecksTsSharedJobName) ?? '')
    }

    if (
      ctx.workflowName !== 'Main CI (backend)' ||
      ctx.failedJobNames.length !== 1 ||
      ctx.failedJobNames[0] !== postgresSchemaJobName
    ) {
      return false
    }

    const logs = await ctx.failedJobLogs()
    return hasSetupBackendPnpmActivationTimeout(logs.get(postgresSchemaJobName) ?? '')
  },
}
