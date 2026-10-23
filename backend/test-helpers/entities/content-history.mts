import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

/** An aged current moderation decision with private evidence for retention tests. */
export async function insertTestAgedCurrentPassEvidence(
  postId: string,
  decidedAt: Date,
): Promise<{ versionId: string; dispositionIds: string[] }> {
  const versionId = uuidv7({ msecs: decidedAt.getTime(), seq: 0 })
  const openaiId = uuidv7({ msecs: decidedAt.getTime(), seq: 1 })
  const spamId = uuidv7({ msecs: decidedAt.getTime(), seq: 2 })
  await write(sql`/* insertTestAgedCurrentPassEvidence:version */
    INSERT INTO post_moderation_versions (id, post_id, content_sha256, policy_revision)
    SELECT ${versionId}::uuid, id, llm_moderation_content_sha256, '2026-09-09.1'
    FROM posts WHERE id = ${postId}`)
  await write(sql`/* insertTestAgedCurrentPassEvidence:dispositions */
    INSERT INTO post_moderation_dispositions
      (id, version_id, source, disposition, reason_code, evidence)
    VALUES
      (${openaiId}::uuid, ${versionId}::uuid, 'openai_omni', 'pass', 'provider_pass',
        '{"provider_input":"private"}'::jsonb),
      (${spamId}::uuid, ${versionId}::uuid, 'spam_detection', 'pass', 'provider_pass',
        '{"raw_signal":"private"}'::jsonb)`)
  return { versionId, dispositionIds: [openaiId, spamId] }
}

export async function getTestModerationPassEvidence(
  versionId: string,
): Promise<Array<{ disposition: string; evidence: Record<string, unknown> }>> {
  const { rows } = await read<{ disposition: string; evidence: Record<string, unknown> }>(sql`
    /* getTestModerationPassEvidence */
    SELECT disposition::text, evidence FROM post_moderation_dispositions
    WHERE version_id = ${versionId}::uuid ORDER BY id`)
  return rows
}

/** The valid state after a raw clearance partition has been retired. */
export async function seedTestRetiredClearanceProjection(
  postId: string,
  changedById: string,
): Promise<string> {
  const changeId = uuidv7({ msecs: Date.UTC(2023, 5, 1) })
  const changedAt = new Date('2023-06-01T00:00:00.000Z')
  await write(sql`/* seedTestRetiredClearanceProjection:identity */
    INSERT INTO retained_post_clearance_change_identities (id) VALUES (${changeId}::uuid)`)
  await write(sql`/* seedTestRetiredClearanceProjection:post */
    UPDATE posts SET latest_clearance_change_id = ${changeId}::uuid,
      clearance_changed_at = ${changedAt},
      clearance_changed_by_id = ${changedById}::uuid,
      clearance_public_reason_code = 'staff_rejected',
      clearance_private_note = 'staff-only',
      clearance_is_platform_override = TRUE,
      has_creation_moderation_bypass = TRUE,
      rejected_at = ${changedAt}, approved_at = NULL, in_review_at = NULL
    WHERE id = ${postId}::uuid`)
  return changeId
}

export async function projectTestClearanceHistoryChange(options: {
  postId: string
  changeId: string
  changedById: string
}): Promise<void> {
  await write(sql`/* projectTestClearanceHistoryChange */
    UPDATE posts post SET
      latest_clearance_change_id = change.id,
      clearance_changed_at = change.created_at,
      clearance_changed_by_id = change.changed_by_id,
      clearance_public_reason_code = change.public_reason_code,
      clearance_private_note = change.private_note,
      clearance_is_platform_override = change.is_platform_override,
      has_creation_moderation_bypass = TRUE,
      rejected_at = change.created_at,
      approved_at = NULL,
      in_review_at = NULL
    FROM post_clearance_changes change
    WHERE post.id = ${options.postId}
      AND change.id = ${options.changeId}::uuid
      AND change.changed_by_id = ${options.changedById}::uuid`)
}

export async function getTestClearanceProjection(postId: string): Promise<{
  latest_clearance_change_id: string | null
  clearance_reason: string | null
  clearance_status: string
  clearance_private_note: string | null
  has_creation_moderation_bypass: boolean
}> {
  const { rows } = await read<{
    latest_clearance_change_id: string | null
    clearance_reason: string | null
    clearance_status: string
    clearance_private_note: string | null
    has_creation_moderation_bypass: boolean
  }>(sql`/* getTestClearanceProjection */
    SELECT status.latest_clearance_change_id, status.clearance_reason,
      status.clearance_status, post.clearance_private_note,
      post.has_creation_moderation_bypass
    FROM view_post_clearance_status status
    JOIN posts post ON post.id = status.post_id
    WHERE status.post_id = ${postId}`)
  return rows[0]!
}

export async function clearTestClearanceIdentityPointer(postId: string): Promise<void> {
  await write(sql`/* clearTestClearanceIdentityPointer */
    UPDATE posts SET latest_clearance_change_id = NULL WHERE id = ${postId}`)
}

export async function insertTestOldTopicContentRevision(options: {
  topicId: string
  revisedById: string
  occurredAt: Date
}): Promise<string> {
  const id = uuidv7({ msecs: options.occurredAt.getTime() })
  await write(sql`/* insertTestOldTopicContentRevision */
    WITH revision AS (
      INSERT INTO topic_revisions (id, topic_id, revision_type, revised_by_id, changes)
      VALUES (${id}::uuid, ${options.topicId}, 'update', ${options.revisedById},
        '{"revised_by_roles":["administrator"],"changes":{"name":{"before":"old","after":"new"}}}'::jsonb)
      RETURNING topic_id, created_at, revised_by_id
    )
    UPDATE topics SET content_updated_at = revision.created_at,
      content_updated_by_id = revision.revised_by_id
    FROM revision WHERE topics.id = revision.topic_id`)
  return id
}

export async function getTestTopicRevisionIds(topicId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(sql`/* getTestTopicRevisionIds */
    SELECT id FROM topic_revisions WHERE topic_id = ${topicId} ORDER BY id`)
  return rows.map(row => row.id)
}

export async function insertTestTopicNonContentRevision(
  topicId: string,
  revisedById: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertTestTopicNonContentRevision */
    INSERT INTO topic_revisions (topic_id, revision_type, revised_by_id, changes)
    VALUES (${topicId}, 'update', ${revisedById},
      '{"revised_by_roles":["administrator"],"changes":{"is_noindexed":{"before":false,"after":true}}}'::jsonb)
    RETURNING id`)
  return rows[0]!.id
}

export async function getTestTopicContentProjection(topicId: string): Promise<{
  content_updated_at: Date | null
  content_updated_by_id: string | null
}> {
  const { rows } = await read<{
    content_updated_at: Date | null
    content_updated_by_id: string | null
  }>(sql`/* getTestTopicContentProjection */
    SELECT content_updated_at, content_updated_by_id FROM topics WHERE id = ${topicId}`)
  return rows[0]!
}

/** Probe the append-only revision contract with an owned row from a schema test. */
export async function updateTestTopicRevisionForGuard(id: string): Promise<void> {
  await write(sql`/* updateTestTopicRevisionForGuard */
    UPDATE topic_revisions SET revision_type = 'delete' WHERE id = ${id}`)
}

export async function deleteTestTopicRevisionForGuard(id: string): Promise<void> {
  await write(sql`/* deleteTestTopicRevisionForGuard */
    DELETE FROM topic_revisions WHERE id = ${id}`)
}
