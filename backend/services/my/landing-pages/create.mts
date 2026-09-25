import { beginTransaction, isUniqueViolation } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { invalidate } from '@services/entity-cache/invalidate'
import {
  getUsernameForLandingPages,
  MAX_LANDING_PAGES,
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
  await lockUserLandingPages(query, userId)
  const count = await countUserLandingPages(query, userId)

  assert(count < MAX_LANDING_PAGES, 400, `Maximum of ${MAX_LANDING_PAGES} landing pages allowed`)

  let landingPage: LandingPage
  try {
    const { rows } = await query(sql`/* createMyLandingPage */
        INSERT INTO user_landing_pages (user_id, title, subtitle, slug, is_default)
        VALUES (${userId}, ${title}, ${subtitle}, ${slug}, ${count === 0})
        RETURNING id, user_id, title, subtitle, slug, is_default, created_at, updated_at
    `)
    landingPage = rows[0] as LandingPage
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      const constraint = 'constraint' in error ? error.constraint : null
      if (constraint === 'uq_user_landing_pages__user_id_slug') {
        assert(false, 409, 'You already have a landing page with this slug')
      }
      if (constraint === 'idx_user_landing_pages__user_id_default') {
        assert(false, 409, 'You already have a default landing page')
      }
    }
    throw error
  }
  await query.commit()
  await invalidate.users(userId)
  return landingPage
}

async function lockUserLandingPages(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  userId: string,
): Promise<void> {
  await query(sql`/* createMyLandingPage */ SELECT pg_advisory_xact_lock(hashtext(${userId}))`)
  await getUsernameForLandingPages(userId, { query })
}

async function countUserLandingPages(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  userId: string,
): Promise<number> {
  const {
    rows: [countRow],
  } = await query(sql`/* createMyLandingPage */
      SELECT COUNT(*)::int AS count
      FROM user_landing_pages
      WHERE user_id = ${userId}
    `)
  return Number(countRow?.count ?? 0)
}
