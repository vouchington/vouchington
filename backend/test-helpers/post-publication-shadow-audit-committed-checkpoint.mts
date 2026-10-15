import { beginTransaction, writePool, type PoolClient } from '@data-stores/psql'
import { onTestFinished } from 'vitest'
import {
  postPublicationShadowAuditLockKey,
  runPostPublicationShadowAudit,
} from '../services/post-publication/shadow-audit.mts'
import { createTestShadowAuditOwner } from './post-publication-shadow-audit-owner.mts'
import { TEST_STATEMENT_TIMEOUT_MS } from './statement-timeout-constant.mts'

type CursorState = { exists: boolean; cursor: string | null }

/** Commits one owned global page, observes it independently, then restores under the same key. */
export async function proveTestShadowAuditCommittedCheckpoint(ownedPostIds: readonly string[]) {
  if (ownedPostIds.length !== 3) throw new RangeError('Expected three owned source identities')
  const owner = createTestShadowAuditOwner()
  onTestFinished(owner.finish)
  let primary: PoolClient | undefined
  let observer: PoolClient | undefined
  let saved: CursorState | undefined
  let locked = false
  let touched = false
  let primaryPid: number | undefined
  let result:
    | { checkpoint: string; observedCheckpoint: string | null; distinctBackends: boolean }
    | undefined
  try {
    primary = await owner.admit(() => writePool.connect())
    owner.assertOpen()
    observer = await owner.admit(() => writePool.connect())
    owner.assertOpen()
    const client = primary
    const external = observer
    result = await owner.admit(async () => {
      for (const connection of [client, external]) {
        await using budget = await beginTransaction({ client: connection })
        owner.assertOpen()
        await budget('/* committedShadowAuditBudget */ SELECT set_config($1, $2, false)', [
          'statement_timeout',
          `${TEST_STATEMENT_TIMEOUT_MS}ms`,
        ])
        owner.assertOpen()
        await budget.commit()
      }
      owner.assertOpen()
      const ownPid = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      primaryPid = ownPid.rows[0]!.pid
      owner.assertOpen()
      const otherPid = await external.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      if (primaryPid === otherPid.rows[0]!.pid) throw new Error('Observer must use another backend')
      owner.assertOpen()
      await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
        postPublicationShadowAuditLockKey,
      ])
      locked = true
      owner.assertOpen()
      const baseline = await client.query<{ cursor_post_id: string | null }>(
        'SELECT cursor_post_id FROM post_publication_reconciliation_audit_cursors WHERE is_singleton',
      )
      saved = {
        exists: baseline.rows.length === 1,
        cursor: baseline.rows[0]?.cursor_post_id ?? null,
      }
      const postId = ownedPostIds.toSorted().findLast(id => id !== saved!.cursor)!
      {
        await using transaction = await beginTransaction({ client })
        const query = owner.guard(transaction)
        await query(
          '/* committedShadowAuditSnapshot */ SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
        )
        const actualOwned = await query<{ id: string }>(
          '/* committedShadowAuditOwnedSources */ SELECT id FROM posts WHERE id = ANY($1::uuid[]) ORDER BY id LIMIT 3',
          [ownedPostIds],
        )
        if (
          actualOwned.rows.length !== 3 ||
          actualOwned.rows.some(row => !ownedPostIds.includes(row.id))
        )
          throw new Error('All three owned source identities must exist in the proof snapshot')
        const previous = await query<{ id: string }>(
          `/* committedShadowAuditActualPredecessor */
          WITH previous_ids AS MATERIALIZED (
            (SELECT id FROM posts WHERE id < $1 ORDER BY id DESC LIMIT 1)
            UNION
            (SELECT post_identity_id AS id FROM post_publication_projection_receipts
              WHERE post_identity_id < $1 ORDER BY post_identity_id DESC LIMIT 1)
          ) SELECT id FROM previous_ids ORDER BY id DESC LIMIT 1`,
          [postId],
        )
        if (!previous.rows[0]) throw new Error('Actual owned predecessor missing')
        touched = true
        await query(
          `/* committedShadowAuditAnchor */
          INSERT INTO post_publication_reconciliation_audit_cursors (is_singleton, cursor_post_id)
          VALUES (TRUE, $1) ON CONFLICT (is_singleton) DO UPDATE SET cursor_post_id = EXCLUDED.cursor_post_id`,
          [previous.rows[0].id],
        )
        const page = await runPostPublicationShadowAudit({ dryRun: false, limit: 1 }, { query })
        if (page.scannedByScope.post !== 1 || page.checkpoint !== postId || !page.hasMore)
          throw new Error('Global page must contain only the owned source identity before commit')
        owner.assertOpen()
        await transaction.commit()
      }
      owner.assertOpen()
      const visible = await external.query<{ cursor_post_id: string | null }>(
        'SELECT cursor_post_id FROM post_publication_reconciliation_audit_cursors WHERE is_singleton',
      )
      if (visible.rows.length !== 1 || visible.rows[0]!.cursor_post_id !== postId)
        throw new Error('Independent backend did not observe the committed global checkpoint')
      return {
        checkpoint: postId,
        observedCheckpoint: visible.rows[0]!.cursor_post_id,
        distinctBackends: true,
      }
    })
  } catch (err) {
    owner.fail(err)
  } finally {
    await owner.drain()
    if (primary && locked && saved && touched) {
      try {
        await restoreCheckpoint(primary, observer!, saved, primaryPid!)
      } catch (err) {
        owner.cleanupFailure(err)
      }
    }
    if (primary && locked) {
      try {
        const unlocked = await primary.query<{ unlocked: boolean }>(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [postPublicationShadowAuditLockKey],
        )
        if (!unlocked.rows[0]?.unlocked)
          owner.cleanupFailure(new Error('Production session lock was not released'))
      } catch (err) {
        owner.cleanupFailure(err)
      }
    }
    for (const client of [observer, primary]) {
      if (!client) continue
      try {
        await client.end()
      } catch (err) {
        owner.cleanupFailure(err)
      }
      try {
        client.release(true)
      } catch (err) {
        owner.cleanupFailure(err)
      }
    }
    owner.complete()
  }
  owner.assertResult()
  if (!result) throw new Error('Committed global checkpoint proof returned no result')
  return result
}

async function restoreCheckpoint(
  primary: PoolClient,
  observer: PoolClient,
  saved: CursorState,
  primaryPid: number,
) {
  const pid = await primary.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
  if (pid.rows[0]!.pid !== primaryPid) throw new Error('Lost original lock-owning backend')
  {
    await using restore = await beginTransaction({ client: primary })
    if (saved.exists)
      await restore(
        `/* restoreCommittedShadowAuditCheckpoint */
              INSERT INTO post_publication_reconciliation_audit_cursors (is_singleton, cursor_post_id)
              VALUES (TRUE, $1) ON CONFLICT (is_singleton) DO UPDATE SET cursor_post_id = EXCLUDED.cursor_post_id`,
        [saved.cursor],
      )
    else
      await restore(
        '/* restoreAbsentShadowAuditCheckpoint */ DELETE FROM post_publication_reconciliation_audit_cursors WHERE is_singleton',
      )
    await restore.commit()
  }
  const restored = await observer.query<{ cursor_post_id: string | null }>(
    'SELECT cursor_post_id FROM post_publication_reconciliation_audit_cursors WHERE is_singleton',
  )
  if (
    (restored.rows.length === 1) !== saved.exists ||
    (restored.rows[0]?.cursor_post_id ?? null) !== saved.cursor
  )
    throw new Error('Independent checkpoint restoration readback failed')
}
