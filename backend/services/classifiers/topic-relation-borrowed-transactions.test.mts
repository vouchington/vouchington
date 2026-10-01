import { describe, expect, it } from 'vitest'
import { runClassifierBorrowedTestTransaction } from '../../test-helpers/data-stores/psql/classifier-borrowed-transactions.mts'
import { createTopicRelationCase } from '../../test-helpers/data-stores/psql/classifier-runs/subject-topic-relation-case.mts'
import { readSubjectTopicRelationFacts } from '../../test-helpers/data-stores/psql/classifier-runs/subject-topic-relations.mts'

describe('applyTopicClassifierDecisionRelations borrowed transaction', () => {
  it('leaves every relation, vote and statistic uncommitted and rolls the whole multi-topic write back', async () => {
    const { actor, subject, topicIds, apply } = await createTopicRelationCase()

    await expect(
      runClassifierBorrowedTestTransaction(async transaction => {
        await expect(apply(transaction)).resolves.toEqual({ addedTopicIds: topicIds })
        const inside = await readSubjectTopicRelationFacts(subject, transaction)
        expect(inside.map(fact => fact.votes)).toEqual([
          [{ userId: actor.id, score: 1 }],
          [{ userId: actor.id, score: 1 }],
        ])
        expect(inside.every(fact => fact.netScore > 0)).toBe(true)
        await expect(readSubjectTopicRelationFacts(subject)).resolves.toEqual([])
        throw new Error('later caller phase failed')
      }),
    ).rejects.toThrow('later caller phase failed')

    await expect(readSubjectTopicRelationFacts(subject)).resolves.toEqual([])
  })

  it('persists the multi-topic write once on commit and writes no duplicates when retried', async () => {
    const { actor, subject, topicIds, apply } = await createTopicRelationCase()
    await expect(
      runClassifierBorrowedTestTransaction(
        async transaction => {
          await expect(apply(transaction)).resolves.toEqual({ addedTopicIds: topicIds })
          await expect(readSubjectTopicRelationFacts(subject)).resolves.toEqual([])
        },
        { commit: true },
      ),
    ).resolves.toBeUndefined()
    const committed = await readSubjectTopicRelationFacts(subject)

    await runClassifierBorrowedTestTransaction(apply, { commit: true })

    expect(committed.map(fact => fact.topicId)).toEqual(topicIds)
    expect(committed.map(fact => fact.votes)).toEqual([
      [{ userId: actor.id, score: 1 }],
      [{ userId: actor.id, score: 1 }],
    ])
    await expect(readSubjectTopicRelationFacts(subject)).resolves.toEqual(committed)
  })
})
