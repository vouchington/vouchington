import { describe } from 'vitest'
import { createAutotaggerRunAdapter } from '@services/autotagger'
import { claimClassifierRun } from '@services/classifier-runs'
import { describeClassifierProviderFailures } from '@voucha/test-helpers/classifier-provider-failure-tests'
import {
  claimAutotaggerLease,
  createAutotaggerPostFixture,
  TAGGING_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getSubjectClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { createAutotaggerClient } from './classifier-run-client.mts'
import { executeAutotaggerRun } from './classifier-run.mts'

const adapter = createAutotaggerRunAdapter()

describe('autotagger provider failures (real receipts, real client)', () => {
  describeClassifierProviderFailures({
    slug: TAGGING_CLASSIFIER_SLUG,
    async prepare() {
      const fixture = await createAutotaggerPostFixture()
      let lease = await claimAutotaggerLease(fixture)
      const { runId } = lease
      return {
        runId,
        execute: (fetch, { maxAttempts = 3, apiKey } = {}) =>
          executeAutotaggerRun(
            { adapter, lease, maxAttempts, signal: AbortSignal.timeout(30_000) },
            {
              createClient: hooks =>
                createAutotaggerClient(
                  {
                    postId: fixture.post.id,
                    modelProvider: 'openrouter',
                    classifierRunId: hooks.classifierRunId,
                    beforeAttempt: hooks.beforeAttempt,
                  },
                  { fetch, apiKey: apiKey ?? 'test-key' },
                ),
            },
          ),
        claim: async () => {
          const claim = await claimClassifierRun(adapter, {
            runId,
            subject: lease.subject,
            inputSha256: lease.inputSha256,
            configurationSha256: lease.resolved.configurationSha256,
            leaseSeconds: 60,
          })
          if (claim.kind === 'claimed') lease = claim.lease
          return claim.kind
        },
        facts: async () => (await getSubjectClassifierRunFacts(fixture.subject))[0]!,
      }
    },
  })
})
