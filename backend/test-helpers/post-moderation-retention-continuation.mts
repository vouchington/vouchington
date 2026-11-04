import { randomBytes, randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { POST_MODERATION_POLICY_REVISION } from '../services/post-clearance/moderation-ledger-types.mts'
import {
  createTestUser,
  insertTestPost,
  insertTestPostModerationVersionAt,
  insertTestPostModerationDispositionAt,
  setPostLLMModerationContentSha256,
} from './index.mts'
import { createIsolatedRetentionWindow } from './retention-window.mts'

export async function createPostModerationRetentionContinuationFixture() {
  const window = createIsolatedRetentionWindow()
  const user = await createTestUser()
  const createLedger = async (oldCount: number, passCount: number) => {
    const postId = await insertTestPost({
      createdById: user.id,
      slug: `retention-continuation-${randomUUID()}`,
      title: 'Retention continuation',
      markdown: 'body',
      clearanceStatus: 'pending',
    })
    const digest = randomBytes(32)
    await setPostLLMModerationContentSha256(postId, digest)
    const versionIds = Array.from({ length: oldCount + 1 }, (_, index) =>
      uuidv7({ msecs: window.at(100).getTime() + index }),
    )
    // Ordered insertion gives each predecessor its successor marker.
    const insertVersion = (index: number) =>
      insertTestPostModerationVersionAt({
        id: versionIds[index]!,
        postId,
        contentSha256: index === oldCount ? digest : randomBytes(32),
        policyRevision: POST_MODERATION_POLICY_REVISION,
      })
    await insertVersion(0)
    await insertVersion(1)
    if (oldCount === 3) {
      await insertVersion(2)
      await insertVersion(3)
    }
    const dispositionIds = Array.from({ length: passCount }, (_, index) =>
      uuidv7({ msecs: window.at(99).getTime() + index }),
    )
    await Promise.all(
      dispositionIds.map(id =>
        insertTestPostModerationDispositionAt({
          id,
          versionId: versionIds.at(-1)!,
          source: 'openai_omni',
          disposition: 'pass',
          evidence: { retained: true },
        }),
      ),
    )
    await write(sql`/* createPostModerationRetentionContinuationFixture.markers */
      UPDATE post_moderation_versions SET retention_hash_blocked_at = NULL
      WHERE post_id = ${postId}::uuid`)
    await write(sql`/* createPostModerationRetentionContinuationFixture.work */
      DELETE FROM post_moderation_retention_post_work_items WHERE post_id = ${postId}::uuid`)
    return { postId, versionIds, dispositionIds }
  }
  const owned = await createLedger(3, 3)
  const neighbor = await createLedger(1, 1)
  const sentinelId = owned.versionIds[2]!
  await setPostModerationRetentionSentinelDueAt(sentinelId, null)
  return { ...window, owned, neighbor, sentinelId }
}

export async function setPostModerationRetentionSentinelDueAt(id: string, dueAt: Date | null) {
  await write(sql`/* setPostModerationRetentionSentinelDueAt */
    UPDATE post_moderation_versions SET retention_due_at = ${dueAt} WHERE id = ${id}::uuid`)
}

export async function reservePostModerationRetentionPolicyCursor() {
  const { rows } = await write<{ state: unknown }>(`
    /* reservePostModerationRetentionPolicyCursor */
    SELECT row_to_json(cursor) AS state FROM post_moderation_retention_cursors cursor
    WHERE kind = 'superseded_versions'
  `)
  return async () => {
    await using query = await beginTransaction()
    await query(`/* restorePostModerationRetentionPolicyCursor.delete */
      DELETE FROM post_moderation_retention_cursors WHERE kind = 'superseded_versions'`)
    if (rows[0]) {
      await query(
        `/* restorePostModerationRetentionPolicyCursor.insert */
        INSERT INTO post_moderation_retention_cursors
        SELECT * FROM json_populate_record(NULL::post_moderation_retention_cursors, $1::json)`,
        [JSON.stringify(rows[0].state)],
      )
    }
    await query.commit()
  }
}

export async function setPostModerationRetentionPolicyCursor(revision: string | null) {
  await write(sql`/* setPostModerationRetentionPolicyCursor */
    INSERT INTO post_moderation_retention_cursors (kind, observed_policy_revision)
    VALUES ('superseded_versions', ${revision})
    ON CONFLICT (kind) DO UPDATE SET observed_policy_revision = EXCLUDED.observed_policy_revision,
      cursor_policy_version_record_id = NULL, policy_sweep_completed_at = NULL`)
}

export async function blockPostModerationRetentionFixtureVersions(ids: string[]) {
  await write(sql`/* blockPostModerationRetentionFixtureVersions */
    UPDATE post_moderation_versions SET retention_due_at = NULL,
      retention_hash_blocked_at = CURRENT_TIMESTAMP WHERE id = ANY(${ids}::uuid[])`)
}

export async function enqueuePostModerationRetentionFixtureWork(postId: string) {
  await write(sql`/* enqueuePostModerationRetentionFixtureWork */
    SELECT fn_create_post_moderation_retention_post_work_item(${postId}::uuid)`)
  return async () => {
    await write(sql`/* cleanupPostModerationRetentionFixtureWork */
      DELETE FROM post_moderation_retention_post_work_items WHERE post_id = ${postId}::uuid`)
  }
}
