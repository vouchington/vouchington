import {
  claimAutotaggerAgentLease,
  completeTaggingRunForTest,
  followTopicAsReader,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { applyAutotaggerAgentEffectsForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-service-calls'
import { createAutotaggerPostFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { describe, expect, it } from 'vitest'

async function leasedAgentRun() {
  const fixture = await createAutotaggerPostFixture()
  await followTopicAsReader(fixture.topics[0]!.id)
  await completeTaggingRunForTest(fixture)
  return claimAutotaggerAgentLease(fixture.subject)
}

describe('applyAutotaggerAgentEffects (real PG)', () => {
  it('adds the candidate topics the agent reported', async () => {
    const lease = await leasedAgentRun()
    expect(lease.capturedTopicIds.length).toBeGreaterThan(0)
    const [reported] = lease.capturedTopicIds

    await expect(
      applyAutotaggerAgentEffectsForTest(lease, { topicIds: [reported!] }),
    ).resolves.toEqual({ addedTopicIds: [reported] })
  })

  it('applies nothing when the agent reported no topic, or left no facts at all', async () => {
    const lease = await leasedAgentRun()

    await expect(applyAutotaggerAgentEffectsForTest(lease, { topicIds: [] })).resolves.toEqual({
      addedTopicIds: [],
    })
    await expect(applyAutotaggerAgentEffectsForTest(lease, null)).resolves.toEqual({
      addedTopicIds: [],
    })
  })

  it('refuses a topic the run never offered', async () => {
    const lease = await leasedAgentRun()
    const outside = '33333333-3333-4333-8333-333333333333'

    await expect(
      applyAutotaggerAgentEffectsForTest(lease, { topicIds: [outside] }),
    ).rejects.toThrow('outside the run candidates')
  })
})
