import { beginTransaction, isUniqueViolation } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { invalidate } from '@services/entity-cache/invalidate'
import {
  getUsernameForLandingPages,
  MAX_LANDING_PAGES,
  lockUserLandingPages,
  validateLandingPageSlug,
  validateSubtitle,
  validateTitle,
} from './shared.mts'
import type { LandingPage } from './types.mts'

export async function createMyLandingPage(
  userId: string,
  input: { title: string; subtitle?: string | null; slug: string },
): Promise<LandingPage> {
  const title = validateTitle(input.title)
  const subtitle = validateSubtitle(input.subtitle)
  const slug = validateLandingPageSlug(input.slug)

  await using query = await beginTransaction()
  await lockLandingPageCreation(query, userId)

  let landingPage: LandingPage
  try {
    const { rows } = await query(sql`/* createMyLandingPage */
      WITH page_count AS MATERIALIZED (
        SELECT COUNT(*)::int AS count
        FROM user_landing_pages
        WHERE user_id = ${userId}
      ), inserted AS (
        INSERT INTO user_landing_pages (user_id, title, subtitle, slug, is_default)
        SELECT ${userId}, ${title}, ${subtitle}, ${slug}, page_count.count = 0
        FROM page_count
        WHERE page_count.count < ${MAX_LANDING_PAGES}
        RETURNING id, user_id, title, subtitle, slug, is_default, created_at, updated_at
      )
      SELECT inserted.id, inserted.user_id, inserted.title, inserted.subtitle,
        inserted.slug, inserted.is_default, inserted.created_at, inserted.updated_at,
        page_count.count AS page_count
      FROM page_count
      LEFT JOIN inserted ON TRUE
    `)
    const row = rows[0] as (LandingPage & { page_count: number }) | undefined
    assert(
      (row?.page_count ?? 0) < MAX_LANDING_PAGES,
      400,
      `Maximum of ${MAX_LANDING_PAGES} landing pages allowed`,
    )
    assert(row?.id, 500, 'Landing page could not be created')
    const { page_count: _pageCount, ...createdLandingPage } = row
    landingPage = createdLandingPage
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      const constraint = 'constraint' in err ? err.constraint : null
      if (constraint === 'uq_user_landing_pages__user_id_slug') {
        assert(false, 409, 'You already have a landing page with this slug')
      }
      if (constraint === 'idx_user_landing_pages__user_id_default') {
        assert(false, 409, 'You already have a default landing page')
      }
    }
    throw err
  }
  await query.commit()
  await invalidate.users(userId)
  return landingPage
}

async function lockLandingPageCreation(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  userId: string,
): Promise<void> {
  await lockUserLandingPages(query, userId)
  await getUsernameForLandingPages(userId, { query })
}
