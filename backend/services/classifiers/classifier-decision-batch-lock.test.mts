import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  getClassifierBorrowedDecisionFacts,
  runClassifierBorrowedTestTransaction,
} from '../../test-helpers/data-stores/psql/classifier-borrowed-transactions.mts'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { insertClassifierDecisionBatch } from './classifier-decision-batch-insert.mts'

describe('classifier decision batch identity', () => {
  it('stores one batch when two spellings name the same batch UUID', async () => {
    const fixture = await createClassifierFixture()
    const batchId = `${uuidv7().slice(0, -1)}a`
    const spelledBatchId = batchId.toUpperCase()
    const identity = {
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      subject: { postId: fixture.postId, rssFeedItemId: null },
      scope: { scopeCategory: 'global' as const, scopeCommunityId: null },
    }
    const first = await runClassifierBorrowedTestTransaction(
      query => insertClassifierDecisionBatch(query, { ...identity, batchId: spelledBatchId }),
      { commit: true },
    )
    const second = await runClassifierBorrowedTestTransaction(
      query => insertClassifierDecisionBatch(query, { ...identity, batchId }),
      { commit: true },
    )
    expect([first, second]).toEqual([true, false])
    await expect(getClassifierBorrowedDecisionFacts(batchId)).resolves.toMatchObject({
      batches: 1,
    })
  })
})
