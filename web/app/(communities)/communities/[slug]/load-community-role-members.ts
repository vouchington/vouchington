import { getCommunityMembers } from '@/lib/api/server'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'
import type { CommunityMembersResponseBody } from '@/types/api-responses'

/**
 * The sidebar shows 20 owners or moderators and follows at most five short pages.
 * Deleted users can thin a page. The role index keeps those pages off the regular-member
 * walk, and this render must not continue through the rest of the roster. Both numbers
 * are that fixed product roster, not a tunable work batch.
 */
const SIDEBAR_ROSTER = { displayLimit: 20, maxPages: 5 } as const

/** Serialized entity maps are not object-spreadable. */
function mergeRecords<T>(left: Record<string, T>, right: Record<string, T>): Record<string, T> {
  const merged: Record<string, T> = {}
  for (const source of [left, right]) {
    for (const id of Object.keys(source)) {
      const value = source[id]
      if (value !== undefined) merged[id] = value
    }
  }
  return merged
}

/** Follow empty membership pages until the sidebar has its live display cap. */
export async function loadCommunityRoleMembers(
  slug: string,
  role: 'owner' | 'moderator',
): Promise<CommunityMembersResponseBody | null> {
  let after: string | undefined
  let combined: CommunityMembersResponseBody | null = null
  for (let page = 0; page < SIDEBAR_ROSTER.maxPages; page++) {
    // oxlint-disable-next-line no-await-in-loop -- the next page starts at the previous end cursor.
    const response = await returnNullForMissingEntity(
      getCommunityMembers(slug, {
        searchParams: { role, limit: SIDEBAR_ROSTER.displayLimit, ...(after ? { after } : {}) },
      }),
      { nullStatusCodes: [403, 404] },
    )
    if (!response) return combined
    combined = combined
      ? {
          results: [...combined.results, ...response.results].slice(0, SIDEBAR_ROSTER.displayLimit),
          page_info: response.page_info,
          community_members: mergeRecords(combined.community_members, response.community_members),
          users: mergeRecords(combined.users, response.users),
        }
      : { ...response, results: response.results.slice(0, SIDEBAR_ROSTER.displayLimit) }
    if (
      combined.results.length >= SIDEBAR_ROSTER.displayLimit ||
      !response.page_info.has_next_page ||
      !response.page_info.end_cursor
    ) {
      return combined
    }
    after = response.page_info.end_cursor
  }
  return combined
}
