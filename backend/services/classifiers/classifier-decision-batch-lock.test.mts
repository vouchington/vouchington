import { beginTransaction } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { getClassifierBorrowedDecisionFacts } from '../../test-helpers/data-stores/psql/classifier-borrowed-transactions.mts'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '../../test-helpers/postgres-lock-wait.mts'
import { insertClassifierDecisionBatch } from './write-decision-lineage.mts'

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
    const ready = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holderProcessId = Promise.withResolvers<number>()

    const holder = holdSpelledBatch()
    let canonicalInsert: Promise<boolean> | undefined
    try {
      await Promise.race([ready.promise, holder])
      canonicalInsert = insertCanonicalBatch()
      await waitForTestPostgresLockWaiter(
        await holderProcessId.promise,
        'insertClassifierDecisionBatch:lock',
      )
    } finally {
      release.resolve()
      await Promise.allSettled([holder, canonicalInsert])
    }

    if (canonicalInsert === undefined) {
      throw new Error('Canonical batch insert did not start')
    }
    await expect(canonicalInsert).resolves.toBe(false)
    await expect(getClassifierBorrowedDecisionFacts(batchId)).resolves.toMatchObject({
      batches: 1,
    })

    async function holdSpelledBatch(): Promise<void> {
      await using transaction = await beginTransaction()
      holderProcessId.resolve(await getTestPostgresBackendProcessId(transaction))
      expect(
        await insertClassifierDecisionBatch(transaction, {
          ...identity,
          batchId: spelledBatchId,
        }),
      ).toBe(true)
      ready.resolve()
      await release.promise
      await transaction.commit()
    }

    async function insertCanonicalBatch(): Promise<boolean> {
      await using transaction = await beginTransaction()
      const inserted = await insertClassifierDecisionBatch(transaction, {
        ...identity,
        batchId,
      })
      await transaction.commit()
      return inserted
    }
  })
})
