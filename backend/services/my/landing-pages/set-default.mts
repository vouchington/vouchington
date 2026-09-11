import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getLandingPageRowForUser } from './reads.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import type { LandingPage } from './types.mts'

export async function setMyLandingPageDefault(
  userId: string,
  pageId: string,
): Promise<LandingPage> {
  await using query = await beginTransaction()
  const page = await updateLandingPageDefault(query, userId, pageId)
  await query.commit()
  // Public landing-page GET responses are edge-cached and tagged user:<username> (see
  // ts-shared/cache/cache-tags.mts), so changing the default page must purge that tag.
  await invalidate.users(userId)
  return page
}

async function updateLandingPageDefault(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  userId: string,
  pageId: string,
): Promise<LandingPage> {
  await getLandingPageRowForUser(userId, pageId, { query })
  await query(sql`/* setMyLandingPageDefault */
      UPDATE user_landing_pages
      SET is_default = CASE WHEN id = ${pageId} THEN TRUE ELSE FALSE END
      WHERE user_id = ${userId}
    `)
  return getLandingPageRowForUser(userId, pageId, { query })
}
