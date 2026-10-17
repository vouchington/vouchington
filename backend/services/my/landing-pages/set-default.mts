import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getLockedLandingPageRowForUser } from './reads.mts'
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
  await getLockedLandingPageRowForUser(userId, pageId, query)
  return replaceLandingPageDefault(query, userId, pageId)
}

async function replaceLandingPageDefault(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  userId: string,
  pageId: string,
): Promise<LandingPage> {
  await query(sql`/* setMyLandingPageDefault */
      UPDATE user_landing_pages
      SET is_default = FALSE
      WHERE user_id = ${userId} AND is_default
    `)
  const { rows } = await query(sql`/* setMyLandingPageDefault */
      UPDATE user_landing_pages
      SET is_default = TRUE
      WHERE id = ${pageId} AND user_id = ${userId}
      RETURNING id, user_id, title, subtitle, slug, is_default, created_at, updated_at
    `)
  assert(rows[0], 404, 'Landing page not found')
  return rows[0] as LandingPage
}
