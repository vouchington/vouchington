import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { TestModerationDisposition } from './post-moderation.mts'

export async function getPostModerationData(postId: string): Promise<{
  openai_omni_moderation_content_sha256: Buffer | null
  openai_omni_moderation_input_sha256: Buffer | null
  openai_omni_moderation_results: unknown
  is_flagged_by_openai_omni_moderation: boolean | null
  openai_omni_moderation_created_at: Date | null
} | null> {
  const { rows } = await read<{
    openai_omni_moderation_content_sha256: Buffer | null
    openai_omni_moderation_input_sha256: Buffer | null
    openai_omni_moderation_results: unknown
    is_flagged_by_openai_omni_moderation: boolean | null
    openai_omni_moderation_created_at: Date | null
  }>(sql`/* getPostModerationData */
    SELECT post.llm_moderation_content_sha256 AS openai_omni_moderation_content_sha256,
      version.content_sha256 AS openai_omni_moderation_input_sha256,
      disposition.evidence AS openai_omni_moderation_results,
      CASE WHEN disposition.disposition IS NULL THEN NULL ELSE disposition.disposition <> 'pass' END AS is_flagged_by_openai_omni_moderation,
      disposition.decided_at AS openai_omni_moderation_created_at
    FROM posts post
    LEFT JOIN post_moderation_versions version ON version.post_id = post.id
      AND version.content_sha256 = post.llm_moderation_content_sha256 AND version.policy_revision = '2026-09-09.1'
    LEFT JOIN LATERAL (
      SELECT disposition, evidence, decided_at FROM post_moderation_dispositions
      WHERE version_id = version.id AND source = 'openai_omni' ORDER BY id DESC LIMIT 1
    ) disposition ON true
    WHERE post.id = ${postId} ORDER BY version.id DESC NULLS LAST LIMIT 1
  `)
  return rows[0] ?? null
}

export async function getPostLLMModerationContentSha256(postId: string): Promise<Buffer | null> {
  const { rows } = await read<{ llm_moderation_content_sha256: Buffer }>(
    sql`/* getPostLLMModerationContentSha256 */ SELECT llm_moderation_content_sha256
      FROM posts WHERE id = ${postId}`,
  )
  return rows[0]?.llm_moderation_content_sha256 ?? null
}

export async function getPostSpamDetectionState(postId: string): Promise<{
  spam_detection_flagged: boolean | null
  spam_detection_created_at: Date | null
  spam_detection_score: number | null
  spam_detection_results: unknown
} | null> {
  const { rows } = await read<{
    spam_detection_flagged: boolean | null
    spam_detection_created_at: Date | null
    spam_detection_score: number | null
    spam_detection_results: unknown
  }>(sql`/* getPostSpamDetectionState */
    SELECT CASE WHEN disposition.disposition IS NULL THEN NULL ELSE disposition.disposition <> 'pass' END AS spam_detection_flagged,
      disposition.decided_at AS spam_detection_created_at,
      NULLIF(disposition.evidence->>'composite_score', '')::double precision AS spam_detection_score,
      disposition.evidence AS spam_detection_results
    FROM posts post
    LEFT JOIN post_moderation_versions version ON version.post_id = post.id
      AND version.content_sha256 = post.llm_moderation_content_sha256 AND version.policy_revision = '2026-09-09.1'
    LEFT JOIN LATERAL (
      SELECT disposition, evidence, decided_at FROM post_moderation_dispositions
      WHERE version_id = version.id AND source = 'spam_detection' ORDER BY id DESC LIMIT 1
    ) disposition ON true
    WHERE post.id = ${postId} ORDER BY version.id DESC NULLS LAST LIMIT 1
  `)
  return rows[0] ?? null
}

export async function getPostModerationResetState(postId: string): Promise<{
  clearance_version: string
  approved_at: Date | null
  rejected_at: Date | null
  in_review_at: Date | null
  llm_moderation_content_sha256: Buffer
  is_flagged_by_openai_omni_moderation: boolean | null
  openai_omni_moderation_created_at: Date | null
  spam_detection_flagged: boolean | null
  spam_detection_created_at: Date | null
  spam_detection_score: number | null
  spam_detection_results: unknown
} | null> {
  const [post, openai, spam] = await Promise.all([
    read<{
      clearance_version: string
      approved_at: Date | null
      rejected_at: Date | null
      in_review_at: Date | null
      llm_moderation_content_sha256: Buffer
    }>(sql`/* getPostModerationResetState */ SELECT clearance_version, approved_at,
      rejected_at, in_review_at, llm_moderation_content_sha256 FROM posts WHERE id = ${postId}`),
    getPostModerationData(postId),
    getPostSpamDetectionState(postId),
  ])
  const state = post.rows[0]
  if (!state) return null
  return {
    ...state,
    is_flagged_by_openai_omni_moderation: openai?.is_flagged_by_openai_omni_moderation ?? null,
    openai_omni_moderation_created_at: openai?.openai_omni_moderation_created_at ?? null,
    spam_detection_flagged: spam?.spam_detection_flagged ?? null,
    spam_detection_created_at: spam?.spam_detection_created_at ?? null,
    spam_detection_score: spam?.spam_detection_score ?? null,
    spam_detection_results: spam?.spam_detection_results ?? null,
  }
}

export async function getTestPostModerationRetentionState(input: {
  versionIds: string[]
  dispositionIds: string[]
  attemptIds?: string[]
}): Promise<{
  versions: string[]
  attempts: string[]
  dispositions: { id: string; disposition: TestModerationDisposition; evidence: unknown }[]
}> {
  const [versions, attempts, dispositions] = await Promise.all([
    write<{ id: string }>(sql`/* getTestPostModerationRetentionState.versions */
      SELECT id FROM post_moderation_versions WHERE id = ANY(${input.versionIds}::uuid[]) ORDER BY id`),
    write<{ id: string }>(sql`/* getTestPostModerationRetentionState.attempts */
      SELECT id FROM post_moderation_attempts WHERE id = ANY(${input.attemptIds ?? []}::uuid[]) ORDER BY id`),
    write<{
      id: string
      disposition: TestModerationDisposition
      evidence: unknown
    }>(sql`/* getTestPostModerationRetentionState.dispositions */
      SELECT id, disposition, evidence FROM post_moderation_dispositions
      WHERE id = ANY(${input.dispositionIds}::uuid[]) ORDER BY id`),
  ])
  return {
    versions: versions.rows.map(row => row.id),
    attempts: attempts.rows.map(row => row.id),
    dispositions: dispositions.rows,
  }
}
