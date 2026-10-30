import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'
import {
  insertAgentModerationRetentionBulk,
  insertAgentModerationRetentionRows,
  createAgentModerationRetentionSpecialRows,
} from './agent-moderation-retention-rows.mts'
import {
  insertAgentModerationRetentionReferenceNoise,
  insertAgentModerationRetentionReferences,
} from './agent-moderation-retention-references.mts'

export const AGENT_MODERATION_RETENTION_ROWS = 75_000 * 3 + 66 + 5_000
export const AGENT_MODERATION_RETENTION_RELEASED_NOISE = 20_000
export const AGENT_MODERATION_RETENTION_REFERENCE_NOISE = 20_000

const DAY_MS = 24 * 60 * 60 * 1_000
const BATCH_SIZE = 2_000
const RESTORE_PAGE_POSTS = 200
const SYSTEM_USER_ID = seedUuid(2_000_000, '37')
const BULK_AGENT_ID = seedUuid(2_000_000, '36')
const BULK_PROMPT_ID = seedUuid(2_000_000, '35')
const CATEGORY_SYSTEM_USER_ID = seedUuid(2_000_001, '37')
const CATEGORY_AGENT_ID = seedUuid(2_000_001, '36')
const CATEGORY_PROMPT_ID = seedUuid(2_000_001, '35')

/** Seed an aged backlog plus newest, referenced, and released-cohort keepers for retention plans. */
export async function seedAgentModerationRetention(): Promise<void> {
  const anchorMs = postSeedTimestampMs(0)
  const oldMs = anchorMs - 120 * DAY_MS
  const newMs = anchorMs - 100 * DAY_MS
  const bulkStartMs = oldMs - 5 * 60_000 + 100

  await seedRetentionIdentities(new Date(oldMs - DAY_MS))
  await insertModerationRows(oldMs, newMs, bulkStartMs, 75_000)
  await seedDeletedLiveLookupTail()
  await insertAgentModerationRetentionReferenceNoise(
    bulkStartMs,
    AGENT_MODERATION_RETENTION_REFERENCE_NOISE,
  )
  const reference = createAgentModerationRetentionSpecialRows(
    oldMs,
    newMs,
    BULK_AGENT_ID,
    BULK_PROMPT_ID,
    CATEGORY_AGENT_ID,
    CATEGORY_PROMPT_ID,
  ).find(row => row.postId === seedUuid(40, '05'))
  if (!reference) throw new Error('Missing referenced agent moderation EXPLAIN row')
  await insertAgentModerationRetentionReferences(reference)

  const releasedDay = new Date(oldMs).toISOString().slice(0, 10)
  await write(
    `/* seedAgentModerationRetentionReleasedCohort */
     SELECT fn_release_moderation_transparency_daily_rollup(
       $1::date, NULL::uuid, 'automated_moderation', 'agent_moderation', $2::timestamptz
     )`,
    [releasedDay, new Date(anchorMs - 2 * DAY_MS)],
  )
  await seedReleasedCommunityNoise(releasedDay, new Date(oldMs))
}

/** Force a live predecessor lookup past a large deleted tail on one seeded post. */
async function seedDeletedLiveLookupTail(): Promise<void> {
  const postId = seedUuid(1, '05')
  await write(
    `/* seedAgentModerationRetentionDeletedLookupTail */
     INSERT INTO agent_moderations
       (post_id, input_sha256, prompt_id, agent_id, results, is_flagged, deleted_at)
     SELECT $1::uuid, decode(lpad(to_hex(sequence + 1000), 64, '0'), 'hex'),
       $2::uuid, $3::uuid, '{}'::jsonb, FALSE, CURRENT_TIMESTAMP
     FROM generate_series(1, 5000) AS sequence
     ON CONFLICT (post_id, input_sha256, prompt_id) DO NOTHING`,
    [postId, BULK_PROMPT_ID, BULK_AGENT_ID],
  )
}

