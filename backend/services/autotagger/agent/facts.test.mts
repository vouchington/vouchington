import { persistClassifierRunOutcomes, readClassifierRunOutcomes } from '@services/classifier-runs'
import {
  claimAutotaggerAgentLease,
  completeTaggingRunForTest,
  followTopicAsReader,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { createAutotaggerPostFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { describe, expect, it } from 'vitest'
import { createAutotaggerAgentRunAdapter } from './adapter.mts'
import { validateAutotaggerAgentFacts } from './facts.mts'

const adapter = createAutotaggerAgentRunAdapter()

async function leasedAgentRun() {
  const fixture = await createAutotaggerPostFixture({ topicCount: 3 })
  await Promise.all(fixture.topics.map(topic => followTopicAsReader(topic.id)))
  await completeTaggingRunForTest(fixture)
  return claimAutotaggerAgentLease(fixture.subject)
}

describe('autotagger agent facts (real PG)', () => {
  it('retains exactly the reported candidates, read back in candidate order', async () => {
    const lease = await leasedAgentRun()
    const reported = [lease.capturedTopicIds[2]!, lease.capturedTopicIds[0]!]

    await expect(
      persistClassifierRunOutcomes(adapter, { lease, local: { topicIds: reported } }),
    ).resolves.toBe('persisted')

    const outcomes = await readClassifierRunOutcomes(adapter, lease)
    expect(outcomes).toEqual({
      local: { topicIds: [lease.capturedTopicIds[0], lease.capturedTopicIds[2]] },
      remoteDecision: null,
    })
  })

  it('retains an empty answer as no facts', async () => {
    const lease = await leasedAgentRun()

    await persistClassifierRunOutcomes(adapter, { lease, local: { topicIds: [] } })

    expect(await readClassifierRunOutcomes(adapter, lease)).toEqual({
      local: { topicIds: [] },
      remoteDecision: null,
    })
  })

  it('refuses a topic that is not one of the run’s captured candidates and keeps nothing', async () => {
    const lease = await leasedAgentRun()

    await expect(
      persistClassifierRunOutcomes(adapter, {
        lease,
        local: { topicIds: ['33333333-3333-4333-8333-333333333333'] },
      }),
    ).rejects.toThrow('outside the run candidates')

    expect(await readClassifierRunOutcomes(adapter, lease)).toBeNull()
  })

  it('accepts a missing answer, which is what a failed run leaves', () => {
    expect(() => validateAutotaggerAgentFacts()).not.toThrow()
  })
})
