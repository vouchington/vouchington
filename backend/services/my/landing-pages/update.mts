import { write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { validateLandingPageSlug, validateSubtitle, validateTitle } from './shared.mts'
import { getLandingPageRowForUser } from './reads.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import type { LandingPage } from './types.mts'

export async function updateMyLandingPage(
  userId: string,
  pageId: string,
  input: { title?: string; subtitle?: string | null; slug?: string },
): Promise<LandingPage> {
  await getLandingPageRowForUser(userId, pageId)

  const title = input.title !== undefined ? validateTitle(input.title) : undefined
  const subtitle = input.subtitle !== undefined ? validateSubtitle(input.subtitle) : undefined
  const slug = input.slug !== undefined ? validateLandingPageSlug(input.slug) : undefined

  try {
    const { rows } = await write(sql`/* updateMyLandingPage */
      UPDATE user_landing_pages
      SET
        title = CASE WHEN ${title !== undefined} THEN ${title ?? null} ELSE title END,
        subtitle = CASE WHEN ${subtitle !== undefined} THEN ${subtitle ?? null} ELSE subtitle END,
        slug = CASE WHEN ${slug !== undefined} THEN ${slug ?? null} ELSE slug END
      WHERE id = ${pageId} AND user_id = ${userId}
      RETURNING id, user_id, title, subtitle, slug, is_default, created_at, updated_at
    `)

    assert(rows[0], 404, 'Landing page not found')
    // Public landing-page GET responses are edge-cached and tagged user:<username> (see
    // ts-shared/cache/cache-tags.mts), so a slug/title/subtitle edit must purge that tag.
    await invalidate.users(userId)
    return rows[0] as LandingPage
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      assert(false, 409, 'You already have a landing page with this slug')
    }
    throw error
  }
}
