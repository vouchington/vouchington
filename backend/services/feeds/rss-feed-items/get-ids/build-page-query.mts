import sql, { type SQLStatement } from 'sql-template-strings'
import { appendRelationCTEs } from './relation-ctes.mts'
import { appendEligibleRssFeedItemsCTE } from './eligible-items-cte.mts'
import { appendDeliveryCTEs } from './delivery-ctes.mts'
import { appendFeedPageSelect } from './page-select.mts'

type FeedPageQueryOptions = Parameters<typeof appendRelationCTEs>[1] &
  Parameters<typeof appendEligibleRssFeedItemsCTE>[1] &
  Parameters<typeof appendDeliveryCTEs>[1] & {
    clientCursorSortAt?: string
    clientCursorId?: string
    safeLimit: number
  }

export function buildRssFeedItemPageQuery(options: FeedPageQueryOptions): SQLStatement {
  const query = appendRelationCTEs(sql``, options)
  appendEligibleRssFeedItemsCTE(query, options)
  appendDeliveryCTEs(query, options)
  return appendFeedPageSelect(query, {
    sortAtLt: options.clientCursorSortAt,
    idLt: options.clientCursorId,
    safeLimit: options.safeLimit,
  })
}
