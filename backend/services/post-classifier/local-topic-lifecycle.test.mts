import { readSubjectTopicRelationFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/subject-topic-relations'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  completeClassifierRun,
  persistClassifierRunOutcomes,
  readClassifierRunOutcomes,
} from '@services/classifier-runs'
import { mergeTopicAliases } from '../topics/merge-aliases.mts'
import { getTopicByAny } from '../topics/get.mts'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { softDeleteTopic } from '@voucha/test-helpers/entities/topics/deletion'
import { createLocalTopicLifecycleFixture } from '@voucha/test-helpers/post-classifier-local-topic-lifecycle'
import { initializePostClassifierExecutionTests } from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { makePostClassifierLocalOutcome } from '@voucha/test-helpers/data-stores/psql/post-classifier/outcomes'

describe('local classifier label lifecycle', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it.each(['merged', 'deleted'] as const)(
    'preserves a durable local outcome and skips its effect if its label is %s after persistence',
    async state => {
      const setup = await createLocalTopicLifecycleFixture()
      const local = makePostClassifierLocalOutcome(
        true,
        setup.lease.resolved.configuration.local!.confidenceThreshold,
      )
      await persistClassifierRunOutcomes(setup.adapter, { lease: setup.lease, local })
      if (state === 'merged') {
        const admin = await createTestUser({ administrator: true })
        await mergeTopicAliases(
          admin,
          (await getTopicByAny(setup.topic.id))!,
          (await getTopicByAny(setup.destination.id))!,
        )
      } else await softDeleteTopic(setup.topic.id, setup.user.id)
      await expect(readClassifierRunOutcomes(setup.adapter, setup.lease)).resolves.toEqual({
        local,
        remoteDecision: null,
      })
      await expect(completeClassifierRun(setup.adapter, setup.lease)).resolves.toMatchObject({
        kind: 'completed',
        effects: { addedTopicIds: [] },
      })
      await expect(completeClassifierRun(setup.adapter, setup.lease)).resolves.toEqual({
        kind: 'replay',
      })
      await expect(
        readSubjectTopicRelationFacts({ postId: setup.post.id, rssFeedItemId: null }),
      ).resolves.toEqual([])
    },
  )

  it.each(['merged', 'deleted'] as const)(
    'completes without a local tag when the leased label was %s before outcome persistence',
    async state => {
      const setup = await createLocalTopicLifecycleFixture()
      const local = makePostClassifierLocalOutcome(
        true,
        setup.lease.resolved.configuration.local!.confidenceThreshold,
      )
      if (state === 'merged') {
        const admin = await createTestUser({ administrator: true })
        await mergeTopicAliases(
          admin,
          (await getTopicByAny(setup.topic.id))!,
          (await getTopicByAny(setup.destination.id))!,
        )
      } else await softDeleteTopic(setup.topic.id, setup.user.id)
      await expect(
        persistClassifierRunOutcomes(setup.adapter, { lease: setup.lease, local }),
      ).resolves.toBe('persisted')
      await expect(readClassifierRunOutcomes(setup.adapter, setup.lease)).resolves.toEqual({
        local,
        remoteDecision: null,
      })
      await expect(completeClassifierRun(setup.adapter, setup.lease)).resolves.toMatchObject({
        kind: 'completed',
        effects: { addedTopicIds: [] },
      })
      await expect(completeClassifierRun(setup.adapter, setup.lease)).resolves.toEqual({
        kind: 'replay',
      })
      await expect(
        readSubjectTopicRelationFacts({ postId: setup.post.id, rssFeedItemId: null }),
      ).resolves.toEqual([])
    },
  )
})