/** Restore only rows that the first two bounded raw pages can delete after EXPLAIN capture. */
export async function restoreAgentModerationRetentionPages(): Promise<void> {
  const anchorMs = postSeedTimestampMs(0)
  const oldMs = anchorMs - 120 * DAY_MS
  const newMs = anchorMs - 100 * DAY_MS
  const bulkStartMs = oldMs - 5 * 60_000 + 100
  await insertModerationRows(oldMs, newMs, bulkStartMs, RESTORE_PAGE_POSTS)
  // A captured page can leave an existing source blocked. Re-arm only this finite
  // fixture window so every replay measures an actual due-page deletion.
  const postIds = Array.from({ length: RESTORE_PAGE_POSTS }, (_, index) =>
    seedUuid(100 + index, '05'),
  )
  await write(
    `/* restoreAgentModerationRetentionDuePages */
     UPDATE agent_moderations
     SET retention_due_at = uuid_extract_timestamp(id) + INTERVAL '90 days',
         retention_blocked_reason = NULL
     WHERE post_id = ANY($1::uuid[])
       AND id < $2::uuid
       AND (retention_due_at IS NULL OR retention_blocked_reason IS NOT NULL)`,
    [postIds, seedUuidAtTimestamp(newMs, 0)],
  )
}

async function seedRetentionIdentities(bulkAgentDeletedAt: Date): Promise<void> {
  await write(
    `/* seedAgentModerationRetentionIdentities */
     INSERT INTO users (id, username, platform_account_kind)
     VALUES ($1::uuid, 'explain-agent-retention-bulk-system', 'system'),
            ($2::uuid, 'explain-agent-retention-category-system', 'system')
     ON CONFLICT (id) DO NOTHING`,
    [SYSTEM_USER_ID, CATEGORY_SYSTEM_USER_ID],
  )
  await write(
    `/* seedAgentModerationRetentionIdentities */
     INSERT INTO agents (id, system_user_id, agent_type, deleted_at)
     VALUES ($1::uuid, $2::uuid, 'moderator', $3::timestamptz),
            ($4::uuid, $5::uuid, 'moderator', NULL)
     ON CONFLICT (id) DO NOTHING`,
    [BULK_AGENT_ID, SYSTEM_USER_ID, bulkAgentDeletedAt, CATEGORY_AGENT_ID, CATEGORY_SYSTEM_USER_ID],
  )
  await write(
    `/* seedAgentModerationRetentionIdentities */
     INSERT INTO agent_prompts (id, agent_id, prompt, model_name, model_provider)
     VALUES ($1::uuid, $2::uuid, 'EXPLAIN retention bulk prompt', 'gpt-5.4-nano', 'openai'),
            ($3::uuid, $4::uuid, 'EXPLAIN retention category prompt', 'gpt-5.4-nano', 'openai')
     ON CONFLICT (id) DO NOTHING`,
    [BULK_PROMPT_ID, BULK_AGENT_ID, CATEGORY_PROMPT_ID, CATEGORY_AGENT_ID],
  )
}

async function insertModerationRows(
  oldMs: number,
  newMs: number,
  bulkStartMs: number,
  postCount: number,
): Promise<void> {
  const specialRows = createAgentModerationRetentionSpecialRows(
    oldMs,
    newMs,
    BULK_AGENT_ID,
    BULK_PROMPT_ID,
    CATEGORY_AGENT_ID,
    CATEGORY_PROMPT_ID,
  )
  await insertAgentModerationRetentionRows(specialRows)
  await insertAgentModerationRetentionBulk(
    bulkStartMs,
    newMs,
    postCount,
    BULK_AGENT_ID,
    BULK_PROMPT_ID,
  )
}

async function seedReleasedCommunityNoise(day: string, occurredAt: Date): Promise<void> {
  const communityIds = Array.from(
    { length: AGENT_MODERATION_RETENTION_RELEASED_NOISE },
    (_, index) => seedUuid(index, 'f5'),
  )
  for (let start = 0; start < communityIds.length; start += BATCH_SIZE) {
    const batch = communityIds.slice(start, start + BATCH_SIZE)
    // no-mistakes-disable-next-line query-reached-per-item: fixed rollup noise is inserted in bounded batches below PostgreSQL bind limits
    await write(
      `/* seedAgentModerationRetentionReleasedNoise */
       INSERT INTO moderation_transparency_released_daily_rollups
         (day, community_id, metric, category, count, latest_occurred_at)
       SELECT $1::date, community_id, 'automated_moderation', 'agent_moderation', 20, $2::timestamptz
       FROM unnest($3::uuid[]) AS input(community_id)
       ON CONFLICT ON CONSTRAINT moderation_transparency_released_daily_rollups_key DO NOTHING`,
      [day, occurredAt, batch],
    )
  }
}
