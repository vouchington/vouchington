import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function archiveTestCommunity(options: {
  communityId: string
  archivedById: string
}): Promise<void> {
  await write(sql`
    UPDATE communities
    SET archived_at = CURRENT_TIMESTAMP,
        archived_by_id = ${options.archivedById}
    WHERE id = ${options.communityId}`)
}

/** Marks a community deleted without clearing posts.community_id. */
export async function deleteTestCommunity(options: {
  communityId: string
  deletedById: string
}): Promise<void> {
  await write(sql`/* deleteTestCommunity */
    UPDATE communities
    SET deleted_at = CURRENT_TIMESTAMP,
        deleted_by_id = ${options.deletedById}
    WHERE id = ${options.communityId}::uuid
  `)
}
