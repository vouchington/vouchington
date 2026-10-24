import { assertNever } from '@modules/utils/assert-never'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildCommunityPostHotScoreExpression,
  type CommunityPostSort,
} from './approved-posts-support.mts'

/** Extra candidate column the sort ranks by. */
export function communityPostSortColumn(sort: CommunityPostSort): SQLStatement {
  switch (sort) {
    case 'hot':
      return sql`,\n      `
        .append(buildCommunityPostHotScoreExpression())
        .append(sql` AS hot_score`)
    case 'new':
      return sql``
    default:
      return assertNever(sort, 'Unknown community post sort')
  }
}

/** Join the sort's score expression needs. */
export function communityPostSortJoin(sort: CommunityPostSort): SQLStatement {
  switch (sort) {
    case 'hot':
      return sql`
    JOIN posts post_scores ON post_scores.id = posts.id
  `
    case 'new':
      return sql``
    default:
      return assertNever(sort, 'Unknown community post sort')
  }
}

/** Keyset predicate for the decoded cursor. */
export function communityPostSortCursor(
  sort: CommunityPostSort,
  cursorHotScore: number | undefined,
  cursorId: string | undefined,
): SQLStatement {
  switch (sort) {
    case 'hot':
      if (cursorHotScore !== undefined && cursorId) {
        return sql` AND (`
          .append(buildCommunityPostHotScoreExpression())
          .append(sql`, posts.id) < (${cursorHotScore}, ${cursorId})`)
      }
      return cursorId === undefined ? sql`` : sql` AND posts.id < ${cursorId}`
    case 'new':
      return cursorId === undefined ? sql`` : sql` AND posts.id < ${cursorId}`
    default:
      return assertNever(sort, 'Unknown community post sort')
  }
}

/** ORDER BY and LIMIT of the candidate page. */
export function communityPostSortOrderLimit(sort: CommunityPostSort, limit: number): SQLStatement {
  switch (sort) {
    case 'hot':
      return sql`
      ORDER BY hot_score DESC, posts.id DESC
      LIMIT ${limit + 1}
    `
    case 'new':
      return sql`
      ORDER BY posts.id DESC
      LIMIT ${limit + 1}
    `
    default:
      return assertNever(sort, 'Unknown community post sort')
  }
}

/** Candidate score column carried into the hydrated select. */
export function communityPostSortHydratedColumn(sort: CommunityPostSort): SQLStatement {
  switch (sort) {
    case 'hot':
      return sql`, candidates.hot_score`
    case 'new':
      return sql``
    default:
      return assertNever(sort, 'Unknown community post sort')
  }
}

/** Final ORDER BY over the hydrated page. */
export function communityPostSortHydratedOrder(sort: CommunityPostSort): SQLStatement {
  switch (sort) {
    case 'hot':
      return sql` ORDER BY candidates.hot_score DESC, candidates.id DESC`
    case 'new':
      return sql` ORDER BY candidates.id DESC`
    default:
      return assertNever(sort, 'Unknown community post sort')
  }
}
