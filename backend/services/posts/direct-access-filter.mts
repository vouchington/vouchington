import {
  buildDirectPostEligibilityFilter,
  type DirectPostEligibilityOptions,
} from '@modules/feed-query-builders'
import type { SQLStatement } from 'sql-template-strings'

/** SQL equivalent of canViewPostsBatch for a candidate post and its access root. */
export function buildDirectPostAccessFilter(
  currentUserId: string | null,
  isModerationStaff: boolean,
): SQLStatement {
  const options: DirectPostEligibilityOptions = { currentUserId, isModerationStaff }
  return buildDirectPostEligibilityFilter('candidate_post', 'access_post', options)
}
