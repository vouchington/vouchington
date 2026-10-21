import { write } from '@data-stores/psql'
import { getPostClearanceWorkLimit } from './work-limits.mts'
import {
  POST_MODERATION_POLICY_REVISION,
  type AutomatedPostModerationSource,
} from './moderation-ledger-types.mts'

export type PostModerationReconciliationCursor = {
  afterVersionId: string
  afterSource: AutomatedPostModerationSource
  throughId: string
}

export type PostModerationReconciliation = {
  due: Array<{ post_id: string; source: AutomatedPostModerationSource }>
  exhausted_post_ids: string[]
  hasMore: boolean
  nextCursor?: PostModerationReconciliationCursor
}

export async function reconcilePostModerationWork(
  limit = getPostClearanceWorkLimit('reconciliation_batch_size'),
  postIds?: readonly string[],
  cursor?: PostModerationReconciliationCursor,
): Promise<PostModerationReconciliation> {
  if (postIds?.length === 0) return { due: [], exhausted_post_ids: [], hasMore: false }
  const throughId = cursor?.throughId ?? null
  const pageSize = Math.max(
    1,
    Math.min(Math.trunc(limit), getPostClearanceWorkLimit('reconciliation_batch_size')),
  )
  const { rows } = await write<{
    row_kind: 'due' | 'exhausted' | 'continuation'
    post_id: string
    version_id: string
    through_id: string
    source: AutomatedPostModerationSource
  }>(
    `/* reconcilePostModerationWork */
      WITH candidates AS MATERIALIZED (
        SELECT work.version_id, work.source, version.post_id, version.deadline_at,
          COALESCE($6::uuid, fn_min_uuidv7(CURRENT_TIMESTAMP + INTERVAL '1 millisecond')) AS through_id
        FROM post_moderation_work_items work
        JOIN post_moderation_versions version ON version.id = work.version_id
        JOIN posts post ON post.id = version.post_id
          AND post.llm_moderation_content_sha256 = version.content_sha256
        WHERE version.policy_revision = $2
          AND version.id < COALESCE($6::uuid, fn_min_uuidv7(CURRENT_TIMESTAMP + INTERVAL '1 millisecond'))
          AND ($4::uuid IS NULL OR (work.version_id, work.source) > ($4::uuid, $5::post_moderation_sources))
          AND ($3::uuid[] IS NULL OR post.id = ANY($3::uuid[]))
          AND work.completed_at IS NULL
          AND (version.deadline_at <= CURRENT_TIMESTAMP OR (
            post.deleted_at IS NULL AND work.available_at <= CURRENT_TIMESTAMP
            AND (work.lease_expires_at IS NULL OR work.lease_expires_at <= CURRENT_TIMESTAMP)
          ))
        ORDER BY work.version_id, work.source
        LIMIT $1 + 1
        FOR UPDATE OF work SKIP LOCKED
      ), selected AS MATERIALIZED (
        SELECT * FROM candidates ORDER BY version_id, source LIMIT $1
      ), expired_work AS (
        UPDATE post_moderation_work_items work
        SET completed_at = CURRENT_TIMESTAMP, leased_at = NULL,
          lease_token = NULL, lease_expires_at = NULL
        FROM selected
        WHERE work.version_id = selected.version_id AND work.source = selected.source
          AND selected.deadline_at <= CURRENT_TIMESTAMP
        RETURNING work.version_id, work.source, selected.post_id, selected.through_id
      ), exhausted_dispositions AS (
        INSERT INTO post_moderation_dispositions (
          version_id, source, disposition, reason_code, evidence
        )
        SELECT version_id, source, 'incomplete', 'automation_unavailable', '{}'::jsonb
        FROM expired_work RETURNING version_id
      ), continuation AS (
        SELECT * FROM selected WHERE (SELECT count(*) FROM candidates) > $1
        ORDER BY version_id DESC, source DESC LIMIT 1
      )
      SELECT 'exhausted'::text AS row_kind, post_id, version_id, source, through_id FROM expired_work
      UNION ALL
      SELECT 'due'::text, post_id, version_id, source, through_id FROM selected
        WHERE deadline_at > CURRENT_TIMESTAMP
      UNION ALL
      SELECT 'continuation'::text, post_id, version_id, source, through_id FROM continuation`,
    [
      pageSize,
      POST_MODERATION_POLICY_REVISION,
      postIds ?? null,
      cursor?.afterVersionId ?? null,
      cursor?.afterSource ?? null,
      throughId,
    ],
  )
  const due: PostModerationReconciliation['due'] = []
  const exhaustedPostIds = new Set<string>()
  let nextCursor: PostModerationReconciliationCursor | undefined
  for (const row of rows) {
    if (row.row_kind === 'due') due.push({ post_id: row.post_id, source: row.source })
    else if (row.row_kind === 'exhausted') exhaustedPostIds.add(row.post_id)
    else
      nextCursor = {
        afterVersionId: row.version_id,
        afterSource: row.source,
        throughId: row.through_id,
      }
  }
  return {
    due,
    exhausted_post_ids: [...exhaustedPostIds],
    hasMore: nextCursor !== undefined,
    ...(nextCursor && { nextCursor }),
  }
}
