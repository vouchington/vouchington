import { write } from '@data-stores/psql'
import { upsertTestRecentlyViewed } from './recently-viewed.mts'

type UpdateEntityRelationElectionOptions = {
  votes_score_up?: number
  votes_count_up?: number
  votes_score_down?: number
  votes_count_down?: number
}

export async function updateEntityRelationElection(
  tableName: 'relation__post__category__topic',
  subjectId: string,
  objectId: string,
  options: UpdateEntityRelationElectionOptions,
): Promise<void> {
  const assignments: string[] = []
  const values: Array<number | string> = []

  for (const [column, value] of Object.entries(options)) {
    if (typeof value !== 'number') continue
    assignments.push(`${column} = $${values.push(value)}`)
  }

  if (assignments.length === 0) return

  values.push(subjectId, objectId)

  await write(
    `
    UPDATE ${tableName}
    SET ${assignments.join(', ')}
    WHERE subject_id = $${values.length - 1}
      AND object_id = $${values.length}
    `,
    values,
  )
}

export async function insertRecentlyViewedTopic(userId: string, topicId: string): Promise<void> {
  await upsertTestRecentlyViewed('topic', topicId, null, userId)
}

export async function insertUserSavedRssFeedItem(
  userId: string,
  rssFeedItemId: string,
): Promise<void> {
  await write(
    `INSERT INTO relation__user__save__rss_feed_item (subject_id, object_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING`,
    [userId, rssFeedItemId],
  )
}

export async function insertUserHiddenRssFeedItem(
  userId: string,
  rssFeedItemId: string,
): Promise<void> {
  await write(
    `INSERT INTO relation__user__hide__rss_feed_item (subject_id, object_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING`,
    [userId, rssFeedItemId],
  )
}

export async function insertRecentlyViewedRssFeedItem(
  userId: string,
  rssFeedItemId: string,
): Promise<void> {
  await upsertTestRecentlyViewed('rss_feed_item', rssFeedItemId, null, userId)
}
