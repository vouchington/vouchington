import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
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
