import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestExpiryWindow,
  getDeletedConversationDescendantCountsForTest,
  operationalRowExistsForTest,
} from '@voucha/test-helpers'
import { deleteDeletedConversationFixtureForTest } from '@voucha/test-helpers/deleted-conversation-retention-lock'
import {
  insertDeletedConversationProtectionForTest,
  lockDeletedConversationProtectionForTest,
} from '@voucha/test-helpers/deleted-conversation-retention-protection'
import { createScopedDeletedConversationRetentionForTest } from '@voucha/test-helpers/deleted-conversation-retention-scope'
import { captureScopedTestQueries } from '@voucha/test-helpers/query-capture'
import { cleanupOperationalTombstones } from '../cleanup-operational-tombstones.mts'

describe('deleted conversation protected descendant pages', () => {
  it.each(['receipt', 'message'] as const)(
    'preserves a locked %s and drains after its release',
    async kind => {
      const window = createTestExpiryWindow()
      const conversation = await (async () => {
        await using setup = await beginTransaction()
        const fixture = await insertDeletedConversationProtectionForTest(
          setup,
          kind,
          window.firstEligibleDate,
        )
        await setup.commit()
        return fixture
      })()
      const cleanupOwned = createScopedDeletedConversationRetentionForTest(
        [conversation.id],
        new Date(window.upperBoundDate.getTime() + 30 * 86_400_000),
      )
      try {
        {
          await using blocker = await beginTransaction()
          await lockDeletedConversationProtectionForTest(blocker, kind, conversation)
          const before = await getDeletedConversationDescendantCountsForTest(
            blocker,
            conversation.id,
          )
          expect(kind === 'receipt' ? before.receipts : before.messages).toBe(1)
          expect(await cleanupOwned({ batchSize: 1, maxBatches: 1 })).toEqual({
            deleted: 0,
            hasMore: true,
            continuation: null,
            stalled: true,
          })
          expect(await operationalRowExistsForTest(blocker, 'conversations', conversation.id)).toBe(
            true,
          )
          expect(
            await getDeletedConversationDescendantCountsForTest(blocker, conversation.id),
          ).toEqual(before)
          await blocker.commit()
        }
        expect(await cleanupOwned({ batchSize: 1, maxBatches: 16 })).toMatchObject({
          deleted: 1,
          hasMore: false,
        })
        await using assertion = await beginTransaction()
        expect(await operationalRowExistsForTest(assertion, 'conversations', conversation.id)).toBe(
          false,
        )
        expect(
          await getDeletedConversationDescendantCountsForTest(assertion, conversation.id),
        ).toEqual({ receipts: 0, intents: 0, notifications: 0, messages: 0, participants: 0 })
      } finally {
        // Blocker scope has disposed before exact owned cleanup, including assertion failures.
        await using cleanup = await beginTransaction()
        await deleteDeletedConversationFixtureForTest(cleanup, conversation)
        await cleanup.commit()
      }
    },
  )

  it('rejects an invalid page budget before opening a cleanup transaction', async () => {
    const queries = await captureScopedTestQueries(async () => {
      await expect(
        cleanupOperationalTombstones('deleted_conversations', { batchSize: 1, maxBatches: 0 }),
      ).rejects.toThrow('maxBatches must be a positive integer')
    })
    expect(queries).toEqual([])
  })
})
