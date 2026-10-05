import { notifications } from '@queues/notifications/queues'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation/votes-get'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { createTestUser, waitForQueueJobs } from '@voucha/test-helpers'
import { getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import { getClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
  type PostClassifierExecutionFixture,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import {
  categoryRelationsForTest,
  localOutcomeFor,
  remoteDecisionFor,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/outcomes'
import {
  getPostClearanceChanges,
  getPostClearanceStatus,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers/entities/post-clearance'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { completeClassifierRun, persistClassifierRunOutcomes } from '@services/classifier-runs'

type Options = { localFlagged: boolean; remotePositive: boolean }

async function persist(
  setup: PostClassifierExecutionFixture,
  { localFlagged, remotePositive }: Options,
) {
  expect(
    await persistClassifierRunOutcomes(setup.adapter, {
      lease: setup.lease,
      local: localOutcomeFor(setup, localFlagged),
      remoteDecision: remoteDecisionFor(setup, remotePositive),
    }),
  ).toBe('persisted')
}

const facts = async (setup: PostClassifierExecutionFixture) =>
  (await getClassifierRunFacts(setup.post.id, POST_CLASSIFIER_SLUG))[0]!

const topicIds = (setup: PostClassifierExecutionFixture) => {
  const { local, remote } = setup.lease.resolved.configuration
  return { local: local?.topicId, remote: remote?.questions[0]?.topicId }
}

const relationTopicIds = async (postId: string) =>
  (await categoryRelationsForTest(postId)).map(relation => relation.object_id).toSorted()

function hasPostNotification(
  jobs: Awaited<ReturnType<typeof notifications.getJobs>>,
  postId: string,
): boolean {
  return jobs.some(
    job =>
      job.name === 'processReconcilePostNotifications' &&
      (job.data as { postId: string }).postId === postId,
  )
}

describe('post classifier effects on the shared lifecycle (real PG)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it('applies local, remote and mixed positive tags in the completion transaction', async () => {
    const local = await createPostClassifierExecutionFixture(false, true)
    await persist(local, { localFlagged: true, remotePositive: false })
    expect(await completeClassifierRun(local.adapter, local.lease)).toEqual({
      kind: 'completed',
      effects: { addedTopicIds: [topicIds(local).local] },
    })

    const remote = await createPostClassifierExecutionFixture(true, false)
    await persist(remote, { localFlagged: false, remotePositive: true })
    expect(await completeClassifierRun(remote.adapter, remote.lease)).toEqual({
      kind: 'completed',
      effects: { addedTopicIds: [topicIds(remote).remote] },
    })

    const mixed = await createPostClassifierExecutionFixture(true, true)
    await persist(mixed, { localFlagged: true, remotePositive: true })
    const expected = [topicIds(mixed).local!, topicIds(mixed).remote!].toSorted()
    const result = await completeClassifierRun(mixed.adapter, mixed.lease)
    expect(result).toMatchObject({ kind: 'completed', effects: { addedTopicIds: expected } })
    expect(await relationTopicIds(mixed.post.id)).toEqual(expected)
    expect(await facts(mixed)).toMatchObject({ completed_at: expect.any(Date), lease_token: null })
  })

  it('completes a no-positive outcome without creating relations', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    await persist(setup, { localFlagged: false, remotePositive: false })

    expect(await completeClassifierRun(setup.adapter, setup.lease)).toMatchObject({
      kind: 'completed',
      effects: { addedTopicIds: [] },
    })

    expect(await categoryRelationsForTest(setup.post.id)).toEqual([])
    expect(await facts(setup)).toMatchObject({ completed_at: expect.any(Date) })
  })

  it('rolls relations, votes, the marker and the notification back when an effect fails', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    await persist(setup, { localFlagged: true, remotePositive: true })
    const failing = {
      ...setup.adapter,
      applyEffects: async (...args: Parameters<typeof setup.adapter.applyEffects>) => {
        await setup.adapter.applyEffects(...args)
        throw new Error('rollback effects')
      },
    }

    await expect(completeClassifierRun(failing, setup.lease)).rejects.toThrow('rollback effects')

    expect(await categoryRelationsForTest(setup.post.id)).toEqual([])
    expect(await facts(setup)).toMatchObject({ completed_at: null })
    expect(
      hasPostNotification(
        await waitForQueueJobs(
          notifications,
          waiting => hasPostNotification(waiting, setup.post.id),
          200,
        ),
        setup.post.id,
      ),
    ).toBe(false)
    expect(await completeClassifierRun(setup.adapter, setup.lease)).toMatchObject({
      kind: 'completed',
    })
    expect(await relationTopicIds(setup.post.id)).toHaveLength(2)
  })

  it('replays without duplicating relations and attributes shared-actor tags correctly', async () => {
    const first = await createPostClassifierExecutionFixture(true, false)
    const second = await createPostClassifierExecutionFixture(true, false)
    await persist(first, { localFlagged: false, remotePositive: true })
    await persist(second, { localFlagged: false, remotePositive: true })
    const human = await createTestUser()
    const topicId = topicIds(first).remote!
    await upsertEntityRelation(
      human,
      getEntityRelationMetadataOrThrow({
        subjectType: 'post',
        objectType: 'topic',
        predicate: 'category',
      }),
      first.post,
      [{ id: topicId }],
      { vote: true },
    )

    await completeClassifierRun(first.adapter, first.lease)
    await completeClassifierRun(second.adapter, second.lease)
    expect(await completeClassifierRun(first.adapter, first.lease)).toEqual({ kind: 'replay' })

    const firstRelations = await categoryRelationsForTest(first.post.id)
    const secondRelations = await categoryRelationsForTest(second.post.id)
    expect(firstRelations).toHaveLength(1)
    expect(secondRelations).toHaveLength(1)
    expect(firstRelations[0]?.created_by_id).toBe(human.id)
    expect(secondRelations[0]?.created_by_id).toBe(first.lease.resolved.actorId)
    const relationId = firstRelations[0]?.id
    if (!relationId) throw new Error('Expected tagged relation ID')
    await expect(getEntityRelationElectionVote(human.id, relationId)).resolves.toMatchObject({
      choice: 'confirm',
    })
    await expect(
      getEntityRelationElectionVote(first.lease.resolved.actorId, relationId),
    ).resolves.toMatchObject({ choice: 'confirm' })
    // The restriction on platform-account trust signals does not apply to this service-level
    // writer: the actor is the seeded @post-classifier ai_agent and its relation vote persists.
    await expect(getTestPrivateUserById(first.lease.resolved.actorId)).resolves.toMatchObject({
      account_type: 'ai_agent',
    })
  })

  it('completes without altering approval history, and replays after un-approval', async () => {
    const setup = await createPostClassifierExecutionFixture(false, true)
    await persist(setup, { localFlagged: true, remotePositive: false })
    const history = await getPostClearanceChanges(setup.post.id)

    expect(await completeClassifierRun(setup.adapter, setup.lease)).toMatchObject({
      kind: 'completed',
    })

    await expect(getPostClearanceStatus(setup.post.id)).resolves.toBe('approved')
    await expect(getPostClearanceChanges(setup.post.id)).resolves.toEqual(history)
    await setTestPostClearanceStatus(setup.post.id, 'pending')
    expect(await completeClassifierRun(setup.adapter, setup.lease)).toEqual({ kind: 'replay' })
  })

  it('applies nothing once the post loses approval before completion', async () => {
    const setup = await createPostClassifierExecutionFixture(false, true)
    await persist(setup, { localFlagged: true, remotePositive: false })
    await setTestPostClearanceStatus(setup.post.id, 'pending')

    expect(await completeClassifierRun(setup.adapter, setup.lease)).toEqual({ kind: 'stale' })

    expect(await categoryRelationsForTest(setup.post.id)).toEqual([])
    expect(await facts(setup)).toMatchObject({ completed_at: null })
  })
})
