import { write } from '@data-stores/psql'
import { getPostClearanceWorkLimit } from './work-limits.mts'
import {
  AUTOMATED_POST_MODERATION_SOURCES,
  POST_MODERATION_POLICY_REVISION,
  type AutomatedPostModerationSource,
} from './moderation-ledger-types.mts'

export type PostModerationReconciliationCursor = {
  afterVersionId: string
  afterSource: AutomatedPostModerationSource
  throughId: string
}

export type PostModerationReconciliation = {
  due: Array<{
    post_id: string
    version_id: string
    source: AutomatedPostModerationSource
  }>
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
      WITH version_page AS MATERIALIZED (
        SELECT version.id AS version_id, version.post_id, version.content_sha256, version.deadline_at,
          COALESCE($6::uuid, fn_min_uuidv7(CURRENT_TIMESTAMP + INTERVAL '1 millisecond')) AS through_id
        FROM post_moderation_versions version
        WHERE version.policy_revision = $2
          AND version.id < COALESCE($6::uuid, fn_min_uuidv7(CURRENT_TIMESTAMP + INTERVAL '1 millisecond'))
          AND ($4::uuid IS NULL OR version.id > $4::uuid OR version.id = $4::uuid)
          AND ($3::uuid[] IS NULL OR version.post_id = ANY($3::uuid[]))
        ORDER BY version.id
        LIMIT $1 + 1
      ), expanded AS MATERIALIZED (
        SELECT version_page.version_id, source.source::post_moderation_sources AS source,
          version_page.post_id, version_page.deadline_at, version_page.through_id
        FROM version_page
        JOIN LATERAL (
          SELECT post.id
          FROM posts post
          WHERE post.id = version_page.post_id
            AND post.llm_moderation_content_sha256 = version_page.content_sha256
            AND post.deleted_at IS NULL
          LIMIT 1
        ) post ON TRUE
        CROSS JOIN unnest($7::text[]) AS source(source)
        WHERE ($4::uuid IS NULL OR (version_page.version_id, source.source::post_moderation_sources)
            > ($4::uuid, $5::post_moderation_sources))
          AND NOT EXISTS (
            SELECT 1 FROM post_moderation_dispositions disposition
            WHERE disposition.version_id = version_page.version_id
              AND disposition.source = source.source::post_moderation_sources
          )
      ), ordered_sources AS MATERIALIZED (
        SELECT * FROM expanded ORDER BY version_id, source
      ), selected AS MATERIALIZED (
        SELECT * FROM ordered_sources LIMIT $1
      ), exhausted_dispositions AS (
        INSERT INTO post_moderation_dispositions (
          version_id, source, attempt_id, disposition, reason_code, evidence
        )
        SELECT selected.version_id, selected.source, attempt.id, 'incomplete',
          'automation_unavailable', '{}'::jsonb
        FROM selected
        JOIN post_moderation_attempts attempt
          ON attempt.version_id = selected.version_id AND attempt.source = selected.source
        WHERE selected.deadline_at <= CURRENT_TIMESTAMP
        ORDER BY attempt.id ASC NULLS LAST
        ON CONFLICT (attempt_id) DO NOTHING
        RETURNING version_id, source
      ), continuation AS (
        (
          SELECT version_id, source, post_id, through_id FROM selected
          WHERE (SELECT count(*) FROM ordered_sources) > $1
            OR (
              (SELECT count(*) FROM selected) > 0
              AND (SELECT count(*) FROM version_page) > $1
              AND (SELECT count(*) FROM ordered_sources) <= $1
            )
          ORDER BY version_id DESC, source DESC
          LIMIT 1
        )
        UNION ALL
        (
          SELECT numbered.version_id,
            (
              SELECT source.source::post_moderation_sources
              FROM unnest($7::text[]) AS source(source)
              ORDER BY source.source::post_moderation_sources DESC
              LIMIT 1
            ),
            numbered.post_id, numbered.through_id
          FROM (
            SELECT version_page.*, row_number() OVER (ORDER BY version_id) AS n
            FROM version_page
          ) numbered
          WHERE (SELECT count(*) FROM selected) = 0
            AND (SELECT count(*) FROM version_page) > $1
            AND numbered.n = $1
        )
      )
      SELECT 'exhausted'::text AS row_kind, selected.post_id, selected.version_id, selected.source,
        selected.through_id
      FROM selected
      JOIN exhausted_dispositions USING (version_id, source)
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
      [...AUTOMATED_POST_MODERATION_SOURCES],
    ],
  )
  const due: PostModerationReconciliation['due'] = []
  const exhaustedPostIds = new Set<string>()
  let nextCursor: PostModerationReconciliationCursor | undefined
  for (const row of rows) {
    if (row.row_kind === 'due') {
      due.push({ post_id: row.post_id, version_id: row.version_id, source: row.source })
    } else if (row.row_kind === 'exhausted') exhaustedPostIds.add(row.post_id)
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
