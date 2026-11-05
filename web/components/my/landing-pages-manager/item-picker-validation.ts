import type { LandingPageAddType, LandingPageItemOptions } from './options'
import { isHttpUrlWithoutFragment } from '@/lib/url/valid-url'

export function isAddItemDisabled(
  addType: LandingPageAddType,
  selectedCandidateId: string,
  selectedTopicId: string,
  linkLabel: string,
  linkUrl: string,
  options: LandingPageItemOptions,
  selectedGroupReviewIds: string[],
  selectedGroupReferralIds: string[],
): boolean {
  if (addType === 'link') return !linkLabel.trim() || !isHttpUrlWithoutFragment(linkUrl)
  if (addType === 'topic_group')
    return (
      !selectedTopicId ||
      (selectedGroupReviewIds.length === 0 && selectedGroupReferralIds.length === 0)
    )
  if (addType === 'profile_link')
    return !selectedCandidateId || options.availableProfileLinks.length === 0
  if (addType === 'review') return !selectedCandidateId || options.availableReviews.length === 0
  return !selectedCandidateId || options.availableReferralLinks.length === 0
}

export function emptyCandidateMessage(
  addType: LandingPageAddType,
  options: LandingPageItemOptions,
): string | null {
  if (addType === 'profile_link' && options.availableProfileLinks.length === 0)
    return 'No profile links available. Add one in Profile settings.'
  if (addType === 'review' && options.availableReviews.length === 0)
    return 'No public reviews available. Publish a review first.'
  if (addType === 'referral_link' && options.availableReferralLinks.length === 0)
    return 'No active referral links available. Activate one in Referrals.'
  if (addType === 'topic_group' && options.topicOptions.length === 0)
    return 'No topics available. Add a review or referral link to a topic first.'
  return null
}
