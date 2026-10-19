import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { getCommunityListItemStorageConfig } from '@voucha/types/entities/community-list-item-storage'
import type { CommunityListItem, CommunityListItemType } from '@voucha/types/entities/community'

type InsertTestCommunityListItemOptions = {
  communityId: string
  itemType: CommunityListItemType
  entityId: string
  addedById?: string | null
  orderIndex?: number
}

export async function insertTestCommunityListItem(
  options: InsertTestCommunityListItemOptions,
): Promise<CommunityListItem> {
  const { table, entityColumn } = getCommunityListItemStorageConfig(options.itemType)

  const { rows } = await write(
    `/* insertTestCommunityListItem */
    INSERT INTO ${table} (community_id, ${entityColumn}, added_by_id, order_index)
    VALUES ($1, $2, $3, $4)
    RETURNING id, community_id, ${entityColumn} AS entity_id, order_index, added_by_id, created_at
    `,
    [options.communityId, options.entityId, options.addedById ?? null, options.orderIndex ?? 0],
  )

  const row = rows[0]!
  return {
    __entity_type: 'community_list_item',
    id: row.id as string,
    community_id: row.community_id as string,
    item_type: options.itemType,
    entity_id: row.entity_id as string,
    order_index: row.order_index as number,
    added_by_id: (row.added_by_id as string | null) ?? null,
    created_at: row.created_at as Date,
  }
}

/** Attaches posts in array order; index 0 is the oldest list row and the last index is the newest. */
export async function insertTestCommunityListPostBatch(options: {
  communityId: string
  postIds: readonly string[]
  addedById: string
}): Promise<{ oldestPostId: string; newestPostId: string }> {
  const postIds = [...options.postIds]
  if (postIds.length === 0) throw new Error('insertTestCommunityListPostBatch requires posts')
  const base = Date.UTC(2020, 0, 1)
  const itemIds = postIds.map((_, index) => uuidv7({ msecs: base + index * 1000 }))
  await write(sql`/* insertTestCommunityListPostBatch */
    INSERT INTO community_list_posts (id, community_id, post_id, added_by_id, order_index)
    SELECT item_id, ${options.communityId}::uuid, post_id, ${options.addedById}::uuid, ordinality::int
    FROM unnest(${itemIds}::uuid[], ${postIds}::uuid[]) WITH ORDINALITY
      AS row(item_id, post_id, ordinality)
  `)
  return { oldestPostId: postIds[0]!, newestPostId: postIds.at(-1)! }
}

export async function removeTestCommunityListItem(
  item: Pick<CommunityListItem, 'id' | 'item_type'>,
): Promise<void> {
  const { table } = getCommunityListItemStorageConfig(item.item_type)
  await write(
    `/* removeTestCommunityListItem */ UPDATE ${table} SET removed_at = NOW() WHERE id = $1`,
    [item.id],
  )
}

export async function insertTestProxyFollowCommunity(
  userId: string,
  communityId: string,
): Promise<void> {
  await write(
    sql`/* insertTestProxyFollowCommunity */
    INSERT INTO relation__user__proxy_follow__community (subject_id, object_id)
    VALUES (${userId}, ${communityId})
    ON CONFLICT DO NOTHING`,
  )
}

export async function insertTestProxyMuteCommunity(
  userId: string,
  communityId: string,
): Promise<void> {
  await write(
    sql`/* insertTestProxyMuteCommunity */
    INSERT INTO relation__user__proxy_mute__community (subject_id, object_id)
    VALUES (${userId}, ${communityId})
    ON CONFLICT DO NOTHING`,
  )
}
