import type {
  LandingPageCandidates,
  LandingPageItem,
  LandingPageItemInput,
} from '@/types/landing-pages'

export type LandingPageAddType =
  | 'link'
  | 'profile_link'
  | 'review'
  | 'referral_link'
  | 'topic_group'
export type LandingPageItemOptions = ReturnType<typeof useLandingPageItemOptions>

export function toLandingPageItemInput(item: LandingPageItem): LandingPageItemInput {
  if (item.type === 'profile_link') {
    return { type: 'profile_link', profile_link_id: item.profile_link.id }
  }
  if (item.type === 'review') return { type: 'review', review_id: item.review.id }
  if (item.type === 'referral_link') {
    return { type: 'referral_link', referral_link_id: item.referral_link.id }
  }
  if (item.type === 'link') {
    return { type: 'link', label: item.label, url: item.url }
  }
  return {
    type: 'topic_group',
    topic_id: item.topic.id,
    entries: item.entries.map(entry =>
      entry.type === 'review'
        ? { type: 'review', review_id: entry.review.id }
        : { type: 'referral_link', referral_link_id: entry.referral_link.id },
    ),
  }
}

export function useLandingPageItemOptions(
  candidates: LandingPageCandidates,
  draftItems: LandingPageItem[],
  selectedTopicId: string,
) {
  const usedProfileLinkIds = new Set(
    draftItems.flatMap(item => (item.type === 'profile_link' ? [item.profile_link.id] : [])),
  )
  const usedReviewIds = new Set(
    draftItems.flatMap(item => {
      if (item.type === 'review') return [item.review.id]
      if (item.type !== 'topic_group') return []
      return item.entries.flatMap(entry => (entry.type === 'review' ? [entry.review.id] : []))
    }),
  )
  const usedReferralLinkIds = new Set(
    draftItems.flatMap(item => {
      if (item.type === 'referral_link') return [item.referral_link.id]
      if (item.type !== 'topic_group') return []
      return item.entries.flatMap(entry =>
        entry.type === 'referral_link' ? [entry.referral_link.id] : [],
      )
    }),
  )
  const usedTopicGroupIds = new Set(
    draftItems.flatMap(item => (item.type === 'topic_group' ? [item.topic.id] : [])),
  )
  const topics = new Map<string, { id: string; name: string; slug: string; topic_type: string }>()
  for (const review of candidates.reviews) {
    for (const topic of review.review_topic_ratings) {
      topics.set(topic.topic_id, {
        id: topic.topic_id,
        name: topic.topic_name,
        slug: topic.topic_slug,
        topic_type: 'topic',
      })
    }
  }
  for (const referralLink of candidates.referral_links) {
    topics.set(referralLink.referral_program_id, {
      id: referralLink.referral_program_id,
      name: referralLink.referral_program_name,
      slug: referralLink.referral_program_slug,
      topic_type: 'referral_program',
    })
  }
  const topicOptions = [...topics.values()]
    .filter(topic => !usedTopicGroupIds.has(topic.id))
    .toSorted((a, b) => a.name.localeCompare(b.name))

  return {
    availableProfileLinks: candidates.profile_links.filter(
      link => !usedProfileLinkIds.has(link.id),
    ),
    availableReviews: candidates.reviews.filter(review => !usedReviewIds.has(review.id)),
    availableReferralLinks: candidates.referral_links.filter(
      referralLink => !usedReferralLinkIds.has(referralLink.id),
    ),
    availableGroupReviews: selectedTopicId
      ? candidates.reviews.filter(
          review =>
            !usedReviewIds.has(review.id) &&
            review.review_topic_ratings.some(topic => topic.topic_id === selectedTopicId),
        )
      : [],
    availableGroupReferralLinks: selectedTopicId
      ? candidates.referral_links.filter(
          referralLink =>
            !usedReferralLinkIds.has(referralLink.id) &&
            referralLink.referral_program_id === selectedTopicId,
        )
      : [],
    topicOptions,
  }
}
