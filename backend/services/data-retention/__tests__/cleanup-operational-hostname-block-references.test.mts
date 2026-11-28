import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getOperationalRetentionCursorForTest,
  insertOperationalHostnameBlockForTest,
  operationalRowExistsForTest,
  resetOperationalRetentionCursorForTest,
} from '@voucha/test-helpers'
import {
  cleanupOperationalTombstonePageForTest,
  cleanupOperationalTombstonesForTest,
} from '@voucha/test-helpers/operational-retention-scopes'

import {
  getTestHostnamePenaltySources,
  insertTestHostnamePenalty,
  lockTestHostnamePenalty,
} from '@voucha/test-helpers/operational-tombstone-retention'
import {
  attachCompletedHostnameRootForTest,
  attachOperationalHostnameDescendantForTest,
  countOperationalHostnameDescendantsForTest,
  deleteOwnedHostnameBlocksAndHostnamesForTest,
  insertOperationalPenaltyUserForTest,
  lockOperationalHostnameDescendantForTest,
  markIncompleteHostnameRootForTest,
  readHostnameRootReferencesForTest,
  readOperationalHostnamePenaltySourceForTest,
} from '@voucha/test-helpers/operational-tombstone-retention-hostname-blocks'
import { finishTestPostgresActionWithoutWaiting } from '@voucha/test-helpers/postgres-lock-skip'

const DAY_MS = 24 * 60 * 60 * 1_000

