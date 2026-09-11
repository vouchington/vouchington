import { write } from '@data-stores/psql'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@voucha/types/entities/entity-relation-tables'
import { upsertTestRecentlyViewed } from './recently-viewed.mts'
import sql from 'sql-template-strings'

export async function linkPostToTopic(postId: string, topicId: string, userId: string) {
  await write(
    sql`INSERT INTO `.append(POST_TOPIC_CATEGORY_RELATION_TABLE)
      .append(sql` (subject_id, object_id, created_by_id)
     VALUES (${postId}, ${topicId}, ${userId})
     ON CONFLICT DO NOTHING`),
  )
}

export async function linkTopicToCategory(
  subjectTopicId: string,
  categoryTopicId: string,
): Promise<void> {
  await write(sql`
    INSERT INTO "relation__topic__category__topic" (subject_id, object_id)
    VALUES (${subjectTopicId}, ${categoryTopicId})
    ON CONFLICT DO NOTHING
  `)
}

export async function markPostsAsViewed(userId: string, postIds: string[]) {
  if (postIds.length === 0) return
  await Promise.all(postIds.map(postId => upsertTestRecentlyViewed('post', postId, null, userId)))
}

export async function dismissTopicRecommendation(userId: string, topicId: string) {
  await write(
    `INSERT INTO relation__user__dismiss_recommendation__topic (subject_id, object_id, created_by_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [userId, topicId, userId],
  )
}

export async function followTopicById(userId: string, topicId: string) {
  await write(
    `INSERT INTO relation__user__follow__topic (subject_id, object_id, created_by_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [userId, topicId, userId],
  )
}
