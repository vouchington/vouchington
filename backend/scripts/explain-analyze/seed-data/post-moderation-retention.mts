import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

export const POST_MODERATION_RETENTION_SEED_COUNT = 10_000
export const POST_MODERATION_RETENTION_SUCCESSOR_COUNT = 500
export const POST_MODERATION_RETENTION_PAGE_SIZE = 100
const DAY_MS = 86_400_000
const VERSION_TIMESTAMP_MS = postSeedTimestampMs(0) - 120 * DAY_MS
const DISPOSITION_TIMESTAMP_MS = VERSION_TIMESTAMP_MS + 20_000
const SUCCESSOR_TIMESTAMP_MS = postSeedTimestampMs(0) - 100 * DAY_MS

export function postModerationRetentionWindow() {
  return {
    now: new Date(postSeedTimestampMs(0)),
    lowerBoundDate: new Date(VERSION_TIMESTAMP_MS - 1),
  }
}

/** A dense old UUIDv7 range whose versions have no successor and whose pass evidence is stale. */
export async function seedPostModerationRetention(): Promise<void> {
  const postIds = Array.from({ length: POST_MODERATION_RETENTION_SEED_COUNT }, (_, index) =>
    seedUuid(index, '05'),
  )
  const versionIds = postIds.map((_, index) =>
    seedUuidAtTimestamp(VERSION_TIMESTAMP_MS + index, index),
  )
  const dispositionIds = postIds.map((_, index) =>
    seedUuidAtTimestamp(DISPOSITION_TIMESTAMP_MS + index, index),
  )
  await write(
    `/* seedPostModerationRetention.versions */
     INSERT INTO post_moderation_versions (id, post_id, content_sha256, policy_revision)
     SELECT input.version_id, input.post_id, decode(repeat('ab', 32), 'hex'), $3
     FROM unnest($1::uuid[], $2::uuid[]) AS input(version_id, post_id)
     JOIN posts post ON post.id = input.post_id
     ON CONFLICT DO NOTHING`,
    [versionIds, postIds, 'explain-retention'],
  )
  await write(
    `/* seedPostModerationRetention.dispositions */
     INSERT INTO post_moderation_dispositions
       (id, version_id, source, disposition, reason_code, evidence)
     SELECT input.disposition_id, input.version_id, 'openai_omni', 'pass', 'seed_pass',
       '{"stale":true}'::jsonb
     FROM unnest($1::uuid[], $2::uuid[]) AS input(disposition_id, version_id)
     JOIN post_moderation_versions version ON version.id = input.version_id
     ON CONFLICT DO NOTHING`,
    [dispositionIds, versionIds],
  )
  await write(
    '/* seedPostModerationRetention.analyze */ ANALYZE post_moderation_versions, post_moderation_dispositions, posts',
  )
}

/** Add aged same-post successors after the idle keeper gate has run. */
export async function seedPostModerationRetentionSuccessors(): Promise<void> {
  const postIds = Array.from({ length: POST_MODERATION_RETENTION_SUCCESSOR_COUNT }, (_, index) =>
    seedUuid(index, '05'),
  )
  const successorIds = postIds.map((_, index) =>
    seedUuidAtTimestamp(SUCCESSOR_TIMESTAMP_MS + index, index),
  )
  await write(
    `/* seedPostModerationRetentionSuccessors */
     INSERT INTO post_moderation_versions (id, post_id, content_sha256, policy_revision)
     SELECT input.successor_id, input.post_id, decode(repeat('cd', 32), 'hex'), 'explain-retention'
     FROM unnest($1::uuid[], $2::uuid[]) AS input(successor_id, post_id)
     JOIN posts post ON post.id = input.post_id
     ON CONFLICT DO NOTHING`,
    [successorIds, postIds],
  )
  await write(
    '/* seedPostModerationRetentionSuccessors.analyze */ ANALYZE post_moderation_versions, post_moderation_dispositions, posts',
  )
}

/** Shape a large dormant evidence cohort, then rearm a bounded due subset for its page gate. */
export async function setSeedPostModerationPassEvidenceDormant(): Promise<void> {
  const versionIds = Array.from({ length: POST_MODERATION_RETENTION_SEED_COUNT }, (_, index) =>
    seedUuidAtTimestamp(VERSION_TIMESTAMP_MS + index, index),
  )
  await write(
    `/* setSeedPostModerationPassEvidenceDormant */
     UPDATE post_moderation_dispositions SET retention_due_at = NULL
     WHERE version_id = ANY($1::uuid[]) AND disposition = 'pass'
       AND source <> 'staff' AND evidence <> '{}'::jsonb`,
    [versionIds],
  )
  await write(
    `/* markSeedPostModerationPassHostsDormant */
     UPDATE post_moderation_versions SET retention_hash_blocked_at = CURRENT_TIMESTAMP
     WHERE id = ANY($1::uuid[])`,
    [versionIds],
  )
  await write(
    '/* analyzeDormantPostModerationPassEvidence */ VACUUM (ANALYZE) post_moderation_dispositions, post_moderation_versions',
  )
}

export async function rearmSeedPostModerationPassEvidence(): Promise<void> {
  const dispositionIds = Array.from({ length: 1_000 }, (_, index) =>
    seedUuidAtTimestamp(DISPOSITION_TIMESTAMP_MS + index, index),
  )
  await write(
    `/* rearmSeedPostModerationPassEvidence */
     UPDATE post_moderation_dispositions SET retention_due_at = uuid_extract_timestamp(id)
     WHERE id = ANY($1::uuid[]) AND disposition = 'pass'
       AND source <> 'staff' AND evidence <> '{}'::jsonb`,
    [dispositionIds],
  )
  await write('/* analyzeRearmedPostModerationPassEvidence */ ANALYZE post_moderation_dispositions')
}
