import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'
import { listProfileLinks } from '../profile-links.mts'
import { buildReviewMap } from './shared.mts'
import { getOwnedLandingPageReferralLinks } from './topic-lookups.mts'
import type { LandingPageCandidateReview, LandingPageCandidates } from './types.mts'

async function getOwnedPublicReviews(userId: string): Promise<LandingPageCandidateReview[]> {
  validateUUID(userId)
  const { rows } = await read(sql`/* getOwnedPublicReviews */
    SELECT
      p.id,
      p.title,
      p.declared_language,
      p.lingua_rs_detected_language,
      (
        SELECT slug
        FROM post_slugs
        WHERE post_id = p.id
        ORDER BY created_at DESC
        LIMIT 1
      ) AS slug,
      p.markdown,
      p.created_at,
      prtr.topic_id,
      prtr.rating,
      prtr.order_index,
      t.name AS topic_name,
      t.slug AS topic_slug
    FROM posts p
    JOIN view_public_post_eligibility eligibility ON eligibility.post_id = p.id
    LEFT JOIN post_review_topic_ratings prtr ON prtr.post_id = p.id
    LEFT JOIN topics t ON t.id = prtr.topic_id
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    WHERE p.created_by_id = ${userId}
      AND p.post_type = 'review'
    ORDER BY p.id DESC, prtr.order_index ASC
  `)

  return [...buildReviewMap(rows).values()]
}

async function canCreateLandingPages(userId: string): Promise<boolean> {
  validateUUID(userId)
  const { rows } = await read(sql`/* canCreateLandingPages */
    SELECT username
    FROM users
    WHERE id = ${userId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  const username = rows[0]?.username
  return typeof username === 'string' && username.length > 0
}

export async function getMyLandingPageCandidates(userId: string): Promise<LandingPageCandidates> {
  validateUUID(userId)
  const [canCreate, profileLinks, reviews, referralLinks] = await Promise.all([
    canCreateLandingPages(userId),
    listProfileLinks(userId),
    getOwnedPublicReviews(userId),
    getOwnedLandingPageReferralLinks(userId),
  ])
  return {
    can_create_landing_pages: canCreate,
    profile_links: profileLinks,
    reviews,
    referral_links: referralLinks,
  }
}
