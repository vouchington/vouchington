import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'
import { buildPageInfo, decodeScopedTierCursor } from '@modules/pagination'
import { clampLimit } from '@services/pagination'
import { getLandingPageProfileLinksByIds, getLandingPageReviewsByIds } from './item-lookups.mts'
import { getLandingPageReferralLinksByIds } from './topic-lookups.mts'
import { getLandingPageCandidateIds } from './candidate-ids.mts'
import { getLandingPageItemLimit } from './limits.mts'
import type { LandingPageCandidatesPage } from './types.mts'

async function canCreateLandingPages(userId: string): Promise<boolean> {
  const { rows } = await read(sql`/* canCreateLandingPages */
    SELECT username FROM users WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1
  `)
  const username = rows[0]?.username
  return typeof username === 'string' && username.length > 0
}

export async function getMyLandingPageCandidates(
  userId: string,
  options: { limit?: number; after?: string | null } = {},
): Promise<LandingPageCandidatesPage> {
  validateUUID(userId)
  const limit = Math.floor(clampLimit(options.limit, 25, 100))
  const scope = `landing-page-candidates:user:${userId}:type-desc-id-desc`
  const cursor = options.after
    ? decodeScopedTierCursor(options.after, scope, 'Invalid landing page candidates cursor')
    : null
  const candidates = await getLandingPageCandidateIds(userId, limit + 1, cursor)
  const results = candidates.slice(0, limit)
  const [canCreate, profileLinks, reviews, referralLinks] = await Promise.all([
    canCreateLandingPages(userId),
    getLandingPageProfileLinksByIds(
      userId,
      results.flatMap(row => (row.tier === 2 ? [row.id] : [])),
    ),
    getLandingPageReviewsByIds(
      userId,
      results.flatMap(row => (row.tier === 1 ? [row.id] : [])),
      true,
    ),
    getLandingPageReferralLinksByIds(
      userId,
      results.flatMap(row => (row.tier === 0 ? [row.id] : [])),
      true,
    ),
  ])
  return {
    candidates: {
      can_create_landing_pages: canCreate,
      profile_links: results.flatMap(row =>
        row.tier === 2 ? (profileLinks.get(row.id) ?? []) : [],
      ),
      reviews: results.flatMap(row => (row.tier === 1 ? (reviews.get(row.id) ?? []) : [])),
      referral_links: results.flatMap(row =>
        row.tier === 0 ? (referralLinks.get(row.id) ?? []) : [],
      ),
    },
    page_info: buildPageInfo(results, {
      hasNextPage: candidates.length > limit,
      getCursor: row => ({ ...row, scope }),
    }),
    item_limit: getLandingPageItemLimit(),
  }
}
