import { write } from '@data-stores/psql'
import {
  POST_MODERATION_POLICY_REVISION,
  type AutomatedPostModerationSource,
} from './moderation-ledger-types.mts'

export type PostModerationReconciliation = {
  due: Array<{ post_id: string; source: AutomatedPostModerationSource }>
  exhausted_post_ids: string[]
}

export async function reconcilePostModerationWork(
  limit = 100,
): Promise<PostModerationReconciliation> {
  const { rows } = await write<{
    row_kind: 'due' | 'exhausted'
    post_id: string
    source: AutomatedPostModerationSource
  }>(
    `/* reconcilePostModerationWork */
      WITH expired_work AS (
        UPDATE post_moderation_work_items work
        SET completed_at = CURRENT_TIMESTAMP,
          leased_at = NULL,
          lease_token = NULL,
          lease_expires_at = NULL
        FROM post_moderation_versions version, posts post
        WHERE version.id = work.version_id
          AND post.id = version.post_id
          AND post.llm_moderation_content_sha256 = version.content_sha256
          AND version.policy_revision = $2
          AND work.completed_at IS NULL
          AND version.deadline_at <= CURRENT_TIMESTAMP
        RETURNING work.version_id, work.source, version.post_id
      ),
      exhausted_dispositions AS (
        INSERT INTO post_moderation_dispositions (
          version_id, source, disposition, reason_code, evidence
        )
        SELECT version_id, source, 'incomplete', 'automation_unavailable', '{}'::jsonb
        FROM expired_work
        RETURNING version_id
      ),
      due_work AS (
        SELECT version.post_id, work.source
        FROM post_moderation_work_items work
        JOIN post_moderation_versions version ON version.id = work.version_id
        JOIN posts post
          ON post.id = version.post_id
         AND post.llm_moderation_content_sha256 = version.content_sha256
        WHERE version.policy_revision = $2
          AND post.deleted_at IS NULL
          AND work.completed_at IS NULL
          AND work.available_at <= CURRENT_TIMESTAMP
          AND version.deadline_at > CURRENT_TIMESTAMP
          AND (work.lease_expires_at IS NULL OR work.lease_expires_at <= CURRENT_TIMESTAMP)
        ORDER BY work.available_at, version.id, work.source
        LIMIT $1
      )
      SELECT 'exhausted'::text AS row_kind, expired_work.post_id, expired_work.source
      FROM expired_work
      UNION ALL
      SELECT 'due'::text AS row_kind, due_work.post_id, due_work.source
      FROM due_work`,
    [limit, POST_MODERATION_POLICY_REVISION],
  )
  const due: PostModerationReconciliation['due'] = []
  const exhaustedPostIds = new Set<string>()
  for (const row of rows) {
    if (row.row_kind === 'due') due.push({ post_id: row.post_id, source: row.source })
    else exhaustedPostIds.add(row.post_id)
  }
  return { due, exhausted_post_ids: [...exhaustedPostIds] }
}
