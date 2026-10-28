import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

type TestModerationSource = 'openai_omni' | 'spam_detection'

export async function getTestPostModerationAttemptStateForPost(
  postId: string,
  source: TestModerationSource,
): Promise<{ completed_at: Date | null; attempt_number: number } | null> {
  const { rows } = await read<{ completed_at: Date | null; attempt_number: number }>(
    sql`/* getTestPostModerationAttemptStateForPost */
      SELECT attempt.completed_at, attempt.attempt_number
      FROM post_moderation_attempts attempt
      JOIN post_moderation_versions version ON version.id = attempt.version_id
      WHERE version.post_id = ${postId} AND attempt.source = ${source}::post_moderation_sources
      ORDER BY attempt.id DESC LIMIT 1
    `,
  )
  return rows[0] ?? null
}

/** Counts this post's attempts that still have no disposition for their version and source. */
export async function countTestPostModerationIncompleteWork(postId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countTestPostModerationIncompleteWork */
    SELECT count(*)::int AS count
    FROM post_moderation_attempts attempt
    JOIN post_moderation_versions version ON version.id = attempt.version_id
    WHERE version.post_id = ${postId}
      AND NOT EXISTS (
        SELECT 1 FROM post_moderation_dispositions disposition
        WHERE disposition.version_id = attempt.version_id
          AND disposition.source = attempt.source
      )
  `)
  return rows[0]!.count
}

export async function countTestPostModerationAttempts(
  postId: string,
  source?: TestModerationSource,
): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countTestPostModerationAttempts */
    SELECT count(*)::int AS count
    FROM post_moderation_attempts attempt
    JOIN post_moderation_versions version ON version.id = attempt.version_id
    WHERE version.post_id = ${postId}
      AND (
        ${source ?? null}::post_moderation_sources IS NULL
        OR attempt.source = ${source ?? null}::post_moderation_sources
      )
  `)
  return rows[0]!.count
}

export async function getTestPostModerationVersionOwner(versionId: string): Promise<{
  id: string
  post_id: string
  content_sha256: Buffer
} | null> {
  const owners = await getTestPostModerationVersionOwners([versionId])
  return owners[0] ?? null
}

export async function getTestPostModerationVersionOwners(versionIds: readonly string[]): Promise<
  Array<{
    id: string
    post_id: string
    content_sha256: Buffer
  }>
> {
  if (versionIds.length === 0) return []
  const { rows } = await read<{ id: string; post_id: string; content_sha256: Buffer }>(
    sql`/* getTestPostModerationVersionOwners */
      SELECT id, post_id, content_sha256
      FROM post_moderation_versions
      WHERE id = ANY(${[...versionIds]}::uuid[])
    `,
  )
  return rows
}

/** The version that matches the post's stored moderation hash. */
export async function getTestCurrentPostModerationVersion(postId: string): Promise<{
  id: string
  content_sha256: Buffer
} | null> {
  const { rows } = await read<{ id: string; content_sha256: Buffer }>(
    sql`/* getTestCurrentPostModerationVersion */
      SELECT version.id, version.content_sha256
      FROM post_moderation_versions version
      JOIN posts post ON post.id = version.post_id
        AND post.llm_moderation_content_sha256 = version.content_sha256
      WHERE post.id = ${postId}
        AND version.policy_revision = '2026-09-09.1'
      ORDER BY version.id DESC
      LIMIT 1
    `,
  )
  return rows[0] ?? null
}
