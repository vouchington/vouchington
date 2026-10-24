import { assertNever } from '@modules/utils/assert-never'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { CommunitySortMode } from '../search-types.mts'
import type { CommunitySearchCursor } from './cursor.mts'

/** Keyset predicate, ORDER BY, and LIMIT for the candidate page of one community sort. */
export function communityCandidateSortTail(
  sort: CommunitySortMode,
  cursor: CommunitySearchCursor,
  limit: number,
  listedVirtual: boolean,
): SQLStatement {
  const { cursorName, cursorId, cursorScore } = cursor
  switch (sort) {
    case 'name':
      return cursorName !== undefined && cursorId !== undefined
        ? sql` AND (c.name, c.id) > (${cursorName}, ${cursorId})
    ORDER BY c.name ASC, c.id ASC
    LIMIT ${limit + 1}`
        : sql`
    ORDER BY c.name ASC, c.id ASC
    LIMIT ${limit + 1}`
    case 'members':
      return cursorScore !== undefined && cursorId !== undefined
        ? sql` AND (counts.member_count, c.id) < (${cursorScore}, ${cursorId})
    ORDER BY counts.member_count DESC, c.id DESC
    LIMIT ${limit + 1}`
        : sql`
    ORDER BY counts.member_count DESC, c.id DESC
    LIMIT ${limit + 1}`
    case 'virtual_subscriptions':
      return virtualSubscriptionTail(cursorScore, cursorId, limit, listedVirtual)
    default:
      return assertNever(sort, 'Unknown community sort')
  }
}

function virtualSubscriptionTail(
  cursorScore: number | undefined,
  cursorId: string | undefined,
  limit: number,
  listedVirtual: boolean,
): SQLStatement {
  const keyset =
    cursorScore !== undefined && cursorId !== undefined
      ? sql` AND (counts.virtual_subscription_count, c.id) < (${cursorScore}, ${cursorId})`
      : sql``
  return listedVirtual
    ? keyset.append(
        sql` ORDER BY counts.virtual_subscription_count DESC, c.id DESC LIMIT search_input.page_limit`,
      )
    : keyset.append(
        sql` ORDER BY counts.virtual_subscription_count DESC, c.id DESC LIMIT ${limit + 1}`,
      )
}

/** Final ORDER BY over the selected candidate page. */
export function communitySelectedSortOrder(sort: CommunitySortMode): SQLStatement {
  switch (sort) {
    case 'name':
      return sql` ORDER BY selected.name ASC, selected.id ASC`
    case 'members':
      return sql` ORDER BY selected.member_count DESC, selected.id DESC`
    case 'virtual_subscriptions':
      return sql` ORDER BY selected.virtual_subscription_count DESC, selected.id DESC`
    default:
      return assertNever(sort, 'Unknown community sort')
  }
}
