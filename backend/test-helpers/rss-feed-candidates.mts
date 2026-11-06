import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getTestRssFeedUrlHostnameId } from './entities/rss-feed-items.mts'
import { registerTestRssCategoryIdentity } from './entities/rss-category-identities.mts'

type CandidateRow = {
  story_id: string | null
  sort_at: Date
  is_official_for_story: boolean
  votes_score_sort: number
  votes_score_net: number
}

export async function readCandidateFixture(itemId: string, feedIds: string[]) {
  const candidateQuery = write<CandidateRow>(sql`/* readCandidateFixture item */
    SELECT story_id, sort_at, is_official_for_story, votes_score_sort, votes_score_net
    FROM rss_feed_item_feed_candidates WHERE id = ${itemId} LIMIT 1`)
  const sourcesQuery = write<{
    rss_feed_id: string
    item_sort_at: Date | null
  }>(sql`/* readCandidateFixture sources */
    SELECT rss_feed_id, item_sort_at FROM rss_feed_item_sources
    WHERE rss_feed_item_id = ${itemId} AND rss_feed_id = ANY(${feedIds}::uuid[])
    ORDER BY rss_feed_id LIMIT 10`)
  const topicsQuery = write<{
    topic_id: string
    sort_at: Date | null
    membership_count: string
  }>(sql`/* readCandidateFixture topics */
    SELECT topic_id, sort_at, membership_count FROM rss_feed_item_topic_candidates
    WHERE rss_feed_item_id = ${itemId} ORDER BY topic_id LIMIT 10`)
  const feedsQuery = write<{
    id: string
    latest_item_sort_at: Date | null
  }>(sql`/* readCandidateFixture feeds */
    SELECT id, latest_item_sort_at FROM rss_feeds
    WHERE id = ANY(${feedIds}::uuid[]) ORDER BY id LIMIT 10`)
  const [candidate, sources, topics, feeds] = await Promise.all([
    candidateQuery,
    sourcesQuery,
    topicsQuery,
    feedsQuery,
  ])
  return {
    candidate: candidate.rows[0],
    sources: sources.rows,
    topics: topics.rows,
    feeds: feeds.rows,
  }
}

export async function addCandidateSource(itemId: string, feedId: string) {
  await write(sql`/* addCandidateSource */
    INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
    SELECT ${feedId}, id, published_at FROM rss_feed_items WHERE id = ${itemId}`)
}

export async function setCandidatePublication(itemId: string, date: Date) {
  await write(sql`/* setCandidatePublication */ UPDATE rss_feed_items
    SET data = jsonb_set(data, '{isoDate}', to_jsonb(${date.toISOString()}::text))
    WHERE id = ${itemId}`)
}

export async function setCandidateOfficial(storyId: string, itemId: string | null) {
  await write(sql`/* setCandidateOfficial */ UPDATE stories
    SET official_rss_feed_item_id = ${itemId} WHERE id = ${storyId}`)
}

export async function deleteCandidateItem(itemId: string) {
  await write(sql`/* deleteCandidateItem */ DELETE FROM rss_feed_items WHERE id = ${itemId}`)
}

export async function setCandidateHidden(itemId: string) {
  await write(sql`/* setCandidateHidden */ UPDATE rss_feed_items
    SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${itemId}`)
}

export async function setCandidateTopicClaim(itemId: string, topicId: string, score: number) {
  await write(sql`/* setCandidateTopicClaim */
    INSERT INTO relation__rss_feed_item__category__topic (subject_id, object_id, votes_score_up)
    VALUES (${itemId}, ${topicId}, ${score})
    ON CONFLICT (subject_id, object_id) DO UPDATE SET votes_score_up = EXCLUDED.votes_score_up`)
}

export async function setCandidateAliasClaim(itemId: string, aliasId: string, score: number) {
  await write(sql`/* setCandidateAliasClaim */
    INSERT INTO relation__rss_feed_item__category__topic_alias (subject_id, object_id, votes_score_up)
    VALUES (${itemId}, ${aliasId}, ${score})
    ON CONFLICT (subject_id, object_id) DO UPDATE SET votes_score_up = EXCLUDED.votes_score_up`)
}

export async function setCandidateVotes(itemId: string, up: number, down: number) {
  await write(sql`/* setCandidateVotes */ UPDATE rss_feed_items
    SET votes_score_up = ${up}, votes_score_down = ${down} WHERE id = ${itemId}`)
}

export async function insertCandidateInOneStatement(
  feedId: string,
  topicId: string,
): Promise<string> {
  const hostnameId = await getTestRssFeedUrlHostnameId(feedId)
  const categoryText = `candidate-${topicId}`
  const categoryId = await registerTestRssCategoryIdentity(categoryText)
  const { rows } = await write<{ id: string }>(sql`/* insertCandidateInOneStatement */
    WITH identity AS (
      INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
      VALUES (${hostnameId}, uuidv7()::text) RETURNING id
    ), item AS (
      INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256)
      SELECT id, (SELECT rss_feed_url_id FROM rss_feeds WHERE id = ${feedId}),
        '{"title":"Atomic candidate fixture"}'::jsonb, decode(repeat('00',32),'hex')
      FROM identity RETURNING id, published_at
    ), source AS (
      INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
      SELECT ${feedId}, id, published_at FROM item RETURNING rss_feed_item_id
    )
    INSERT INTO rss_feed_item_categories
      (rss_feed_item_id, category_identity_id, category_text, topic_id)
    SELECT id, ${categoryId}, ${categoryText}, ${topicId} FROM item
    RETURNING rss_feed_item_id AS id`)
  return rows[0]!.id
}
