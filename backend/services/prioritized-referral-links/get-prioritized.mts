import { getInNetworkLinks } from './in-network.mts'
import { filterLinks } from './link-rows.mts'
import { getOfficialAccountId } from './official-account.mts'
import { getOutOfNetworkLinks } from './out-of-network.mts'
import type { ReferralLinksWithUsers } from './types.mts'
import { getPersonalizedLinkLimit } from './work-limits.mts'

/**
 * Official links first, then the viewer's network (up to the personalized link limit), or the shared top links
 * when the viewer has none. Anonymous viewers get the shared list unfiltered.
 */
export async function getPrioritizedReferralLinks(
  currentUserId: string | null,
  referralProgramId: string,
): Promise<ReferralLinksWithUsers> {
  const shared = await getOutOfNetworkLinks(referralProgramId)
  if (!currentUserId) return withOthers(shared.official, shared.others, () => true)

  const { inNetwork, excludedUserIds } = await getInNetworkLinks(
    currentUserId,
    referralProgramId,
    await getOfficialAccountId(),
    shared.others.links.flatMap(link => (link.user_id ? [link.user_id] : [])),
  )
  if (inNetwork.links.length > 0) return combine(shared.official, inNetwork)
  return withOthers(
    shared.official,
    shared.others,
    link => link.user_id !== currentUserId && !excludedUserIds.has(link.user_id!),
  )
}

function withOthers(
  official: ReferralLinksWithUsers,
  others: ReferralLinksWithUsers,
  keep: Parameters<typeof filterLinks>[1],
): ReferralLinksWithUsers {
  const top = others.links.filter(keep).slice(0, getPersonalizedLinkLimit())
  return combine(
    official,
    filterLinks({ links: top, users: others.users }, () => true),
  )
}

function combine(first: ReferralLinksWithUsers, second: ReferralLinksWithUsers) {
  return {
    links: [...first.links, ...second.links],
    users: { ...first.users, ...second.users },
  }
}
