import { describe, expect, it } from 'vitest'
import type { ClassifierSafeText } from '@agents/classifiers/safe-content'
import {
  claimAutotaggerAgentLease,
  completeTaggingRunForTest,
  followTopicAsReader,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { createAutotaggerPostFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { buildAutotaggerAgentRunInput } from './agent-run-input.mts'

/** The subject state is opaque to input building; it is passed through untouched. */
const STATE = 'the subject state' as ClassifierSafeText

/** A leased reasoning run whose first stage applied the first of the subject's followed topics. */
async function leasedRun(applyFirst: boolean) {
  const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
  await Promise.all(fixture.topics.map(topic => followTopicAsReader(topic.id)))
  const [first] = fixture.topics
  await completeTaggingRunForTest(fixture, applyFirst ? { [first!.id]: 0.9 } : {})
  return { fixture, first: first!, lease: await claimAutotaggerAgentLease(fixture.subject) }
}

describe('buildAutotaggerAgentRunInput (real PG)', () => {
  it('asks one question per captured topic, keyed by the topic id, over the state and the applied topics', async () => {
    const { first, lease } = await leasedRun(true)

    const input = await buildAutotaggerAgentRunInput(lease, STATE)

    expect(input?.bindings.map(binding => binding.questionId)).toEqual(lease.capturedTopicIds)
    expect(input?.bindings.map(binding => binding.questionId)).not.toContain(first.id)
    expect(input?.state).toContain(STATE)
    expect(input?.state).toContain('Topics already applied to this content:')
    expect(input?.state).toContain(first.name)
  })

  it('says so when the first stage applied nothing', async () => {
    const { lease } = await leasedRun(false)

    const input = await buildAutotaggerAgentRunInput(lease, STATE)

    expect(input?.state).toContain('Topics already applied to this content:\n(none)')
  })

  it('has nothing to ask once every captured topic is gone', async () => {
    const { lease } = await leasedRun(true)

    await expect(
      buildAutotaggerAgentRunInput({ ...lease, capturedTopicIds: [] }, STATE),
    ).resolves.toBeNull()
  })

  it('refuses a run that did not capture its own candidates', async () => {
    const { lease } = await leasedRun(true)
    const resolved = { ...lease.resolved, remote: null }

    await expect(buildAutotaggerAgentRunInput({ ...lease, resolved }, STATE)).rejects.toThrow(
      'must capture its own candidates',
    )
  })
})
