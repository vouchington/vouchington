/**
 * RSS-feed-owning-topic publisher-type/vote-score primitives split out of rss-feeds.mts (concern:
 * topic-level scoring, as opposed to rss-feeds.mts's feed CRUD). Re-exported by rss-feeds.mts so
 * `@voucha/test-helpers` and `@voucha/test-helpers/entities/rss-feeds` consumers resolve unchanged.
 */

import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function addRssFeedTopicPublisherType(
  topicId: string,
  publisherTypeTopicId: string,
): Promise<void> {
  await addRssFeedTopicPublisherTypeWithScore(topicId, publisherTypeTopicId, 1)
}

export async function addRssFeedTopicPublisherTypeWithScore(
  topicId: string,
  publisherTypeTopicId: string,
  score: number,
): Promise<void> {
  await write(sql`/* addRssFeedTopicPublisherType */
    INSERT INTO relation__topic__publisher_type__topic (
      subject_id,
      object_id,
      votes_count_up,
      votes_score_up
    )
    VALUES (${topicId}, ${publisherTypeTopicId}, ${score}, ${score})
  `)
}

/**
 * Directly set votes_score_up and votes_score_down on the topic that owns
 * the given RSS feed, allowing tests to exercise score-based auto-suppression.
 * votes_score_net = votes_score_up - votes_score_down (generated column).
 */
export async function setRssFeedOwningTopicVoteScore(
  feedId: string,
  scoreUp: number,
  scoreDown: number,
): Promise<void> {
  await write(sql`
    UPDATE topics
    SET votes_score_up = ${scoreUp}, votes_score_down = ${scoreDown}
    WHERE id = (SELECT topic_id FROM rss_feeds WHERE id = ${feedId})
  `)
}
