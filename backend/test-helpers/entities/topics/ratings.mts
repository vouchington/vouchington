import { read, write } from '@data-stores/psql'
import { setTestPostClearanceStatus } from '../post-clearance.mts'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function getTopicRatingStats(topicId: string) {
  const { rows } = await read(sql`
    SELECT
      COALESCE(ratings__count__1, 0)::INT AS ratings__count__1,
      COALESCE(ratings__count__2, 0)::INT AS ratings__count__2,
      COALESCE(ratings__count__3, 0)::INT AS ratings__count__3,
      COALESCE(ratings__count__4, 0)::INT AS ratings__count__4,
      COALESCE(ratings__count__5, 0)::INT AS ratings__count__5,
      COALESCE(ratings__score__1, 0)::DOUBLE PRECISION AS ratings__score__1,
      COALESCE(ratings__score__2, 0)::DOUBLE PRECISION AS ratings__score__2,
      COALESCE(ratings__score__3, 0)::DOUBLE PRECISION AS ratings__score__3,
      COALESCE(ratings__score__4, 0)::DOUBLE PRECISION AS ratings__score__4,
      COALESCE(ratings__score__5, 0)::DOUBLE PRECISION AS ratings__score__5
    FROM topic_metrics
    WHERE topic_id = ${topicId}
  `)
  const row = rows[0]
  if (!row) return null
  return {
    ratings__count__1: Number(row.ratings__count__1),
    ratings__count__2: Number(row.ratings__count__2),
    ratings__count__3: Number(row.ratings__count__3),
    ratings__count__4: Number(row.ratings__count__4),
    ratings__count__5: Number(row.ratings__count__5),
    ratings__score__1: Number(row.ratings__score__1),
    ratings__score__2: Number(row.ratings__score__2),
    ratings__score__3: Number(row.ratings__score__3),
    ratings__score__4: Number(row.ratings__score__4),
    ratings__score__5: Number(row.ratings__score__5),
  }
}

export async function insertTestReview(data: {
  userId: string
  topicRatings: Array<{ topicId: string; rating: number }>
  title?: string
  markdown?: string
  createdAt?: Date
}): Promise<string> {
  const sha256 = `\\x${'0'.repeat(64)}`
  const id = data.createdAt ? uuidv7({ msecs: data.createdAt.getTime() }) : null
  const { rows: postRows } = await write(sql`
    INSERT INTO posts (
      id, post_type, title, markdown, created_by_id,
      bedrock_nova_multimodal_v1_content_sha256,
      llm_moderation_content_sha256
    )
    VALUES (COALESCE(${id}::uuid, uuidv7()), 'review', ${data.title || 'Test Review'}, ${data.markdown || ''}, ${data.userId}, ${sha256}, ${sha256})
    RETURNING id
  `)
  const postId = postRows[0].id
  await setTestPostClearanceStatus(postId, 'approved', data.userId)
  await write(sql`
    INSERT INTO post_review_topic_ratings (post_id, topic_id, rating, order_index)
    SELECT ${postId}, topic_id, rating, order_index
    FROM UNNEST(
      ${data.topicRatings.map(r => r.topicId)}::uuid[],
      ${data.topicRatings.map(r => r.rating)}::smallint[],
      ${data.topicRatings.map((_, i) => i)}::int[]
    ) AS t(topic_id, rating, order_index)
  `)
  return postId
}

export async function getTopicRatingsUpdatedAt(topicId: string): Promise<Date | null> {
  const { rows } = await read(sql`
    SELECT ratings__updated_at
    FROM topic_metrics
    WHERE topic_id = ${topicId}
  `)
  const ratingsUpdatedAt = rows[0]?.ratings__updated_at
  if (!ratingsUpdatedAt) return null
  return ratingsUpdatedAt instanceof Date ? ratingsUpdatedAt : new Date(String(ratingsUpdatedAt))
}

export async function setTestTopicRatingsUpdatedAt(
  topicId: string,
  ratingsUpdatedAt: Date,
): Promise<void> {
  await write(sql`
    UPDATE topic_metrics
    SET ratings__updated_at = ${ratingsUpdatedAt}
    WHERE topic_id = ${topicId}
  `)
}
