import { isUniqueViolation, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  LandingPageSlotConflictError,
  runLandingPageWriteTransaction,
} from './write-transaction.mts'
import { getLandingPagesPerUserLimit } from './limits.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import {
  getUsernameForLandingPages,
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

  let landingPage: LandingPage
  try {
    landingPage = await runLandingPageWriteTransaction(async query => {
      await getUsernameForLandingPages(userId, { query })
      return insertLandingPageRecord(userId, { title, subtitle, slug }, query)
    })
  } catch (err) {
    if (
      isUniqueViolation(err) &&
      'constraint' in err &&
      err.constraint === 'idx_user_landing_pages__user_id_default'
    ) {
      assert(false, 409, 'You already have a default landing page')
    }
    if (err instanceof LandingPageSlotConflictError)
      assert(false, 409, 'Landing page creation is busy. Please retry.')
    throw err
  }
  await invalidate.users(userId)
  return landingPage
}

export async function insertLandingPageRecord(
  userId: string,
  input: { title: string; subtitle: string | null; slug: string },
  query: TransactionQuery,
): Promise<LandingPage> {
  const pageLimit = getLandingPagesPerUserLimit()
  const { title, subtitle, slug } = input
  try {
    const { rows } = await query(sql`/* createMyLandingPage */
      WITH owner_pages AS (
        SELECT COUNT(*) AS page_count FROM user_landing_pages WHERE user_id = ${userId}
      )
      INSERT INTO user_landing_pages (user_id, slot, title, subtitle, slug, is_default)
      SELECT ${userId}, available.slot, ${title}, ${subtitle}, ${slug}, owner_pages.page_count = 0
      FROM owner_pages
      CROSS JOIN LATERAL (
        SELECT candidate.slot
        FROM generate_series(1, ${pageLimit}) AS candidate(slot)
        WHERE owner_pages.page_count < ${pageLimit}
          AND NOT EXISTS (
            SELECT 1 FROM user_landing_pages page
            WHERE page.user_id = ${userId} AND page.slot = candidate.slot
          )
        ORDER BY candidate.slot
        LIMIT 1
      ) available
      ORDER BY available.slot ASC NULLS LAST
      ON CONFLICT (user_id, slot) DO NOTHING
      RETURNING id, user_id, title, subtitle, slug, is_default, created_at, updated_at
    `)
    const row = rows[0] as LandingPage | undefined
    if (!row) {
      const capacity = await query<{
        page_count: string
      }>(sql`/* createMyLandingPage.capacityAfterConflict */
        SELECT COUNT(*) AS page_count FROM user_landing_pages WHERE user_id = ${userId}`)
      assert(
        Number(capacity.rows[0]?.page_count) < pageLimit,
        400,
        `Maximum of ${pageLimit} landing pages allowed`,
      )
      throw new LandingPageSlotConflictError('A concurrent landing page claimed the selected slot')
    }
    return row
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      const constraint = 'constraint' in err ? err.constraint : null
      if (constraint === 'uq_user_landing_pages__user_id_slug') {
        assert(false, 409, 'You already have a landing page with this slug')
      }
    }
    throw err
  }
}
