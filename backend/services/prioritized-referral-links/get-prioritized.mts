import createHttpError from 'http-errors'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { getInNetworkLinks } from './in-network.mts'
import { filterLinks } from './link-rows.mts'
import { getOfficialAccountId } from './official-account.mts'
import { getOutOfNetworkLinks } from './out-of-network.mts'
import type { PrioritizedReferralLink, ReferralLinksWithUsers } from './types.mts'
import { resolvePersonalizedLinkLimit } from './work-limits.mts'

export type PrioritizedReferralLinksPage = ReferralLinksWithUsers & { page_info: PageInfo }

const NO_NEXT_PAGE: PageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }

/**
 * Official links first (extra, outside the limit), then up to `limit` personalized links: the
 * viewer's network when they have any (one page, no cursor), or else the shared ranked list with
 * the viewer's own link and their muted and blocked authors removed, paged by `after`. Anonymous
 * viewers page the shared list unfiltered.
 */
export async function getPrioritizedReferralLinks(
  currentUserId: string | null,
  referralProgramId: string,
  options?: { limit?: number; after?: string },
): Promise<PrioritizedReferralLinksPage> {
  const limit = resolvePersonalizedLinkLimit(options?.limit)
  const afterId = options?.after
    ? decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format').id
    : null
  const shared = await getOutOfNetworkLinks(referralProgramId)
  if (!currentUserId) return page(shared.official, shared.others, () => true, limit, afterId)

  const { inNetwork, excludedUserIds } = await getInNetworkLinks(
    currentUserId,
    referralProgramId,
    await getOfficialAccountId(),
    shared.others.links.flatMap(link => (link.user_id ? [link.user_id] : [])),
    limit,
  )
  if (inNetwork.links.length > 0) {
    return { ...combine(shared.official, inNetwork), page_info: NO_NEXT_PAGE }
  }
  return page(
    shared.official,
    shared.others,
    link => link.user_id !== currentUserId && !excludedUserIds.has(link.user_id!),
    limit,
    afterId,
  )
}

/**
 * One page of the shared ranked list. The cursor is the last link id of the previous page and is
 * located in the full list, before the viewer filter, so a link muted between pages cannot lose
 * the position. A short page only happens when the list runs out.
 */
function page(
  official: ReferralLinksWithUsers,
  others: ReferralLinksWithUsers,
  keep: (link: PrioritizedReferralLink) => boolean,
  limit: number,
  afterId: string | null,
): PrioritizedReferralLinksPage {
  let remaining = others.links
  if (afterId) {
    const position = remaining.findIndex(link => link.id === afterId)
    if (position === -1) throw createHttpError(400, 'Invalid cursor format')
    remaining = remaining.slice(position + 1)
  }
  const kept = remaining.filter(keep)
  const links = kept.slice(0, limit)
  const hasNextPage = kept.length > limit
  const last = links.at(-1)
  return {
    ...combine(
      official,
      filterLinks({ links, users: others.users }, () => true),
    ),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: links[0] ? encodeCursor({ id: links[0].id }) : null,
      end_cursor: hasNextPage && last ? encodeCursor({ id: last.id }) : null,
    },
  }
}

function combine(first: ReferralLinksWithUsers, second: ReferralLinksWithUsers) {
  return {
    links: [...first.links, ...second.links],
    users: { ...first.users, ...second.users },
  }
}
