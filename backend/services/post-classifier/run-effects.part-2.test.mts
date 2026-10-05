import { createTestUser } from '@voucha/test-helpers'
import { runClassifierBorrowedTestTransaction } from '@voucha/test-helpers/data-stores/psql/classifier-borrowed-transactions'
import {
  createHumanTopicRelation,
  readSubjectTopicRelationFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/subject-topic-relations'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
  type PostClassifierExecutionFixture,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import {
  localOutcomeFor,
  remoteDecisionFor,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/outcomes'
import { softDeleteScoredPostTopicCategoryRelation } from '@voucha/test-helpers/entities/entity-relations-posts'
import { countTopicElectionVoteRowsForUser } from '@voucha/test-helpers/entities/topic-election-votes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  completeClassifierRun,
  persistClassifierRunOutcomes,
  readClassifierRunOutcomes,
} from '@services/classifier-runs'

type RemoteResult = boolean | 'neutral'

async function persistAndComplete(
  setup: PostClassifierExecutionFixture,
  { remote, localFlagged = false }: { remote?: RemoteResult; localFlagged?: boolean },
) {
  expect(
    await persistClassifierRunOutcomes(setup.adapter, {
      lease: setup.lease,
      local: localOutcomeFor(setup, localFlagged),
      remoteDecision: remote === undefined ? undefined : remoteDecisionFor(setup, remote),
    }),
  ).toBe('persisted')
  return completeClassifierRun(setup.adapter, setup.lease)
}

const subjectOf = (setup: PostClassifierExecutionFixture) =>
  ({ postId: setup.post.id, rssFeedItemId: null }) as const

const remoteTopicId = (setup: PostClassifierExecutionFixture) =>
  setup.lease.resolved.configuration.remote!.questions[0]!.topicId

const localTopicId = (setup: PostClassifierExecutionFixture) =>
  setup.lease.resolved.configuration.local!.topicId

const actorOf = (setup: PostClassifierExecutionFixture) => setup.lease.resolved.actorId

describe('post classifier relation votes on the shared lifecycle (real PG)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it('creates the post category relation for a positive remote result and votes only on it', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    const topicId = remoteTopicId(setup)

    expect(await persistAndComplete(setup, { remote: true })).toEqual({
      kind: 'completed',
      effects: { addedTopicIds: [topicId] },
    })

    expect(await readSubjectTopicRelationFacts(subjectOf(setup))).toMatchObject([
      {
        topicId,
        createdById: actorOf(setup),
        deletedAt: null,
        votes: [{ userId: actorOf(setup), score: 1 }],
      },
    ])
    expect(await countTopicElectionVoteRowsForUser(actorOf(setup))).toBe(0)
  })

  it.each([
    ['negative', false, -1],
    ['neutral', 'neutral', 0],
  ] as const)(
    'casts %s votes on an already live relation without adding or changing it',
    async (_name, remote, score) => {
      const setup = await createPostClassifierExecutionFixture(true, false)
      const human = await createTestUser()
      const relation = await createHumanTopicRelation(human, subjectOf(setup), remoteTopicId(setup))

      expect(await persistAndComplete(setup, { remote })).toEqual({
        kind: 'completed',
        effects: { addedTopicIds: [] },
      })

      expect(await readSubjectTopicRelationFacts(subjectOf(setup))).toMatchObject([
        {
          id: relation.id,
          createdById: human.id,
          deletedAt: null,
          votes: [
            { userId: human.id, score: 1 },
            { userId: actorOf(setup), score },
          ],
        },
      ])
      expect(await countTopicElectionVoteRowsForUser(actorOf(setup))).toBe(0)
    },
  )

  it.each([
    ['negative', false],
    ['neutral', 'neutral'],
  ] as const)(
    'creates nothing for a %s result when the post has no relation',
    async (_n, remote) => {
      const setup = await createPostClassifierExecutionFixture(true, false)

      expect(await persistAndComplete(setup, { remote })).toEqual({
        kind: 'completed',
        effects: { addedTopicIds: [] },
      })

      expect(await readSubjectTopicRelationFacts(subjectOf(setup))).toEqual([])
      expect(await countTopicElectionVoteRowsForUser(actorOf(setup))).toBe(0)
    },
  )

  it('never resurrects or votes on a soft-deleted relation', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    const human = await createTestUser()
    await createHumanTopicRelation(human, subjectOf(setup), remoteTopicId(setup))
    await softDeleteScoredPostTopicCategoryRelation(setup.post.id, remoteTopicId(setup), human.id)

    expect(await persistAndComplete(setup, { remote: true })).toEqual({
      kind: 'completed',
      effects: { addedTopicIds: [] },
    })

    expect(await readSubjectTopicRelationFacts(subjectOf(setup))).toMatchObject([
      {
        topicId: remoteTopicId(setup),
        createdById: human.id,
        deletedAt: expect.any(Date),
        votes: [{ userId: human.id, score: 1 }],
      },
    ])
  })

  it('still tags a local-detector positive with a relation vote and no topic vote', async () => {
    const setup = await createPostClassifierExecutionFixture(false, true)

    expect(await persistAndComplete(setup, { localFlagged: true })).toEqual({
      kind: 'completed',
      effects: { addedTopicIds: [localTopicId(setup)] },
    })

    expect(await readSubjectTopicRelationFacts(subjectOf(setup))).toMatchObject([
      {
        topicId: localTopicId(setup),
        createdById: actorOf(setup),
        deletedAt: null,
        votes: [{ userId: actorOf(setup), score: 1 }],
      },
    ])
    expect(await countTopicElectionVoteRowsForUser(actorOf(setup))).toBe(0)
  })

  it('tags a mixed local and remote result as relations and writes no topic vote', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    const expected = [localTopicId(setup), remoteTopicId(setup)].toSorted()

    expect(await persistAndComplete(setup, { remote: true, localFlagged: true })).toEqual({
      kind: 'completed',
      effects: { addedTopicIds: expected },
    })

    const facts = await readSubjectTopicRelationFacts(subjectOf(setup))
    expect(facts.map(fact => fact.topicId)).toEqual(expected)
    for (const fact of facts) expect(fact.votes).toEqual([{ userId: actorOf(setup), score: 1 }])
    expect(await countTopicElectionVoteRowsForUser(actorOf(setup))).toBe(0)
  })

  it('is idempotent on replay and when the effects are applied again', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    expect(await persistAndComplete(setup, { remote: true, localFlagged: true })).toMatchObject({
      kind: 'completed',
    })
    const applied = await readSubjectTopicRelationFacts(subjectOf(setup))
    expect(applied).toHaveLength(2)

    expect(await completeClassifierRun(setup.adapter, setup.lease)).toEqual({ kind: 'replay' })
    const outcomes = (await readClassifierRunOutcomes(setup.adapter, setup.lease))!
    const again = await runClassifierBorrowedTestTransaction(
      transaction => setup.adapter.applyEffects(transaction, setup.lease, outcomes),
      { commit: true },
    )

    expect(again.addedTopicIds).toEqual(applied.map(fact => fact.topicId).toSorted())
    expect(await readSubjectTopicRelationFacts(subjectOf(setup))).toEqual(applied)
  })
})
