import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

export const POST_MODERATION_RETENTION_SEED_COUNT = 10_000
export const POST_MODERATION_RETENTION_PAGE_SIZE = 100
const DAY_MS = 86_400_000
const VERSION_TIMESTAMP_MS = postSeedTimestampMs(0) - 120 * DAY_MS
const DISPOSITION_TIMESTAMP_MS = VERSION_TIMESTAMP_MS + 20_000

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
