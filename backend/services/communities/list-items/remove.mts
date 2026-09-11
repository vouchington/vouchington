import { write } from '@data-stores/psql'
import assert from 'http-assert'
import { getCommunityListItemStorageConfig } from './catalog.mts'
import { getCommunity } from '../get.mts'
import type { CommunityListItemType } from './types.mts'

export async function removeCommunityListItem(
  currentUserId: string,
  communityId: string,
  itemId: string,
  itemType: CommunityListItemType,
): Promise<void> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 409, 'Archived communities cannot be updated')

  const { table } = getCommunityListItemStorageConfig(itemType)

  const { rows } = await write(
    `/* removeCommunityListItem */
    UPDATE ${table}
    SET removed_at = NOW(), removed_by_id = $1
    WHERE id = $2
      AND community_id = $3
      AND removed_at IS NULL
    RETURNING id
    `,
    [currentUserId, itemId, communityId],
  )

  assert(rows.length > 0, 404, 'List item not found')
}
