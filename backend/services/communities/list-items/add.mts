import { beginTransaction, read, write } from '@data-stores/psql'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import { getCommunityListFeedLimit } from '@services/lists/import-config'
import { getCommunityListItemStorageConfig } from './catalog.mts'
import { getCommunity } from '../get.mts'
import type { CommunityListItem, CommunityListItemType } from './types.mts'

async function assertEntityExists(
  itemType: CommunityListItemType,
  entityId: string,
  isAdministrator: boolean,
): Promise<void> {
  const { entityTable, activeEntityFilter } = getCommunityListItemStorageConfig(itemType)
  const hostnameVisibilityFilter =
    itemType === 'url_hostname' && !isAdministrator
      ? ' AND publicly_introduced_at IS NOT NULL AND NOT is_blocked'
      : ''
  const { rows } = await read(
    `/* assertEntityExists */
    SELECT id FROM ${entityTable} WHERE id = $1 ${activeEntityFilter}${hostnameVisibilityFilter} LIMIT 1
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
  options?: { isAdministrator?: boolean },
): Promise<CommunityListItem> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 409, 'Archived communities cannot be updated')

  await assertEntityExists(itemType, entityId, options?.isAdministrator ?? false)

  const { table, entityColumn } = getCommunityListItemStorageConfig(itemType)

  const { rows } =
    itemType === 'rss_feed'
      ? await addCommunityListFeedWithLimit(currentUserId, communityId, entityId)
      : await write(
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

async function addCommunityListFeedWithLimit(
  currentUserId: string,
  communityId: string,
  entityId: string,
) {
  const limit = getCommunityListFeedLimit()
  await using transaction = await beginTransaction()
  const options = { query: transaction }
  // Serialize feed adds on the parent. The count runs in the next statement, with a fresh
  // READ COMMITTED snapshot after any competing add releases this lock.
  await read(
    `/* addCommunityListFeed:lock */
    SELECT id FROM communities WHERE id = $1 FOR UPDATE`,
    [communityId],
    options,
  )
  const result = await write(
    `/* addCommunityListFeed:bounded */
    INSERT INTO community_list_rss_feeds (community_id, rss_feed_id, added_by_id)
    SELECT $1, $2, $3
    WHERE (SELECT count(*) FROM (
             SELECT 1 FROM community_list_rss_feeds
             WHERE community_id = $1 AND removed_at IS NULL
             LIMIT $4
           ) active_feeds) < $4
    RETURNING id, community_id, rss_feed_id AS entity_id, order_index, added_by_id, created_at`,
    [communityId, entityId, currentUserId, limit],
    options,
  )
  if (result.rows.length === 0) {
    throw createHttpError(422, 'Community list feed limit reached', {
      code: 'community_list_feed_limit_reached',
      limit,
    })
  }
  await transaction.commit()
  return result
}
