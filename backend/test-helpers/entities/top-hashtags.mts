import { read, write } from '@data-stores/psql'

export type PostHashtagSourceForTest = {
  alias: string
  authored_token: string
  source: 'title' | 'markdown' | 'explicit'
}

export async function createTopHashtagAliasForTest(
  topicId: string,
  alias: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* createTopHashtagAliasForTest */
      INSERT INTO topic_aliases (topic_id, alias)
      VALUES ($1, $2)
      RETURNING id`,
    [topicId, alias],
  )
  return rows[0]!.id
}

export async function getPostHashtagSourcesForTest(
  postId: string,
): Promise<PostHashtagSourceForTest[]> {
  const { rows } = await read<PostHashtagSourceForTest>(
    `/* getPostHashtagSourcesForTest */
      SELECT alias.alias, source.authored_token, source.source
      FROM post_topic_alias_sources source
      JOIN topic_aliases alias ON alias.id = source.topic_alias_id
      WHERE source.post_id = $1
      ORDER BY source.source, alias.alias`,
    [postId],
  )
  return rows
}

export async function getPostHashtagSourceContributorIdsForTest(postId: string): Promise<string[]> {
  const { rows } = await read<{ contributor_id: string }>(
    `/* getPostHashtagSourceContributorIdsForTest */
      SELECT contributor_id
      FROM post_topic_alias_sources
      WHERE post_id = $1
      ORDER BY contributor_id`,
    [postId],
  )
  return rows.map(row => row.contributor_id)
}

export async function createTopHashtagPostSourceForTest({
  postId,
  topicAliasId,
  userId,
  authoredToken,
}: {
  postId: string
  topicAliasId: string
  userId: string
  authoredToken: string
}): Promise<void> {
  await write(
    `/* createTopHashtagPostSourceForTest source */
    INSERT INTO post_topic_alias_sources (post_id, topic_alias_id, contributor_id, source, authored_token)
    VALUES ($1, $2, $3, 'explicit', $4)`,
    [postId, topicAliasId, userId, authoredToken],
  )
  await write(
    `/* createTopHashtagPostSourceForTest relation */
    INSERT INTO relation__post__category__topic_alias (
      subject_id, object_id, created_by_id, votes_score_up, votes_count_up
    ) VALUES ($1, $2, $3, 1, 1)`,
    [postId, topicAliasId, userId],
  )
}

export async function createActivePostTopicAliasRelationForTest({
  postId,
  topicAliasId,
  userId,
}: {
  postId: string
  topicAliasId: string
  userId: string
}): Promise<void> {
  await write(
    `/* createActivePostTopicAliasRelationForTest */
    INSERT INTO relation__post__category__topic_alias (
      subject_id, object_id, created_by_id, votes_score_up, votes_count_up
    ) VALUES ($1, $2, $3, 1, 1)`,
    [postId, topicAliasId, userId],
  )
}

export async function archivePostForTopHashtagTest(postId: string, userId: string): Promise<void> {
  await write(
    `/* archivePostForTopHashtagTest */
    UPDATE posts SET archived_at = CURRENT_TIMESTAMP, archived_by_id = $2 WHERE id = $1`,
    [postId, userId],
  )
}

export async function setTopHashtagPostRelationScoreForTest({
  postId,
  topicAliasId,
  score,
}: {
  postId: string
  topicAliasId: string
  score: number
}): Promise<void> {
  await write(
    `/* setTopHashtagPostRelationScoreForTest */
      UPDATE relation__post__category__topic_alias
      SET votes_score_up = $3::BIGINT,
          votes_score_down = 0,
          votes_count_up = CASE WHEN $3::BIGINT > 0 THEN 1 ELSE 0 END,
          votes_count_down = 0
      WHERE subject_id = $1 AND object_id = $2`,
    [postId, topicAliasId, score],
  )
}

export async function createTopHashtagRssSourceForTest({
  rssFeedItemId,
  topicAliasId,
  authoredToken,
}: {
  rssFeedItemId: string
  topicAliasId: string
  authoredToken: string
}): Promise<void> {
  await write(
    `/* createTopHashtagRssSourceForTest category */
      INSERT INTO rss_feed_item_categories (
        rss_feed_item_id, category_text, topic_alias_id
      ) VALUES ($1, $2, $3)`,
    [rssFeedItemId, authoredToken, topicAliasId],
  )
  await write(
    `/* createTopHashtagRssSourceForTest relation */
      INSERT INTO relation__rss_feed_item__category__topic_alias (
        subject_id, object_id, votes_score_up, votes_count_up
      ) VALUES ($1, $2, 1, 1)`,
    [rssFeedItemId, topicAliasId],
  )
}

export async function addTopHashtagRssFeedSourceForTest({
  rssFeedId,
  rssFeedItemId,
}: {
  rssFeedId: string
  rssFeedItemId: string
}): Promise<void> {
  await write(
    `/* addTopHashtagRssFeedSourceForTest */
      INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
      VALUES ($1, $2, (SELECT published_at FROM rss_feed_items WHERE id = $2))
      ON CONFLICT DO NOTHING`,
    [rssFeedId, rssFeedItemId],
  )
}
