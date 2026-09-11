import { read, write } from '@data-stores/psql'
import assert from 'http-assert'
import { getCommunityListItemStorageConfig } from './catalog.mts'
import { getCommunity } from '../get.mts'
import type { CommunityListItem, CommunityListItemType } from './types.mts'

async function assertEntityExists(
  itemType: CommunityListItemType,
  entityId: string,
): Promise<void> {
  const { entityTable, activeEntityFilter } = getCommunityListItemStorageConfig(itemType)
  const { rows } = await read(
    `/* assertEntityExists */
    SELECT id FROM ${entityTable} WHERE id = $1 ${activeEntityFilter} LIMIT 1
    `,
    [entityId],
  )
  assert(rows.length > 0, 404, `${itemType} not found`)
}

export async function addCommunityListItem(
  currentUserId: string,
  communityId: string,
  itemType: CommunityListItemType,
  entityId: string,
): Promise<CommunityListItem> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 409, 'Archived communities cannot be updated')

  await assertEntityExists(itemType, entityId)

  const { table, entityColumn } = getCommunityListItemStorageConfig(itemType)

  const { rows } = await write(
    `/* addCommunityListItem */
    -- Dynamic table and column come from the closed list-item storage catalog; VALUES is one row.
    /* no-mistakes: deadlock-safe */
    INSERT INTO ${table} (community_id, ${entityColumn}, added_by_id)
    VALUES ($1, $2, $3)
    RETURNING id, community_id, ${entityColumn} AS entity_id, order_index, added_by_id, created_at
    `,
    [communityId, entityId, currentUserId],
  )

  const row = rows[0]!
  return {
    __entity_type: 'community_list_item',
    id: row.id as string,
    community_id: row.community_id as string,
    item_type: itemType,
    entity_id: row.entity_id as string,
    order_index: row.order_index as number,
    added_by_id: (row.added_by_id as string | null) ?? null,
    created_at: row.created_at as Date,
  }
}
