import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { promoteOldestRemainingLandingPage } from './shared.mts'
import { getLandingPageRowForUser } from './reads.mts'
import { invalidate } from '@services/entity-cache/invalidate'

export async function deleteMyLandingPage(userId: string, pageId: string): Promise<void> {
  await using query = await beginTransaction()
  const page = await getLandingPageRowForUser(userId, pageId, { query })

  await query(
    sql`/* deleteMyLandingPage */ DELETE FROM user_landing_pages WHERE id = ${pageId} AND user_id = ${userId}`,
  )

  if (page.is_default) {
    await promoteOldestRemainingLandingPage(userId, query)
  }
  await query.commit()
  // Public landing-page GET responses are edge-cached and tagged user:<username> (see
  // ts-shared/cache/cache-tags.mts), so a deleted page must purge that tag.
  await invalidate.users(userId)
}
