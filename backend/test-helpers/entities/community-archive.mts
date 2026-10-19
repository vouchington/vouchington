import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityVisibility } from '@voucha/types/entities/community'

export async function archiveTestCommunity(options: {
  communityId: string
  archivedById: string
}): Promise<void> {
  await write(
    allowUnannotatedQuery(sql`
    UPDATE communities
    SET archived_at = CURRENT_TIMESTAMP,
        archived_by_id = ${options.archivedById}
    WHERE id = ${options.communityId}`),
  )
}

/** Changes visibility without loading the community through a product reader. */
export async function setTestCommunityVisibility(options: {
  communityId: string
  visibility: CommunityVisibility
}): Promise<void> {
  await write(sql`/* setTestCommunityVisibility */
    UPDATE communities
    SET visibility = ${options.visibility}
    WHERE id = ${options.communityId}::uuid
  `)
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
