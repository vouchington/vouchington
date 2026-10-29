import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  getOperationalRetentionCursorForTest,
  insertOperationalHostnameBlockForTest,
  operationalRowExistsForTest,
  resetOperationalRetentionCursorForTest,
} from '@voucha/test-helpers'
import {
  cleanupOperationalTombstonePageForTest,
  cleanupOperationalTombstonesForTest,
} from '@voucha/test-helpers/operational-retention-scopes'

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
      await query(
        `/* attachOperationalHostnameDescendantForTest */
         UPDATE url_hostname_blocks SET relation_cleanup_root_block_id = $1::uuid
         WHERE id = $2::uuid`,
        [root.id, descendant.id],
      )
    const { rows: users } = await query<{ id: string }>(
      `/* insertOperationalPenaltyUserForTest */ INSERT INTO users DEFAULT VALUES RETURNING id`,
    )
    const { rows: penalties } = await query<{ id: string }>(
      `/* insertOperationalHostnamePenaltyForTest */
       INSERT INTO vote_weight_penalties
         (user_id, penalty_multiplier, reason, source_hostname_block_id)
       VALUES ($1::uuid, 0.5, 'retention fixture', $2::uuid) RETURNING id`,
      [users[0]!.id, root.id],
    )
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
      const { rows } = await query<{ count: string }>(
        `/* countOperationalHostnameDescendantsForTest */
         SELECT count(*)::text AS count FROM url_hostname_blocks
         WHERE relation_cleanup_root_block_id = $1::uuid`,
        [root.id],
      )
      expect(Number(rows[0]!.count)).toBe(remaining)
      expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', root.id)).toBe(true)
    }
    expect(
      await cleanupOperationalTombstonesForTest('other_hostname_blocks', options),
    ).toMatchObject({
      deleted: 1,
      hasMore: false,
    })
    for (const descendant of descendants)
      expect(await operationalRowExistsForTest(query, 'url_hostname_blocks', descendant.id)).toBe(
        true,
      )
    const { rows: penaltyRows } = await query<{ source_hostname_block_id: string | null }>(
      `/* readOperationalHostnamePenaltyForTest */
       SELECT source_hostname_block_id FROM vote_weight_penalties WHERE id = $1::uuid`,
      [penalties[0]!.id],
    )
    expect(penaltyRows[0]!.source_hostname_block_id).toBeNull()
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
    await query(
      `/* markIncompleteHostnameRootForTest */
       UPDATE url_hostname_blocks SET relation_cleanup_root_block_id = id
       WHERE id = $1::uuid`,
      [first.id],
    )
    const result = await cleanupOperationalTombstonesForTest('other_hostname_blocks', {
      batchSize: 1,
      maxBatches: 2,
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

  it('stalls behind a locked descendant and drains after the lock is released', async () => {
    const now = new Date()
    const { root, child } = await (async () => {
      await using setup = await beginTransaction()
      const root = await insertOperationalHostnameBlockForTest(setup, {
        feed: false,
        liftedAt: new Date(now.getTime() - 3 * 365 * DAY_MS),
      })
      const child = await insertOperationalHostnameBlockForTest(setup, {
        feed: false,
        liftedAt: null,
      })
      await setup(
        `/* attachLockedOperationalHostnameDescendantForTest */
         UPDATE url_hostname_blocks SET relation_cleanup_root_block_id = $1::uuid
         WHERE id = $2::uuid`,
        [root.id, child.id],
      )
      await setup.commit()
      return { root, child }
    })()
    try {
      {
        await using blocker = await beginTransaction()
        await blocker(
          `/* lockOperationalHostnameDescendantForTest */
           SELECT id FROM url_hostname_blocks WHERE id = $1::uuid FOR UPDATE`,
          [child.id],
        )
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
      ).toMatchObject({ deleted: 1, hasMore: false, stalled: false })
    } finally {
      await using cleanup = await beginTransaction()
      await cleanup(
        '/* deleteOwnedHostnameBlocksForLockTest */ DELETE FROM url_hostname_blocks WHERE id = ANY($1::uuid[])',
        [[child.id, root.id]],
      )
      await cleanup(
        '/* deleteOwnedHostnamesForLockTest */ DELETE FROM url_hostnames WHERE id = ANY($1::uuid[])',
        [[child.hostnameId, root.hostnameId]],
      )
      await cleanup.commit()
    }
  })
})
