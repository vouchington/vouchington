import { read } from '@data-stores/psql'
import { DynamicConfig } from '@data-stores/valkey'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'

export const STRIPE_PURCHASE_COLLISION_REVIEW_PAGE_MAX = 100
const STRIPE_PURCHASE_COLLISION_REVIEW_PAGE_DEFAULT = 25
const PAGE_SCOPE = 'stripe-purchase-collision-reviews:id-desc'

export const collisionReviewPageConfig = new DynamicConfig({
  key: 'membership-stripe-purchase-collision-review-config',
  fieldTypes: { page_size: 'number' },
  defaultFields: { page_size: STRIPE_PURCHASE_COLLISION_REVIEW_PAGE_DEFAULT },
})

export type StripePurchaseCollisionReviewRow = {
  id: string
  membership_source_id: string
  membership_provider_lineage_id: string
  membership_lineage_binding_id: string
  originating_invoice_id: string
  winning_source_kind: 'direct' | 'family'
  winning_plan: 'plus' | 'pro'
  collision_at: Date
  invoice_line_count: number
  mapped_membership_line_count: number
  created_at: Date
}

/** Effective page size stays inside the static ceiling and the runtime field. */
export function getStripePurchaseCollisionReviewPageSize(requested?: number): number {
  const configured = getBoundedPositiveIntegerField(collisionReviewPageConfig, 'page_size', {
    defaultValue: STRIPE_PURCHASE_COLLISION_REVIEW_PAGE_DEFAULT,
    maxValue: STRIPE_PURCHASE_COLLISION_REVIEW_PAGE_MAX,
  })
  const limit = requested ?? configured
  const finite = Number.isSafeInteger(limit) ? limit : configured
  return Math.min(
    Math.max(finite, 1),
    Math.min(configured, STRIPE_PURCHASE_COLLISION_REVIEW_PAGE_MAX),
  )
}

export async function listStripePurchaseCollisionReviews(
  options: {
    limit?: number
    after?: string | null
  } = {},
): Promise<{ results: StripePurchaseCollisionReviewRow[]; page_info: PageInfo }> {
  const limit = getStripePurchaseCollisionReviewPageSize(options.limit)
  const cursorId = options.after
    ? decodeScopedUuidCursor(
        options.after,
        PAGE_SCOPE,
        'Invalid Stripe purchase collision review cursor',
      ).id
    : null
  const query = sql`/* listStripePurchaseCollisionReviews */
    SELECT review.id, review.membership_source_id, review.membership_provider_lineage_id,
      review.membership_lineage_binding_id, review.originating_invoice_id,
      review.winning_source_kind, review.winning_plan, review.collision_at,
      review.invoice_line_count, review.mapped_membership_line_count, review.created_at
    FROM membership_stripe_purchase_collision_reviews review
  `
  if (cursorId) query.append(sql` WHERE review.id < ${cursorId}::uuid`)
  query.append(sql` ORDER BY review.id DESC LIMIT ${limit + 1}`)
  const { rows } = await read<StripePurchaseCollisionReviewRow>(query)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: review => ({ id: review.id, scope: PAGE_SCOPE }),
    }),
  }
}

export async function getStripePurchaseCollisionReview(
  reviewId: string,
): Promise<StripePurchaseCollisionReviewRow | null> {
  const { rows } =
    await read<StripePurchaseCollisionReviewRow>(sql`/* getStripePurchaseCollisionReview */
    SELECT review.id, review.membership_source_id, review.membership_provider_lineage_id,
      review.membership_lineage_binding_id, review.originating_invoice_id,
      review.winning_source_kind, review.winning_plan, review.collision_at,
      review.invoice_line_count, review.mapped_membership_line_count, review.created_at
    FROM membership_stripe_purchase_collision_reviews review
    WHERE review.id = ${reviewId}::uuid
  `)
  return rows[0] ?? null
}
