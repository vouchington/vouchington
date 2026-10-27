import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { getClassifierBorrowedDecisionFacts } from '../../test-helpers/data-stores/psql/classifier-borrowed-transactions.mts'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { runTestClassifierBatchConflict } from '@voucha/test-helpers/classifier-decision-batch-conflict'
import { insertClassifierDecisionBatch } from './classifier-decision-batch-insert.mts'

describe('classifier decision batch advisory lock', () => {
  it('serializes uppercase and lowercase spellings of one batch UUID', async () => {
    const fixture = await createClassifierFixture()
    const batchId = `${uuidv7().slice(0, -1)}a`
    const spelledBatchId = batchId.toUpperCase()
    const identity = {
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      subject: { postId: fixture.postId, rssFeedItemId: null },
      scope: { scopeCategory: 'global' as const, scopeCommunityId: null },
    }
    await expect(
      runTestClassifierBatchConflict(
        batchId,
        query => insertClassifierDecisionBatch(query, { ...identity, batchId: spelledBatchId }),
        query => insertClassifierDecisionBatch(query, { ...identity, batchId }),
      ),
    ).resolves.toEqual([true, false])
    await expect(getClassifierBorrowedDecisionFacts(batchId)).resolves.toMatchObject({
      batches: 1,
    })
  })
})
