import {
  claimAutotaggerAgentLease,
  completeTaggingRunForTest,
  followTopicAsReader,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { applyAutotaggerAgentEffectsWithoutDecisionForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-service-calls'
import { createAutotaggerPostFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { describe, expect, it } from 'vitest'

async function leasedAgentRun() {
  const fixture = await createAutotaggerPostFixture()
  await followTopicAsReader(fixture.topics[0]!.id)
  await completeTaggingRunForTest(fixture)
  return claimAutotaggerAgentLease(fixture.subject)
}

describe('applyAutotaggerAgentEffects (real PG)', () => {
  it('refuses to complete a run that asked a question but has no decision to apply', async () => {
    const lease = await leasedAgentRun()

    expect(lease.capturedTopicIds.length).toBeGreaterThan(0)
    await expect(applyAutotaggerAgentEffectsWithoutDecisionForTest(lease)).rejects.toThrow(
      'no remote decision to apply',
    )
  })

  it('applies nothing for a run that had nothing left to ask', async () => {
    const lease = await leasedAgentRun()

    await expect(
      applyAutotaggerAgentEffectsWithoutDecisionForTest({ ...lease, capturedTopicIds: [] }),
    ).resolves.toEqual({
      addedTopicIds: [],
    })
  })
})
