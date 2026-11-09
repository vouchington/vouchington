import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { buildStablePostHotRankExpression } from '@services/posts/search/stable-hot-rank'
import { mapPostFeedResponse } from '@services/feeds/posts/get-ids/feed-cursor'
import { seedPosts } from './posts.mts'
import { contentHash, seedUuid, seedUuidAtTimestamp } from './common.mts'

const FIRST_POST_INDEX = 700
const FEED_POST_COUNT = 3

export const POST_FEED_INSPECTED_CURSOR_FIXTURE: {
  topicIds: string[]
  postIds: string[]
  matchingPostId: string
} = {
  topicIds: [seedUuid(1_500_000, 'e2'), seedUuid(1_500_001, 'e2')],
  postIds: [],
  matchingPostId: '',
}

/** A newer one-term match must not pass the two-term filter before the true intersection. */
export async function seedPostFeedInspectedCursorFixture(): Promise<void> {
  const fixture = POST_FEED_INSPECTED_CURSOR_FIXTURE
  const { rows } = await read<{ latest_id_ms: string | number }>(
    `/* seedPostFeedInspectedCursorFixture:latest-post-key */
     SELECT floor(extract(epoch FROM uuid_extract_timestamp(id)) * 1000)::bigint AS latest_id_ms
     FROM posts ORDER BY id DESC LIMIT 1`,
  )
  const latestPostMs = Number(rows[0]?.latest_id_ms)
  if (!Number.isSafeInteger(latestPostMs))
    throw new Error('Could not find the indexed maximum post UUID timestamp')
  const feedPostId = (index: number) =>
    seedUuidAtTimestamp(latestPostMs + (FEED_POST_COUNT - (index - FIRST_POST_INDEX)) * 1000, index)
  fixture.postIds = Array.from({ length: FEED_POST_COUNT }, (_, offset) =>
    feedPostId(FIRST_POST_INDEX + offset),
  )
  fixture.matchingPostId = fixture.postIds.at(-1)!
  await seedPosts(FEED_POST_COUNT, FIRST_POST_INDEX, () => 'discussion', feedPostId)
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedPostFeedInspectedCursorFixture:topic */
     INSERT INTO topics (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
     SELECT topic.id, 'Post feed inspected cursor ' || topic.ordinal,
       'post-feed-inspected-cursor-' || topic.ordinal, 'system', $2
     FROM UNNEST($1::uuid[]) WITH ORDINALITY AS topic(id, ordinal)
     ON CONFLICT DO NOTHING`,
    [fixture.topicIds, contentHash('post-feed-inspected-cursor')],
  )
  await transaction(
    `/* seedPostFeedInspectedCursorFixture:membership */
     INSERT INTO relation__post__category__topic
       (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT pair.post_id, pair.topic_id, $3::uuid, 1, 1
     FROM UNNEST($1::uuid[], $2::uuid[]) AS pair(post_id, topic_id)
     ON CONFLICT DO NOTHING`,
    [
      [fixture.matchingPostId, fixture.matchingPostId, fixture.postIds[0]],
      [fixture.topicIds[0], fixture.topicIds[1], fixture.topicIds[0]],
      seedUuid(0, '01'),
    ],
  )
  await transaction(
    '/* seedPostFeedInspectedCursorFixture:analyze */ ANALYZE posts, relation__post__category__topic',
  )
  await transaction.commit()
}

/** Use the production response mapper to position ranked paging at an existing share key. */
export async function cursorBeforePostFeedSeedShare(
  mode: 'hot' | 'best',
  asOf: Date,
): Promise<string> {
  const rank =
    mode === 'hot' ? buildStablePostHotRankExpression('posts') : sql`posts.votes_score_sort`
  const { rows } = await read<{
    post_id: string
    result_id: string
    delivery_rank: number
  }>(
    sql`/* cursorBeforePostFeedSeedShare */
      SELECT posts.id AS post_id, shares.id AS result_id, `
      .append(rank)
      .append(sql` AS delivery_rank
        FROM posts
        JOIN LATERAL (
          SELECT id FROM post_feed_shares
          WHERE recipient_user_id = `)
      .append(sql`${seedUuid(0, '01')}`)
      .append(sql`::uuid AND post_id = posts.id
          ORDER BY id DESC LIMIT 1
        ) shares ON TRUE
        WHERE posts.id = `)
      .append(sql`${seedUuid(2, '05')}`).append(sql`::uuid
        LIMIT 1`),
  )
  const row = rows[0]
  if (!row) throw new Error('Seeded shared post 2 does not exist')
  const page = mapPostFeedResponse(
    [
      {
        result_id: row.result_id,
        entity_id: row.post_id,
        delivery_rank: row.delivery_rank,
        delivery_type: 'share',
        raw_has_more: true,
      },
    ],
    1,
    mode,
    asOf,
  )
  const cursor = page.page_info.end_cursor
  if (!cursor) throw new Error('Could not map the seeded share to a continuation cursor')
  return cursor
}

/** Remove only the topic membership, topic, and posts introduced by this scenario. */
export async function cleanupPostFeedInspectedCursorFixture(): Promise<void> {
  const fixture = POST_FEED_INSPECTED_CURSOR_FIXTURE
  if (fixture.postIds.length === 0) return
  await using transaction = await beginTransaction()
  await transaction(
    `/* cleanupPostFeedInspectedCursorFixture:membership */
     DELETE FROM relation__post__category__topic
     WHERE subject_id = ANY($1::uuid[]) AND object_id = ANY($2::uuid[])`,
    [fixture.postIds, fixture.topicIds],
  )
  await transaction(
    '/* cleanupPostFeedInspectedCursorFixture:topic */ DELETE FROM topics WHERE id = ANY($1::uuid[])',
    [fixture.topicIds],
  )
  await transaction(
    '/* cleanupPostFeedInspectedCursorFixture:posts */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
    [fixture.postIds],
  )
  await transaction.commit()
}
