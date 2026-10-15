import { insertShadowAuditTerminalWitnesses } from './post-publication-shadow-audit-terminal.mts'
import { createCheckpointProofTrace } from './post-publication-shadow-audit-trace.mts'
import { beginTransaction, writePool, type PoolClient } from '@data-stores/psql'
import {
  runPostPublicationShadowAudit,
  postPublicationShadowAuditLockKey,
} from '../services/post-publication/shadow-audit.mts'
import { v7 as uuidv7 } from 'uuid'
import { onTestFinished } from 'vitest'
import { createTestShadowAuditOwner } from './post-publication-shadow-audit-owner.mts'
import { TEST_STATEMENT_TIMEOUT_MS } from './statement-timeout-constant.mts'
import { createTestUserWithId, createTestUsername, softDeleteUser } from './entities/users.mts'
import { insertTestPost, deleteTestPost } from './entities/posts.mts'

/** Native UUID fixtures; cleanup is registered before any database effect. */
export async function createTestShadowAuditFixtures(ownedCount = 1) {
  const userId = uuidv7()
  const postIds = Array.from({ length: ownedCount }, () => uuidv7()).toSorted()
  const foreignPostId = uuidv7()
  const allPostIds = [...postIds, foreignPostId]
  onTestFinished(async () => {
    const errors: unknown[] = []
    for (const id of allPostIds) {
      try {
        await deleteTestPost(id)
      } catch (err) {
        errors.push(err)
      }
    }
    try {
      await softDeleteUser(userId)
    } catch (err) {
      errors.push(err)
    }
    if (errors.length)
      throw new AggregateError(errors, 'Shadow audit fixture cleanup failed', { cause: errors[0] })
  })
  await createTestUserWithId(userId, createTestUsername())
  await insertTestPost({
    id: foreignPostId,
    title: `Unselected shadow audit ${foreignPostId}`,
    slug: `shadow-foreign-${foreignPostId}`,
    markdown: 'Eligible primary row outside the finite operator selection.',
    createdById: userId,
  })
  return {
    user: { id: userId },
    suffix: postIds[0]!,
    ids: { postId: postIds[0]!, foreignPostId },
    postIds,
  }
}

export async function insertAuditPost(
  userId: string,
  id: string,
  slug: string,
  title: string,
  markdown: string,
) {
  return insertTestPost({ id, title, slug, markdown, createdById: userId })
}
/** Shares the production lock/client, freezes actual sources, and rolls all proof writes back. */
export async function withTestShadowAuditCheckpoint<Result>(
  run: (context: {
    audit: (
      options: Parameters<typeof runPostPublicationShadowAudit>[0],
    ) => ReturnType<typeof runPostPublicationShadowAudit>
    setCheckpoint: (id: string | null) => Promise<void>
    getCheckpoint: () => Promise<string | null>
    terminalPage: (
      userId: string,
    ) => Promise<{ before: string | null; ids: string[]; maximum: string }>
    hasRepair: (id: string) => Promise<boolean>
  }) => Promise<Result>,
): Promise<Result> {
  const owner = createTestShadowAuditOwner()
  onTestFinished(owner.finish)
  let client: PoolClient | undefined
  let locked = false
  const trace = createCheckpointProofTrace(postPublicationShadowAuditLockKey)
  let result: Result | undefined
  try {
    client = await owner.admit(() => writePool.connect())
    owner.assertOpen()
    const borrowedClient = client
    {
      await using reservation = await owner.admit(() =>
        beginTransaction({ client: borrowedClient }),
      )
      owner.assertOpen()
      await reservation('/* reserveShadowAuditLockBudget */ SELECT set_config($1, $2, false)', [
        'statement_timeout',
        `${TEST_STATEMENT_TIMEOUT_MS}ms`,
      ])
      await reservation(
        '/* reserveShadowAuditCheckpoint */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
        [postPublicationShadowAuditLockKey],
      )
      locked = true
      owner.assertOpen()
      await trace.snapshot('session-fence-held-before-proof', reservation)
      await reservation.commit()
    }
    await using query = await owner.admit(() => beginTransaction({ client: borrowedClient }))
    owner.assertOpen()
    const guarded = owner.guard(trace.guard(query))
    try {
      await guarded(
        '/* shadowAuditCheckpointSnapshot */ SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
      )
      await trace.snapshot('rr-before-cursor-reservation', guarded)
      await guarded(`/* reserveShadowAuditCheckpointRow */
      INSERT INTO post_publication_reconciliation_audit_cursors (is_singleton)
      VALUES (TRUE) ON CONFLICT DO NOTHING`)
      await guarded(`/* reserveShadowAuditCheckpointRow */
      SELECT cursor_post_id FROM post_publication_reconciliation_audit_cursors
      WHERE is_singleton FOR UPDATE`)
      owner.assertOpen()
      result = await run({
        audit: options =>
          owner.admit(() => runPostPublicationShadowAudit(options, { query: guarded })),
        setCheckpoint: id =>
          owner.admit(async () => {
            await guarded(
              '/* setShadowAuditProofCheckpoint */ UPDATE post_publication_reconciliation_audit_cursors SET cursor_post_id = $1 WHERE is_singleton',
              [id],
            )
          }),
        getCheckpoint: () =>
          owner.admit(async () => {
            const { rows } = await guarded<{
              cursor_post_id: string | null
            }>(`/* readShadowAuditProofCheckpoint */
          SELECT cursor_post_id FROM post_publication_reconciliation_audit_cursors WHERE is_singleton`)
            if (!rows[0]) throw new Error('Reserved shadow audit checkpoint missing')
            return rows[0].cursor_post_id
          }),
        terminalPage: userId =>
          owner.admit(() => insertShadowAuditTerminalWitnesses(guarded, userId)),
        hasRepair: id =>
          owner.admit(async () => {
            const { rows } = await guarded(
              '/* readShadowAuditProofRepair */ SELECT id FROM post_publication_dirty_work WHERE post_identity_id = $1',
              [id],
            )
            return rows.length > 0
          }),
      })
    } catch (err) {
      owner.fail(err)
    } finally {
      await owner.drain()
    }
    // Disposal rolls back only after all admitted callback operations settle.
  } catch (err) {
    owner.fail(err)
  } finally {
    await owner.drain()
    if (client && locked) {
      try {
        const { rows } = await client.query<{ unlocked: boolean }>(
          '/* releaseShadowAuditCheckpoint */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [postPublicationShadowAuditLockKey],
        )
        if (!rows[0]?.unlocked)
          owner.cleanupFailure(new Error('Shadow audit checkpoint lock was not released'))
      } catch (err) {
        owner.cleanupFailure(err)
      }
    }
    if (client) {
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
    try {
      trace.flush()
    } catch (err) {
      owner.cleanupFailure(err)
    }
    owner.complete()
  }
  owner.assertResult()
  return result as Result
}
