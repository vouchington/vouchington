import { describe, expect, it } from 'vitest'
import type { ClassifierSafeText } from '@agents/classifiers/safe-content'
import {
  claimAutotaggerLease,
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  createNearbyTopic,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { buildAutotaggerRunInput } from './classifier-run-input.mts'
import { buildPostClassifierState } from './content.mts'

/** The subject state is opaque to input building; it is passed through untouched. */
const STATE = 'the subject state' as ClassifierSafeText

describe('buildAutotaggerRunInput (real PG)', () => {
  it('asks one question per captured topic, in captured order, keyed by the topic id', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 3 })
    const lease = await claimAutotaggerLease(fixture)
    const { remote } = lease.resolved

    const input = await buildAutotaggerRunInput(lease, await buildPostClassifierState(fixture.post))

    expect(lease.capturedTopicIds.length).toBeGreaterThan(0)
    expect(input.bindings.map(binding => binding.questionId)).toEqual(lease.capturedTopicIds)
    expect(input).toMatchObject({
      classifierId: remote?.classifierId,
      promptVersionId: remote?.promptVersionId,
      subject: fixture.subject,
      scope: { scopeCategory: 'global', scopeCommunityId: null },
    })
    for (const binding of input.bindings) {
      expect(binding).toMatchObject({
        type: 'noul',
        candidate: { candidateKind: 'topic', topicId: binding.questionId, storedCandidateId: null },
      })
    }
    const named = fixture.topics.find(topic => lease.capturedTopicIds.includes(topic.id))!
    const binding = input.bindings.find(item => item.questionId === named.id)!
    expect(binding.question).toContain(named.name)
  })

  it('builds the same question set for an RSS feed item run', async () => {
    const fixture = await createAutotaggerFeedItemFixture()
    const lease = await claimAutotaggerLease(fixture)

    const input = await buildAutotaggerRunInput(lease, STATE)

    expect(input.subject).toEqual(fixture.subject)
    expect(input.bindings.map(binding => binding.questionId)).toEqual(lease.capturedTopicIds)
  })

  it('keeps asking the captured question set after a closer topic appears, so a replay never differs', async () => {
    const fixture = await createAutotaggerPostFixture()
    const lease = await claimAutotaggerLease(fixture)
    const before = await buildAutotaggerRunInput(lease, STATE)

    const closer = await createNearbyTopic(fixture.embedding, 0)
    const after = await buildAutotaggerRunInput(lease, STATE)

    expect(after.bindings).toEqual(before.bindings)
    expect(after.bindings.map(binding => binding.questionId)).not.toContain(closer.id)
  })

  it('refuses a lease that captured no topics rather than asking nothing', async () => {
    const lease = await claimAutotaggerLease(await createAutotaggerPostFixture())

    await expect(
      buildAutotaggerRunInput({ ...lease, capturedTopicIds: [] }, STATE),
    ).rejects.toThrow('tagging run has no captured topics')
  })

  it('refuses a lease whose configuration does not capture its own candidates', async () => {
    const lease = await claimAutotaggerLease(await createAutotaggerPostFixture())
    const uncaptured = { ...lease, resolved: { ...lease.resolved, remote: null } }

    await expect(buildAutotaggerRunInput(uncaptured, STATE)).rejects.toThrow(
      'tagging run must capture its own candidates',
    )
  })
})
