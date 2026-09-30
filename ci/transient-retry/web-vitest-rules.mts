import type { TransientRetryRule } from './types.mts'
import { webTestsShardPattern } from './runner-shutdown-consumer-registry.mts'
import { hasWebVitestSegfault } from './web-vitest-log-fingerprints.mts'

import { isAreaGateJob } from './ci-aggregate-jobs.mts'

function singleFailedWebShard(failedJobNames: string[]): string | undefined {
  const shards = failedJobNames.filter(name => webTestsShardPattern.test(name))
  return shards.length === 1 ? shards[0] : undefined
}

export const webVitestSigsegvRule: TransientRetryRule = {
  id: 'web-vitest-sigsegv',
  consumerKey: 'web-vitest',
  rootCauseKey: 'native-segfault',
  description: 'Web unit test CI job SIGSEGVs before assertions.',
  rationale:
    'Native crash before test output; the current web project/shard command identifies the producer while avoiding an assumption about whether coverage was enabled.',
  exampleRunIds: ['26764065016'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Web' || ctx.conclusion !== 'failure') return false
    const webTestsJobName = singleFailedWebShard(ctx.failedJobNames)
    if (!webTestsJobName) return false
    if (
      ctx.failedJobNames.some(
        name => name !== webTestsJobName && !isAreaGateJob(ctx.workflowName, name),
      )
    ) {
      return false
    }

    const logs = await ctx.failedJobLogs()
    return hasWebVitestSegfault(logs.get(webTestsJobName) ?? '')
  },
}
