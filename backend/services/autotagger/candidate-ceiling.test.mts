import { describe, expect, it } from 'vitest'
import { claimClassifierRun, reserveClassifierRun } from '@services/classifier-runs'
import { createAutotaggerPostFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getClassifierRunCandidateTopicIdsForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createAutotaggerRunAdapter } from './adapter.mts'
import { autotaggerPaidLimitsConfig } from './limits-config.mts'

describe('autotagger captured candidate ceiling', () => {
  it('captures at most twenty topics and replays the captured set after its tier limit changes', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 21 })
    const adapter = createAutotaggerRunAdapter()
    const restore = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      post_plus_max_topics: 100,
    })
    try {
      const reserved = await reserveClassifierRun(adapter, fixture.subject)
      expect(reserved.kind).toBe('reserved')
      if (reserved.kind !== 'reserved') throw new Error('Expected a reserved autotagger run')
      const captured = await getClassifierRunCandidateTopicIdsForTest(reserved.run.runId)
      expect(captured).toHaveLength(20)
      const restoreLower = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
        post_plus_max_topics: 1,
      })
      try {
        const result = await claimClassifierRun(adapter, { ...reserved.run, leaseSeconds: 60 })
        expect(result.kind).toBe('claimed')
        if (result.kind !== 'claimed' && result.kind !== 'outcomes_ready') {
          throw new Error('Expected a claimed autotagger run')
        }
        expect(result.lease.capturedTopicIds).toEqual(captured)
      } finally {
        restoreLower()
      }
    } finally {
      restore()
    }
  })
})
