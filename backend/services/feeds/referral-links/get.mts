import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { buildReferralLinksFeedQuery } from './query.mts'
import { clampLimit } from '@services/pagination'
import type {
  ReferralLinkFeedRow,
  ReferralLinkFeedUserRow,
  ReferralLinksFeedType,
} from './types.mts'

export async function getReferralLinksFeed(
  currentUser: PrivateUser,
  feedType: ReferralLinksFeedType,
  options?: { limit?: number; after?: string },
): Promise<{
  results: ReferralLinkFeedRow[]
  users: Record<string, ReferralLinkFeedUserRow>
  page_info: PageInfo
}> {
  const limit = clampLimit(options?.limit)
  const inspectionLimit = limit * 10

  let cursorId: string | undefined
  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const query = buildReferralLinksFeedQuery(currentUser.id, feedType, inspectionLimit, cursorId)
  type MatchedRow = ReferralLinkFeedRow & Omit<ReferralLinkFeedUserRow, 'id'>
  type InspectedRow = { id: string; eligible_id: null } | (MatchedRow & { eligible_id: string })
  const rows: MatchedRow[] = []
  let inspected = 0
  let lastInspected: string | undefined
  let hasNextPage = false
  // The SQL LIMIT is strict: maxRows would add a lookahead row to the cursor wrapper.
  for await (const row of createAsyncGeneratorFromCursor<InspectedRow>(
    `/* getReferralLinksFeed */ ${query.text}`,
    query.values,
    { batchSize: limit, readOnly: true },
  )) {
    inspected++
    lastInspected = row.id
    if (row.eligible_id !== null) rows.push(row)
    if (rows.length === limit || inspected === inspectionLimit) {
      hasNextPage = true
      break
    }
  }

  const results: ReferralLinkFeedRow[] = rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    referral_program_id: row.referral_program_id,
    referral_program_name: row.referral_program_name,
    referral_program_slug: row.referral_program_slug,
    url: row.url,
    label: row.label,
  }))

  const users: Record<string, ReferralLinkFeedUserRow> = {}
  for (const row of rows) {
    if (!users[row.user_id]) {
      users[row.user_id] = {
        id: row.user_id,
        username: row.username,
        account_type: row.account_type,
        display_name: row.display_name,
        profile_image_id: row.profile_image_id,
      }
    }
  }

  return {
    results,
    users,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: hasNextPage && lastInspected ? encodeCursor({ id: lastInspected }) : null,
      start_cursor: results.length > 0 ? encodeCursor({ id: results[0]!.id }) : null,
    },
  }
}
