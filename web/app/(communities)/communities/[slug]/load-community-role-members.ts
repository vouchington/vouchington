import { getCommunityMembers } from '@/lib/api/server'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'
import type { CommunityMembersResponseBody } from '@/types/api-responses'

const DISPLAY_LIMIT = 20
/** Short pages of deleted users must not turn one sidebar render into a full roster scan. */
const MAX_PAGES = 5

/** Follow empty membership pages until the sidebar has its live display cap. */
export async function loadCommunityRoleMembers(
  slug: string,
  role: 'owner' | 'moderator',
): Promise<CommunityMembersResponseBody | null> {
  let after: string | undefined
  let combined: CommunityMembersResponseBody | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    // oxlint-disable-next-line no-await-in-loop -- the next page starts at the previous end cursor.
    const response = await returnNullForMissingEntity(
      getCommunityMembers(slug, {
        searchParams: { role, limit: DISPLAY_LIMIT, ...(after ? { after } : {}) },
      }),
      { nullStatusCodes: [403, 404] },
    )
    if (!response) return combined
    combined = combined
      ? {
          results: [...combined.results, ...response.results].slice(0, DISPLAY_LIMIT),
          page_info: response.page_info,
          community_members: { ...combined.community_members, ...response.community_members },
          users: { ...combined.users, ...response.users },
        }
      : { ...response, results: response.results.slice(0, DISPLAY_LIMIT) }
    if (
      combined.results.length >= DISPLAY_LIMIT ||
      !response.page_info.has_next_page ||
      !response.page_info.end_cursor
    ) {
      return combined
    }
    after = response.page_info.end_cursor
  }
  return combined
}
