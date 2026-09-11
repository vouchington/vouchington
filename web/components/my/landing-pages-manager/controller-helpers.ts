import { toast } from 'sonner'
import { ApiError } from '@/lib/api/error'
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

export async function withLoading(
  setLoading: (value: boolean) => void,
  action: () => Promise<void>,
  message: string,
) {
  setLoading(true)
  try {
    await action()
  } catch (error) {
    showLandingPageError(error, message)
  } finally {
    setLoading(false)
  }
}

export function showLandingPageError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback)
}
