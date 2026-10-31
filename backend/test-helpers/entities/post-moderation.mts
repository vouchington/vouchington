/* oxlint-disable max-lines -- Ledger fixture readers and writers retain one coherent test boundary. */
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { acquireTestPostgresAdvisoryLock } from '../postgres-advisory-lock.mts'

type TestModerationSource = 'openai_omni' | 'spam_detection'
type TestModerationDisposition = 'pass' | 'review' | 'reject' | 'incomplete'

export function acquirePostModerationLedgerRetentionTestLock() {
  return acquireTestPostgresAdvisoryLock({ namespace: 1_447_904_068, key: 4395, timeout: '25s' })
}

export async function recordTestPostModerationDisposition(input: {
  postId: string
  source: TestModerationSource
  disposition: TestModerationDisposition
  reasonCode: string
  evidence?: Record<string, unknown>
}): Promise<void> {
  await write(sql`/* recordTestPostModerationDisposition */
    WITH current_post AS (
      SELECT id, llm_moderation_content_sha256 FROM posts WHERE id = ${input.postId}
    ), version AS (
      INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision)
      SELECT id, llm_moderation_content_sha256, '2026-09-09.1' FROM current_post
      ON CONFLICT (post_id, content_sha256, policy_revision) DO UPDATE SET post_id = EXCLUDED.post_id
      RETURNING id
    )
    INSERT INTO post_moderation_dispositions (version_id, source, disposition, reason_code, evidence)
    SELECT version.id, ${input.source}::post_moderation_sources,
      ${input.disposition}::post_moderation_disposition_types,
      ${input.reasonCode}, ${JSON.stringify(input.evidence ?? {})}::jsonb
    FROM version
  `)
}

export async function updatePostModerationData(
  postId: string,
  contentSha256: Buffer,
  results: unknown,
  flagged: boolean,
): Promise<void> {
  await setPostLLMModerationContentSha256(postId, contentSha256)
  await recordTestPostModerationDisposition({
    postId,
    source: 'openai_omni',
    disposition: flagged ? 'review' : 'pass',
    reasonCode: flagged ? 'provider_flagged' : 'provider_pass',
    evidence: { flagged_categories: extractFlaggedCategories(results) },
  })
}

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

export async function setPostLLMModerationContentSha256(
  postId: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(sql`/* setPostLLMModerationContentSha256 */ UPDATE posts
    SET llm_moderation_content_sha256 = ${contentSha256} WHERE id = ${postId}`)
}

/** Compatibility fixture name; the canonical digest now identifies the moderation version. */
export async function setPostModerationContentSha256(
  postId: string,
  contentSha256: Buffer,
): Promise<void> {
  await write(sql`/* setPostModerationContentSha256 */ UPDATE posts
    SET llm_moderation_content_sha256 = ${contentSha256} WHERE id = ${postId}`)
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

export async function setPostSpamDetectionResults(
  postId: string,
  results: Array<{ signal: string; score: number; flagged: boolean; details?: unknown }>,
): Promise<void> {
  const flagged = results.some(result => result.flagged)
  await recordTestPostModerationDisposition({
    postId,
    source: 'spam_detection',
    disposition: flagged ? 'review' : 'pass',
    reasonCode: flagged ? 'spam_signal' : 'provider_pass',
    evidence: {
      composite_score: results.reduce((sum, result) => sum + result.score, 0),
      signals: results.map(({ signal, score, flagged }) => ({ signal, score, flagged })),
    },
  })
}

export async function markPostFlaggedForModeration(postId: string): Promise<void> {
  await setPostOpenAIModerationFlaggedOnly(postId, true)
  await write(sql`/* markPostFlaggedForModeration */
    UPDATE posts
    SET approved_at = NULL, in_review_at = NULL, rejected_at = CURRENT_TIMESTAMP
    WHERE id = ${postId}
  `)
}

export async function setPostOpenAIModerationResults(
  postId: string,
  options: { flagged: boolean; categories: Record<string, boolean> },
): Promise<void> {
  await recordTestPostModerationDisposition({
    postId,
    source: 'openai_omni',
    disposition: options.flagged ? 'review' : 'pass',
    reasonCode: options.flagged ? 'provider_flagged' : 'provider_pass',
    evidence: {
      flagged_categories: Object.entries(options.categories).reduce<string[]>(
        (categories, [category, categoryFlagged]) => {
          if (categoryFlagged) categories.push(category)
          return categories
        },
        [],
      ),
    },
  })
}

export async function setPostOpenAIModerationFlaggedOnly(
  postId: string,
  flagged: boolean,
): Promise<void> {
  await recordTestPostModerationDisposition({
    postId,
    source: 'openai_omni',
    disposition: flagged ? 'review' : 'pass',
    reasonCode: flagged ? 'provider_flagged' : 'provider_pass',
  })
}

export async function setPostOpenAIModerationResultsNoCategoryKey(
  postId: string,
  flagged: boolean,
): Promise<void> {
  await recordTestPostModerationDisposition({
    postId,
    source: 'openai_omni',
    disposition: flagged ? 'review' : 'pass',
    reasonCode: flagged ? 'provider_flagged' : 'provider_pass',
  })
}

export async function expireTestPostModerationVersion(versionId: string): Promise<void> {
  await write(sql`/* expireTestPostModerationVersion */
    UPDATE post_moderation_versions
    SET deadline_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
    WHERE id = ${versionId}
  `)
}

function extractFlaggedCategories(results: unknown): string[] {
  const entries = Array.isArray(results) ? results : [results]
  const categories = new Set<string>()
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const values = (entry as Record<string, unknown>).categories
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue
    for (const [category, flagged] of Object.entries(values))
      if (flagged === true) categories.add(category)
  }
  return [...categories]
}

export async function insertTestPostModerationVersionAt(input: {
  id: string
  postId: string
  contentSha256: Buffer
  policyRevision: string
}): Promise<void> {
  await write(sql`/* insertTestPostModerationVersionAt */
    INSERT INTO post_moderation_versions (id, post_id, content_sha256, policy_revision)
    VALUES (${input.id}, ${input.postId}, ${input.contentSha256}, ${input.policyRevision})`)
}

export async function insertTestPostModerationDispositionAt(input: {
  id: string
  versionId: string
  source: TestModerationSource | 'staff'
  disposition: TestModerationDisposition
  evidence: Record<string, unknown>
  attemptId?: string
  actorUserId?: string
}): Promise<void> {
  await write(sql`/* insertTestPostModerationDispositionAt */
    INSERT INTO post_moderation_dispositions
      (id, version_id, source, disposition, reason_code, evidence, attempt_id, actor_user_id)
    VALUES (${input.id}, ${input.versionId}, ${input.source}::post_moderation_sources,
      ${input.disposition}::post_moderation_disposition_types, 'test_reason',
      ${JSON.stringify(input.evidence)}::jsonb, ${input.attemptId ?? null}::uuid,
      ${input.actorUserId ?? null}::uuid)`)
}

export async function insertTestPostModerationAttemptAt(input: {
  id: string
  versionId: string
  source: TestModerationSource
}): Promise<void> {
  await write(sql`/* insertTestPostModerationAttemptAt */
    INSERT INTO post_moderation_attempts (id, version_id, source, attempt_number)
    VALUES (${input.id}, ${input.versionId}, ${input.source}::post_moderation_sources, 1)`)
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
