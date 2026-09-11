import type { LandingPageItemInput } from './types.mts'

export function buildLandingPageInsertRows(items: LandingPageItemInput[]) {
  const itemRows = items.map((item, sortOrder) => ({
    sortOrder,
    type: item.type,
    profileLinkId: item.type === 'profile_link' ? item.profile_link_id : null,
    reviewId: item.type === 'review' ? item.review_id : null,
    referralLinkId: item.type === 'referral_link' ? item.referral_link_id : null,
    topicId: item.type === 'topic_group' ? item.topic_id : null,
    linkLabel: item.type === 'link' ? item.label.trim() : null,
    linkUrl: item.type === 'link' ? item.url.trim() : null,
  }))
  const groupMemberRows = items.flatMap((item, parentSortOrder) =>
    item.type === 'topic_group'
      ? item.entries.map((entry, sortOrder) => ({
          parentSortOrder,
          sortOrder,
          type: entry.type,
          reviewId: entry.type === 'review' ? entry.review_id : null,
          referralLinkId: entry.type === 'referral_link' ? entry.referral_link_id : null,
        }))
      : [],
  )
  return { groupMemberRows, itemRows }
}
