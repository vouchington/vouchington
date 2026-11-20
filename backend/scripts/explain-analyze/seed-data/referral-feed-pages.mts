import { write } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

const BASE = Date.UTC(1971, 5, 1)
const COUNT = 1001
const hostnameId = seedUuidAtTimestamp(BASE, 400_000)
const urlId = seedUuidAtTimestamp(BASE, 400_001)
const topicId = (index: number) => seedUuidAtTimestamp(BASE, 300_000 + index)
export const referralFeedPageId = (index: number) =>
  seedUuidAtTimestamp(BASE + COUNT - index, 200_000 + index)
export const REFERRAL_FEED_PAGE_START = seedUuidAtTimestamp(BASE + COUNT + 1, 0)

/** The 1000-row maximum inspection window has one older visible row beyond its tail. */
export async function seedReferralFeedPages(): Promise<void> {
  await write(
    `/* seedReferralFeedPageHostname */ INSERT INTO url_hostnames (id, hostname)
    VALUES ($1, 'referral-feed-window.explain.test') ON CONFLICT (id) DO NOTHING`,
    [hostnameId],
  )
  await write(
    `/* seedReferralFeedPageUrl */ INSERT INTO urls
    (id, url, hostname_id, pathname, search_params)
    VALUES ($1, 'https://referral-feed-window.explain.test/link', $2, '/link', '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING`,
    [urlId, hostnameId],
  )
  const rows = Array.from({ length: COUNT }, (_, index) => ({
    id: referralFeedPageId(index),
    topic_id: topicId(index),
    user_id: seedUuid(index === 0 || index === 40 || index === 1000 ? 2 : 19999, '01'),
  }))
  await write(
    `/* seedReferralFeedPageTopics */ INSERT INTO topics
    (id, topic_type, name, slug, created_via, gemini_embedding_2_content_sha256)
    SELECT topic_id, 'referral_program', 'Referral walk ' || topic_id,
      'referral-walk-' || topic_id, 'system', decode(repeat('c4', 32), 'hex')
    FROM jsonb_to_recordset($1::jsonb) AS input(topic_id uuid)
    ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(rows)],
  )
  await write(
    `/* seedReferralFeedPagePrograms */ INSERT INTO referral_program_topics
    (topic_id, enabled_at) SELECT id, CURRENT_TIMESTAMP FROM unnest($1::uuid[]) AS input(id)
    ON CONFLICT (topic_id) DO NOTHING`,
    [rows.map(row => row.topic_id)],
  )
  await write(
    `/* seedReferralFeedPageLinks */ INSERT INTO user_referral_program_links
    (id, user_id, referral_program_topic_id, url_id, activated_at, created_via)
    SELECT id, user_id, topic_id, $2, CURRENT_TIMESTAMP, 'system'
    FROM jsonb_to_recordset($1::jsonb) AS input(id uuid, user_id uuid, topic_id uuid)
    ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(rows), urlId],
  )
  await write(`/* seedReferralFeedPagesAnalyze */ ANALYZE user_referral_program_links,
    referral_program_topics, topics, urls, url_hostnames`)
}

export async function cleanupReferralFeedPages(): Promise<void> {
  await write(
    `/* cleanupReferralFeedPageLinks */ DELETE FROM user_referral_program_links
    WHERE id = ANY($1::uuid[])`,
    [Array.from({ length: COUNT }, (_, index) => referralFeedPageId(index))],
  )
  await write(`/* cleanupReferralFeedPageUrl */ DELETE FROM urls WHERE id = $1`, [urlId])
  await write(`/* cleanupReferralFeedPageHostname */ DELETE FROM url_hostnames WHERE id = $1`, [
    hostnameId,
  ])
  const topicIds = Array.from({ length: COUNT }, (_, index) => topicId(index))
  await write(`/* cleanupReferralFeedPageTopics */ DELETE FROM topics WHERE id = ANY($1::uuid[])`, [
    topicIds,
  ])
  await write(
    `/* cleanupReferralFeedPageTopicIdentities */ DELETE FROM retained_topic_identities
    WHERE id = ANY($1::uuid[])`,
    [topicIds],
  )
  await write(`/* cleanupReferralFeedPagesAnalyze */ ANALYZE user_referral_program_links,
    referral_program_topics, topics, urls, url_hostnames`)
}
