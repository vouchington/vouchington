import { beginTransaction } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

export const SELECTIVE_TOPIC_ID = seedUuid(1, 'ee')
export const SELECTIVE_IN_WINDOW_COUNT = 4
export const SELECTIVE_OUT_OF_WINDOW_COUNT = 4

const IN_WINDOW_INDEX_START = 910_000
const OUT_OF_WINDOW_INDEX_START = 910_100
const DAY_MS = 24 * 60 * 60 * 1000
const DAYS_BEFORE_WINDOW = 40

/**
 * A few bank-account, pending, topic-linked data points. Half sit inside the
 * 30-day page and half are older, so a selective plan has matches to read
 * and older rows it must not walk.
 */
export async function seedSelectiveDataPointMatches(createdById: string): Promise<void> {
  const postIds = selectivePostIds()
  await using transaction = await beginTransaction()
  const query = transaction
  await query(
    `/* seedSelectiveDataPointMatches:topic */ INSERT INTO topics (
       id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
     VALUES ($1, 'Selective data point', 'selective-data-point-search', 'system',
       decode(repeat('ab', 32), 'hex'))`,
    [SELECTIVE_TOPIC_ID],
  )
  await query(
    `/* seedSelectiveDataPointMatches:posts */ INSERT INTO posts (
       id, created_via, post_type, title, created_by_id, approved_at,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256,
       data_point_vertical, structured_data, votes_score_up)
     SELECT id, 'system', 'data_point', 'Selective data point', $2, CURRENT_TIMESTAMP,
       decode(repeat('ab', 32), 'hex'), decode(repeat('ab', 32), 'hex'),
       'bank_account', '{"result":"pending","credit_score_range":"800-850"}'::jsonb, 1
     FROM UNNEST($1::uuid[]) AS seed(id)`,
    [postIds, createdById],
  )
  await query(
    `/* seedSelectiveDataPointMatches:links */ INSERT INTO post_data_point_topics (post_id, topic_id)
     SELECT id, $2::uuid FROM UNNEST($1::uuid[]) AS seed(id)`,
    [postIds, SELECTIVE_TOPIC_ID],
  )
  await transaction.commit()
}

export async function deleteSelectiveDataPointMatches(): Promise<void> {
  await using transaction = await beginTransaction()
  const query = transaction
  await query(
    `/* deleteSelectiveDataPointMatches:posts */ DELETE FROM posts WHERE id = ANY($1::uuid[])`,
    [selectivePostIds()],
  )
  await query(
    `/* deleteSelectiveDataPointMatches:topic */ DELETE FROM topics WHERE id = $1::uuid`,
    [SELECTIVE_TOPIC_ID],
  )
  await transaction.commit()
}

function selectivePostIds(): string[] {
  const inWindowMs = postSeedTimestampMs(0) - DAY_MS
  const outOfWindowMs = postSeedTimestampMs(0) - DAYS_BEFORE_WINDOW * DAY_MS
  return [
    ...idsAt(inWindowMs, IN_WINDOW_INDEX_START, SELECTIVE_IN_WINDOW_COUNT),
    ...idsAt(outOfWindowMs, OUT_OF_WINDOW_INDEX_START, SELECTIVE_OUT_OF_WINDOW_COUNT),
  ]
}

function idsAt(timestampMs: number, indexStart: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    seedUuidAtTimestamp(timestampMs, indexStart + index),
  )
}
