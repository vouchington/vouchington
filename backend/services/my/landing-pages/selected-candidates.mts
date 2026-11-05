import { validateUUID } from '@modules/utils'
import { getLandingPageProfileLinksByIds, getLandingPageReviewsByIds } from './item-lookups.mts'
import { getLandingPageReferralLinksByIds } from './topic-lookups.mts'
import { uniqueTopicMapFromCandidates } from './shared.mts'
import type { LandingPageItemInput } from './types.mts'

/** The caller checks the total item cap before collecting or reading any submitted IDs. */
export async function getSelectedLandingPageCandidates(
  userId: string,
  items: LandingPageItemInput[],
) {
  const profileIds: string[] = []
  const reviewIds: string[] = []
  const referralIds: string[] = []
  for (const item of items) {
    if (item.type === 'profile_link') profileIds.push(item.profile_link_id)
    if (item.type === 'review') reviewIds.push(item.review_post_id)
    if (item.type === 'referral_link') referralIds.push(item.referral_link_id)
    if (item.type !== 'topic_group') continue
    validateUUID(item.topic_id)
    for (const entry of item.entries) {
      if (entry.type === 'review') reviewIds.push(entry.review_post_id)
      else referralIds.push(entry.referral_link_id)
    }
  }
  for (const id of [...profileIds, ...reviewIds, ...referralIds]) validateUUID(id)
  const [profileLinksById, reviewsById, referralLinksById] = await Promise.all([
    getLandingPageProfileLinksByIds(userId, [...new Set(profileIds)]),
    getLandingPageReviewsByIds(userId, [...new Set(reviewIds)], true),
    getLandingPageReferralLinksByIds(userId, [...new Set(referralIds)], true),
  ])
  return {
    profileLinksById,
    reviewsById,
    referralLinksById,
    topicsById: uniqueTopicMapFromCandidates(
      [...reviewsById.values()],
      [...referralLinksById.values()],
    ),
  }
}
