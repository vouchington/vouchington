import { read, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { validateSlug, validateUUID } from '@modules/utils'
import type {
  LandingPageCandidateReferralLink,
  LandingPageCandidateReview,
  LandingPageTopic,
} from './types.mts'
const MAX_TITLE_LENGTH = 100
const MAX_SUBTITLE_LENGTH = 280
export const MAX_LANDING_PAGES = 20

export function validateTitle(title: string): string {
  const trimmed = title.trim()
  assert(trimmed.length > 0, 400, 'title is required')
  assert(
    trimmed.length <= MAX_TITLE_LENGTH,
    400,
    `title must be at most ${MAX_TITLE_LENGTH} characters`,
  )
  return trimmed
}

export function validateSubtitle(subtitle: string | null | undefined): string | null {
  if (subtitle == null) return null
  const trimmed = subtitle.trim()
  assert(
    trimmed.length <= MAX_SUBTITLE_LENGTH,
    400,
    `subtitle must be at most ${MAX_SUBTITLE_LENGTH} characters`,
  )
  return trimmed || null
}

export function validateLandingPageSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase()
  assert(normalized.length > 0, 400, 'slug is required')
  assert(normalized.length <= 100, 400, 'slug must be at most 100 characters')
  return validateSlug(normalized)
}

export async function getUsernameForLandingPages(
  userId: string,
  options?: { query?: TransactionQuery },
): Promise<string> {
  validateUUID(userId)
  const executor = options?.query ?? read
  const { rows } = await executor(
    sql`/* getUsernameForLandingPages */ SELECT username FROM users WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1`,
  )
  const username = rows[0]?.username
  assert(
    typeof username === 'string' && username.length > 0,
    400,
    'Username is required for landing pages',
  )
  return username
}

export async function promoteOldestRemainingLandingPage(
  userId: string,
  query: TransactionQuery,
): Promise<void> {
  const { rows } = await query(sql`/* promoteOldestRemainingLandingPage */
    SELECT id
    FROM user_landing_pages
    WHERE user_id = ${userId}
    ORDER BY id ASC
    LIMIT 1
  `)

  const nextId = rows[0]?.id
  if (!nextId) return

  await query(sql`/* promoteOldestRemainingLandingPage */
    UPDATE user_landing_pages
    SET is_default = CASE WHEN id = ${nextId} THEN TRUE ELSE FALSE END
    WHERE user_id = ${userId}
  `)
}

export function buildReviewMap(
  rows: Array<Record<string, unknown>>,
): Map<string, LandingPageCandidateReview> {
  const reviews = new Map<string, LandingPageCandidateReview>()

  for (const row of rows) {
    const id = row.id as string
    let review = reviews.get(id)
    if (!review) {
      review = {
        id,
        title: (row.title as string | null) ?? '',
        declared_language: (row.declared_language as string | null) ?? null,
        lingua_rs_detected_language: (row.lingua_rs_detected_language as string | null) ?? null,
        slug: (row.slug as string | null) ?? null,
        markdown: (row.markdown as string) ?? '',
        created_at: row.created_at as Date,
        review_topic_ratings: [],
      }
      reviews.set(id, review)
    }

    if (row.topic_id && row.topic_name && row.topic_slug) {
      review.review_topic_ratings.push({
        topic_id: row.topic_id as string,
        topic_name: row.topic_name as string,
        topic_slug: row.topic_slug as string,
        rating: Number(row.rating),
        order_index: Number(row.order_index),
      })
    }
  }

  for (const review of reviews.values()) {
    review.review_topic_ratings.sort((a, b) => a.order_index - b.order_index)
  }

  return reviews
}

export function assertNoDuplicateSelection(
  type: 'profile_link' | 'review' | 'referral_link' | 'topic_group',
  id: string,
  seen: Set<string>,
) {
  const key = `${type}:${id}`
  assert(!seen.has(key), 400, `Duplicate ${type} selection is not allowed`)
  seen.add(key)
}

export function uniqueTopicMapFromCandidates(
  reviews: LandingPageCandidateReview[],
  referralLinks: LandingPageCandidateReferralLink[],
): Map<string, LandingPageTopic> {
  const topics = new Map<string, LandingPageTopic>()

  for (const review of reviews) {
    for (const topic of review.review_topic_ratings) {
      if (!topics.has(topic.topic_id)) {
        topics.set(topic.topic_id, {
          id: topic.topic_id,
          name: topic.topic_name,
          slug: topic.topic_slug,
          topic_type: 'topic',
        })
      }
    }
  }

  for (const link of referralLinks) {
    if (!topics.has(link.referral_program_id)) {
      topics.set(link.referral_program_id, {
        id: link.referral_program_id,
        name: link.referral_program_name,
        slug: link.referral_program_slug,
        topic_type: 'referral_program',
      })
    }
  }

  return topics
}