describe('hostname-block operational retention references', () => {
  it('detaches hostname-block descendants and penalty references one row per page before deleting a root', async () => {
    await using query = await beginTransaction()
    const now = new Date()
    const root = await insertOperationalHostnameBlockForTest(query, {
      feed: false,
      liftedAt: new Date(now.getTime() - 3 * 365 * DAY_MS),
    })
    const descendants = await Promise.all([
      insertOperationalHostnameBlockForTest(query, { feed: false, liftedAt: null }),
      insertOperationalHostnameBlockForTest(query, { feed: false, liftedAt: null }),
    ])
    for (const descendant of descendants)
      await attachOperationalHostnameDescendantForTest(query, root.id, descendant.id)
    const penaltyUserId = await insertOperationalPenaltyUserForTest(query)
    const penaltyId = await insertTestHostnamePenalty(query, penaltyUserId, root.id)
    const options = {
      batchSize: 1,
      maxBatches: 1,
      now,
      ids: [root.id],
      borrowedQuery: query,
    }
    for (const remaining of [1, 0]) {
      expect(
        await cleanupOperationalTombstonesForTest('other_hostname_blocks', options),
      ).toMatchObject({
        deleted: 0,
        hasMore: true,
      })
      expect(await countOperationalHostnameDescendantsForTest(query, root.id)).toBe(remaining)
      expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', root.id)).toBe(true)
    }
    expect(
      await cleanupOperationalTombstonesForTest('other_hostname_blocks', options),
    ).toMatchObject({
      deleted: 1,
      hasMore: true,
    })
    expect(
      await cleanupOperationalTombstonesForTest('other_hostname_blocks', options),
    ).toMatchObject({ deleted: 0, hasMore: false, continuation: null })
    for (const descendant of descendants)
      expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', descendant.id)).toBe(
        true,
      )
    expect(await readOperationalHostnamePenaltySourceForTest(query, penaltyId)).toBeNull()
  })

  it('ignores the completed root self-reference when draining descendants', async () => {
    await using query = await beginTransaction()
    const now = new Date()
    const root = await insertOperationalHostnameBlockForTest(query, {
      feed: false,
      liftedAt: new Date(now.getTime() - 3 * 365 * DAY_MS),
    })
    const child = await insertOperationalHostnameBlockForTest(query, {
      feed: false,
      liftedAt: null,
    })
    await attachCompletedHostnameRootForTest(query, root.id, child.id)
    expect(
      await cleanupOperationalTombstonesForTest('other_hostname_blocks', {
        batchSize: 1,
        maxBatches: 2,
        now,
        ids: [root.id],
        borrowedQuery: query,
      }),
    ).toMatchObject({ deleted: 1, hasMore: false })
    expect(await readHostnameRootReferencesForTest(query, [root.id, child.id])).toEqual([
      { id: child.id, root: null },
    ])
  })

  it('pages past an incomplete hostname cleanup root without erasing its ownership', async () => {
    await using query = await beginTransaction()
    await resetOperationalRetentionCursorForTest(query, 'other_hostname_blocks')
    const now = new Date()
    const first = await insertOperationalHostnameBlockForTest(query, {
      feed: false,
      liftedAt: new Date(now.getTime() - 3 * 365 * DAY_MS - 2_000),
    })
    const second = await insertOperationalHostnameBlockForTest(query, {
      feed: false,
      liftedAt: new Date(now.getTime() - 3 * 365 * DAY_MS - 1_000),
    })
    await markIncompleteHostnameRootForTest(query, first.id)
    const result = await cleanupOperationalTombstonesForTest('other_hostname_blocks', {
      batchSize: 1,
      maxBatches: 3,
      now,
      ids: [first.id, second.id],
      borrowedQuery: query,
    })
    expect(result).toMatchObject({ deleted: 1, hasMore: false })
    expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', first.id)).toBe(true)
    expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', second.id)).toBe(false)
    expect(
      (await getOperationalRetentionCursorForTest(query, 'other_hostname_blocks')).cursor_record_id,
    ).toBeNull()
  })

  it('detaches an available penalty while preserving a locked one and its hostname root', async () => {
    const now = new Date()
    const users = await Promise.all([createTestUserDirect(), createTestUserDirect()])
    const [firstUser, secondUser] = users.map(user => user!.id).toSorted()
    const { root, held, available } = await (async () => {
      await using setup = await beginTransaction()
      const block = await insertOperationalHostnameBlockForTest(setup, {
        feed: false,
        liftedAt: new Date(now.getTime() - 3 * 365 * DAY_MS),
      })
      const heldPenalty = await insertTestHostnamePenalty(setup, firstUser!, block.id)
      const otherPenalty = await insertTestHostnamePenalty(setup, secondUser!, block.id)
      await setup.commit()
      return { root: block, held: heldPenalty, available: otherPenalty }
    })()
    const options = { ids: [root.id], batchSize: 1, now }

    await using holder = await beginTransaction()
    await lockTestHostnamePenalty(holder, held)
    await finishTestPostgresActionWithoutWaiting(
      holder,
      'detachHostnameBlockPenaltyPage',
      async () => {
        await using cleanup = await beginTransaction()
        expect(
          await cleanupOperationalTombstonePageForTest('other_hostname_blocks', {
            ...options,
            borrowedQuery: cleanup,
          }),
        ).toMatchObject({ deleted: 0, hasMore: true, stalled: false })
        expect(await getTestHostnamePenaltySources(cleanup, [held, available])).toEqual({
          [held]: root.id,
          [available]: null,
        })
        expect(await operationalRowExistsForTest(cleanup, 'url_hostname_blocks', root.id)).toBe(
          true,
        )
        await cleanup.commit()
      },
    )

    await using cleanup = await beginTransaction()
    const finalOptions = { ...options, borrowedQuery: cleanup }
    expect(
      await cleanupOperationalTombstonePageForTest('other_hostname_blocks', finalOptions),
    ).toMatchObject({ deleted: 1, hasMore: true, stalled: false })
    expect(
      await cleanupOperationalTombstonePageForTest('other_hostname_blocks', finalOptions),
    ).toMatchObject({ deleted: 0, hasMore: false, stalled: false })
    expect(await getTestHostnamePenaltySources(cleanup, [held, available])).toEqual({
      [held]: null,
      [available]: null,
    })
    await cleanup.commit()
  })

  it('stalls behind a locked descendant and drains after the lock is released', async () => {
    const now = new Date()
    const { root, child } = await (async () => {
      await using setup = await beginTransaction()
      const rootBlock = await insertOperationalHostnameBlockForTest(setup, {
        feed: false,
        liftedAt: new Date(now.getTime() - 3 * 365 * DAY_MS),
      })
      const childBlock = await insertOperationalHostnameBlockForTest(setup, {
        feed: false,
        liftedAt: null,
      })
      await attachOperationalHostnameDescendantForTest(setup, rootBlock.id, childBlock.id)
      await setup.commit()
      return { root: rootBlock, child: childBlock }
    })()
    try {
      {
        await using blocker = await beginTransaction()
        await lockOperationalHostnameDescendantForTest(blocker, child.id)
        await using cleanup = await beginTransaction()
        expect(
          await cleanupOperationalTombstonePageForTest('other_hostname_blocks', {
            borrowedQuery: cleanup,
            ids: [root.id],
            batchSize: 1,
            now,
          }),
        ).toMatchObject({ deleted: 0, hasMore: true, stalled: true })
        expect(await operationalRowExistsForTest(cleanup, 'url_hostname_blocks', root.id)).toBe(
          true,
        )
      }
      await using retry = await beginTransaction()
      expect(
        await cleanupOperationalTombstonePageForTest('other_hostname_blocks', {
          borrowedQuery: retry,
          ids: [root.id],
          batchSize: 1,
          now,
        }),
      ).toMatchObject({ deleted: 1, hasMore: true, stalled: false })
      expect(
        await cleanupOperationalTombstonePageForTest('other_hostname_blocks', {
          borrowedQuery: retry,
          ids: [root.id],
          batchSize: 1,
          now,
        }),
      ).toMatchObject({ deleted: 0, hasMore: false, stalled: false })
    } finally {
      await using cleanup = await beginTransaction()
      await deleteOwnedHostnameBlocksAndHostnamesForTest(
        cleanup,
        [child.id, root.id],
        [child.hostnameId, root.hostnameId],
      )
      await cleanup.commit()
    }
  })
})
