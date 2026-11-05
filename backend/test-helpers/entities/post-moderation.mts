import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { acquireTestPostgresAdvisoryLock } from '../postgres-advisory-lock.mts'

type TestModerationSource = 'openai_omni' | 'spam_detection'
export type TestModerationDisposition = 'pass' | 'review' | 'reject' | 'incomplete'

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

export async function setPostSpamDetectionResults(
  postId: string,
  results: Array<{ signal: string; score: number; flagged: boolean; details?: unknown }>,
): Promise<void> {
  const hasFlaggedSignal = results.some(result => result.flagged)
  await recordTestPostModerationDisposition({
    postId,
    source: 'spam_detection',
    disposition: hasFlaggedSignal ? 'review' : 'pass',
    reasonCode: hasFlaggedSignal ? 'spam_signal' : 'provider_pass',
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
