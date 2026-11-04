import { read } from '@data-stores/psql'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import { clampLimit } from '@services/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import type { MembershipChange } from './types.mts'

export async function getMembershipHistory(
  userId: string,
  options: { limit?: number; after?: string | null } = {},
): Promise<{ results: MembershipChange[]; page_info: PageInfo }> {
  const limit = Math.floor(clampLimit(options.limit, 25, 100))
  const scope = `membership-history:user:${userId}:id-desc`
  const cursor = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid membership history cursor')
    : null
  const query = sql`/* getMembershipHistory */
    SELECT
      membership_change.id,
      membership_change.membership_id,
      membership_change.user_id,
      membership_change.change_type,
      from_product.plan AS from_plan,
      to_product.plan AS to_plan,
      membership_change.from_membership_product_id AS from_sku_id,
      membership_change.to_membership_product_id AS to_sku_id,
      membership_change.cancelled_at,
      membership_change.expired_at,
      membership_change.past_due_at,
      membership_change.paused_at,
      membership_change.should_cancel_at_period_end,
      membership_change.changed_by_id,
      membership_change.note,
      membership_change.stripe_event_id,
      membership_change.membership_provider_evidence_record_id,
      membership_change.created_at
    FROM membership_changes membership_change
    LEFT JOIN membership_products from_product ON from_product.id = membership_change.from_membership_product_id
    LEFT JOIN membership_products to_product ON to_product.id = membership_change.to_membership_product_id
    WHERE membership_change.user_id = ${userId}
  `
  if (cursor) query.append(sql` AND membership_change.id < ${cursor.id}::uuid`)
  query.append(sql` ORDER BY membership_change.id DESC LIMIT ${limit + 1}`)
  const { rows } = await read<MembershipChange>(query)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: change => ({ id: change.id, scope }),
    }),
  }
}
