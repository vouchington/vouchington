import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from './work-limits.mts'

const MIN_UUID = '00000000-0000-0000-0000-000000000000'
export const FIRST_CATEGORY_OWNER_CURSOR = JSON.stringify([MIN_UUID, MIN_UUID])
type CategoryRow = { id: string; category_identity_id: string }

/** Raw category tuples, rather than distinct owner count, determine continuation. */
export async function listLiveTopicMergeCategoryOwnersPage(
  kind: 'feed' | 'item',
  topicId: string,
  cursor: string,
): Promise<{ ids: string[]; cursor: string | null }> {
  const after: unknown = JSON.parse(cursor)
  if (!Array.isArray(after) || after.length !== 2 || after.some(value => typeof value !== 'string'))
    throw new TypeError('Publication category cursor requires an owner and category identity')
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const statement =
    kind === 'feed'
      ? `/* listLiveTopicMergeFeedCategoryOwnersPage */
        SELECT rss_feed_id AS id, category_identity_id FROM rss_feed_categories
        WHERE topic_id = $1::uuid
          AND (rss_feed_id, category_identity_id) > ($2::uuid, $3::uuid)
        ORDER BY rss_feed_id, category_identity_id LIMIT $4`
      : `/* listLiveTopicMergeItemCategoryOwnersPage */
      SELECT rss_feed_item_id AS id, category_identity_id
      FROM rss_feed_item_categories
      WHERE topic_id = $1::uuid
        AND (rss_feed_item_id, category_identity_id) > ($2::uuid, $3::uuid)
      ORDER BY rss_feed_item_id, category_identity_id LIMIT $4`
  const { rows } = await write<CategoryRow>(statement, [topicId, after[0], after[1], limit])
  const owners = [...new Set(rows.map(row => row.id))]
  const liveOwners =
    kind === 'feed' && owners.length > 0
      ? (
          await write<{ id: string }>(
            `/* listLiveTopicMergeCategoryOwnersPage:liveFeeds */
        SELECT id FROM rss_feeds WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
            [owners],
          )
        ).rows.map(row => row.id)
      : owners
  const last = rows.at(-1)
  const liveOwnerIds = new Set(liveOwners)
  return {
    ids: owners.filter(id => liveOwnerIds.has(id)),
    cursor:
      rows.length === limit && last ? JSON.stringify([last.id, last.category_identity_id]) : null,
  }
}
