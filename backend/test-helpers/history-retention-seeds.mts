import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { createTestExpiryWindow } from './data.mts'

/** Own a narrow future UUIDv7 range, with day 15 for exact 24-month boundaries. */
export function createHistoryRetentionWindow(spanMs: number) {
  const base = new Date(createTestExpiryWindow().firstEligibleDate)
  base.setUTCDate(15)
  return {
    base,
    lowerBoundDate: new Date(base.getTime() - 1),
    upperBoundDate: new Date(base.getTime() + spanMs),
  }
}

/** Synthetic UUIDv7 instants isolate retention fixtures from the shared dirty database. */
export async function insertConfigHistoryAt(
  key: string,
  at: Date,
  changes: Record<string, unknown> = {},
): Promise<string> {
  const id = uuidv7({ msecs: at.getTime() })
  await write(sql`/* insertConfigHistoryAt */
    INSERT INTO dynamic_configuration_revisions (id, configuration_key, revision_type, changes)
    VALUES (${id}, ${key}, 'update', ${JSON.stringify(changes)}::jsonb)`)
  return id
}

export async function insertConfigHistoryBatch(
  key: string,
  at: Date,
  count: number,
): Promise<string[]> {
  const ids = Array.from({ length: count }, (_, index) => uuidv7({ msecs: at.getTime() + index }))
  await write(sql`/* insertConfigHistoryBatch */
    INSERT INTO dynamic_configuration_revisions (id, configuration_key, revision_type, changes)
    SELECT source.id, ${key}, 'update', '{}'::jsonb
    FROM unnest(${ids}::uuid[]) AS source(id)`)
  return ids
}

export async function insertRssSettingHistoryAt(
  feedId: string,
  at: Date,
  enabled: boolean,
  kind: 'enablement' | 'discoverability' = 'enablement',
): Promise<string> {
  const id = uuidv7({ msecs: at.getTime() })
  await write(sql`/* insertRssSettingHistoryAt */
    INSERT INTO rss_feed_setting_changes (id, rss_feed_id, change_type, is_enabled)
    VALUES (${id}, ${feedId}, ${kind}, ${enabled})`)
  return id
}

export async function insertPromptHistoryAt(
  communityId: string,
  promptId: string,
  at: Date,
): Promise<string> {
  const id = uuidv7({ msecs: at.getTime() })
  await write(sql`/* insertPromptHistoryAt */
    INSERT INTO community_agent_prompt_revisions
      (id, community_id, community_agent_prompt_id, revision_type, changes)
    VALUES (${id}, ${communityId}, ${promptId}, 'updated', '{}'::jsonb)`)
  return id
}

export async function insertPromptHistoryBatch(
  communityId: string,
  promptId: string,
  at: Date,
  count: number,
): Promise<string[]> {
  const ids = Array.from({ length: count }, (_, index) => uuidv7({ msecs: at.getTime() + index }))
  await write(sql`/* insertPromptHistoryBatch */
    INSERT INTO community_agent_prompt_revisions
      (id, community_id, community_agent_prompt_id, revision_type, changes)
    SELECT source.id, ${communityId}, ${promptId}, 'updated', '{}'::jsonb
    FROM unnest(${ids}::uuid[]) AS source(id)`)
  return ids
}

export async function insertFollowedImportAt(
  userId: string,
  topicId: string,
  createdAt: Date,
  followedAt: Date,
): Promise<string> {
  const id = uuidv7({ msecs: createdAt.getTime() })
  await write(sql`/* insertFollowedImportAt */
    INSERT INTO user_import_requests
      (id, user_id, entity_type, topic_id, input_value, followed_at)
    VALUES (${id}, ${userId}, 'topic', ${topicId}, ${`retention-topic-${id}`}, ${followedAt})`)
  return id
}

export async function insertPendingImportAt(
  userId: string,
  recommendationPostId: string,
  createdAt: Date,
): Promise<string> {
  const id = uuidv7({ msecs: createdAt.getTime() })
  await write(sql`/* insertPendingImportAt */
    INSERT INTO user_import_requests
      (id, user_id, entity_type, topic_recommendation_post_id, input_value)
    VALUES (${id}, ${userId}, 'topic', ${recommendationPostId}, ${`pending-retention-${id}`})`)
  return id
}

export async function insertTopicRecommendationForRetention(postId: string): Promise<void> {
  await write(sql`/* insertTopicRecommendationForRetention */
    INSERT INTO post_topic_recommendations (post_id, topic_title, topic_slug)
    VALUES (${postId}, ${`Retention ${postId}`}, ${`retention-${postId}`})`)
}

export async function insertReferralAttributionAt(
  referrerId: string,
  userId: string,
  createdAt: Date,
): Promise<string> {
  const id = uuidv7({ msecs: createdAt.getTime() })
  await write(sql`/* insertReferralAttributionAt */
    INSERT INTO session_referral_attributions
      (id, session_id, referrer_user_id, user_id, landing_url, utm_source, utm_medium)
    VALUES (${id}, ${randomUUID()}, ${referrerId}, ${userId},
      'https://example.com/retention', 'newsletter', 'email')`)
  return id
}
