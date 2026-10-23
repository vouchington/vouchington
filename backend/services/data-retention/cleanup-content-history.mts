import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'
import type { DataRetentionLimits } from './config.mts'

const FAMILIES = [
  'topic_revisions',
  'post_moderation_versions',
  'post_moderation_dispositions',
  'agent_moderations',
] as const

type ContentHistoryFamily = (typeof FAMILIES)[number]
type CleanupPage = {
  family: ContentHistoryFamily
  scanned: number
  changed: number
  hasMore: boolean
}
type CleanupResult = {
  family: ContentHistoryFamily
  scanned: number
  changed: number
  hasMore: boolean
}

const MUTATIONS: Record<ContentHistoryFamily, string> = {
  topic_revisions: `/* cleanupContentHistory:topicRevisions */
    DELETE FROM topic_revisions old
    WHERE old.id = ANY($1::uuid[])
      AND EXISTS (
        SELECT 1 FROM topic_revisions newer
        WHERE newer.topic_id = old.topic_id AND newer.id > old.id
        LIMIT 1
      )`,
  post_moderation_versions: `/* cleanupContentHistory:moderationVersions */
    DELETE FROM post_moderation_versions old
    WHERE old.id = ANY($1::uuid[])
      AND NOT EXISTS (
        SELECT 1 FROM post_moderation_work_items work
        WHERE work.version_id = old.id AND work.lease_token IS NOT NULL
          AND work.lease_expires_at > CURRENT_TIMESTAMP LIMIT 1
      )
      AND EXISTS (
        SELECT 1 FROM posts post
        WHERE post.id = old.post_id
          AND (post.llm_moderation_content_sha256 <> old.content_sha256
            OR old.policy_revision <> $2)
        LIMIT 1
      )`,
  post_moderation_dispositions: `/* cleanupContentHistory:passEvidence */
    UPDATE post_moderation_dispositions old
    SET evidence = '{}'::jsonb
    FROM post_moderation_versions version
    JOIN posts post ON post.id = version.post_id
    WHERE old.id = ANY($1::uuid[])
      AND old.version_id = version.id
      AND old.disposition = 'pass'
      AND old.evidence <> '{}'::jsonb
      AND version.content_sha256 = post.llm_moderation_content_sha256
      AND version.policy_revision = $2`,
  agent_moderations: `/* cleanupContentHistory:agentModerations */
    DELETE FROM agent_moderations old
    WHERE old.id = ANY($1::uuid[])
      AND old.moderation_transparency_category IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM moderation_training_feedbacks feedback
        WHERE feedback.agent_moderation_id = old.id LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM moderator_actions action
        WHERE action.agent_moderation_id = old.id LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM vote_integrity_flags flag
        WHERE flag.agent_moderation_id = old.id LIMIT 1
      )
      AND EXISTS (
        SELECT 1 FROM agent_moderations newer
        WHERE newer.post_id = old.post_id
          AND newer.prompt_id = old.prompt_id
          AND newer.id > old.id
        LIMIT 1
      )`,
}

/**
 * A proposed-default one-year topic window and 90-day moderation windows. Each family advances
 * its own persisted deletion-stable UUIDv7 cursor, including across exempt rows. A cycle fixes
 * its upper bound before reading and resets only after scanning that bound to completion.
 */
export async function cleanupContentHistory(
  limits: DataRetentionLimits,
  now: Date = new Date(),
): Promise<CleanupResult[]> {
  const results: CleanupResult[] = []
  for (const family of FAMILIES) {
    const cutoff = new Date(now)
    if (family === 'topic_revisions') {
      const year = now.getUTCFullYear() - 1
      const month = now.getUTCMonth()
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      cutoff.setUTCFullYear(year, month, Math.min(now.getUTCDate(), lastDay))
    } else cutoff.setUTCDate(cutoff.getUTCDate() - 90)
    const upperId = getMinUUIDv7ForDate(cutoff)
    let scanned = 0
    let changed = 0
    let hasMore = false
    // oxlint-disable no-await-in-loop -- the committed cursor determines the next bounded page.
    for (let batch = 0; batch < limits.maxBatches; batch += 1) {
      // no-mistakes-disable-next-line query-reached-per-item: four fixed families have separate persisted cursors; each bounded page must commit before the next.
      const page = await cleanupPage(family, upperId, limits.batchSize)
      scanned += page.scanned
      changed += page.changed
      hasMore = page.hasMore
      if (!hasMore) break
    }
    // oxlint-enable no-await-in-loop
    results.push({ family, scanned, changed, hasMore })
  }
  return results
}

async function cleanupPage(
  family: ContentHistoryFamily,
  requestedUpperId: string,
  batchSize: number,
): Promise<CleanupPage> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* cleanupContentHistory:ensureCursor */
      INSERT INTO content_history_cleanup_cursors (family) VALUES ($1)
      ON CONFLICT DO NOTHING`,
    [family],
  )
  const { rows: cursors } = await transaction<{
    cursor_record_id: string | null
    sweep_upper_bound_record_id: string | null
  }>(
    `/* cleanupContentHistory:lockCursor */
      SELECT cursor_record_id, sweep_upper_bound_record_id
      FROM content_history_cleanup_cursors WHERE family = $1 FOR UPDATE`,
    [family],
  )
  const cursor = cursors[0]!
  const upperId = cursor.sweep_upper_bound_record_id ?? requestedUpperId
  const { rows: candidates } = await transaction<{ id: string }>(
    `/* cleanupContentHistory:listCandidates */
      SELECT id FROM ${family}
      WHERE id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND id < $2::uuid
      ORDER BY id ASC
      LIMIT $3
      FOR UPDATE SKIP LOCKED`,
    [cursor.cursor_record_id, upperId, batchSize + 1],
  )
  const page = candidates.slice(0, batchSize)
  const ids = page.map(row => row.id)
  let changed = 0
  if (ids.length > 0) {
    const args =
      family === 'post_moderation_versions' || family === 'post_moderation_dispositions'
        ? [ids, POST_MODERATION_POLICY_REVISION]
        : [ids]
    const result = await transaction(MUTATIONS[family], args)
    changed = result.rowCount ?? 0
  }
  const hasMore = candidates.length > batchSize
  await transaction(
    `/* cleanupContentHistory:advanceCursor */
      UPDATE content_history_cleanup_cursors
      SET cursor_record_id = $2, sweep_upper_bound_record_id = $3
      WHERE family = $1`,
    [family, hasMore ? page.at(-1)!.id : null, hasMore ? upperId : null],
  )
  await transaction.commit()
  return { family, scanned: page.length, changed, hasMore }
}
