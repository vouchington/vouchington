import type { LandingPageCandidates, LandingPageItem } from '@/types/landing-pages'

type TopicGroupEntries = Extract<LandingPageItem, { type: 'topic_group' }>['entries']

export function buildTopicGroupEntries(
  candidates: LandingPageCandidates,
  reviewIds: string[],
  referralLinkIds: string[],
): TopicGroupEntries {
  return [
    ...reviewIds.flatMap(reviewId => {
      const review = candidates.reviews.find(r => r.id === reviewId)
      return review ? [{ id: crypto.randomUUID(), type: 'review' as const, review }] : []
    }),
    ...referralLinkIds.flatMap(id => {
      const referralLink = candidates.referral_links.find(rl => rl.id === id)
      return referralLink
        ? [{ id: crypto.randomUUID(), type: 'referral_link' as const, referral_link: referralLink }]
        : []
    }),
  ]
}
