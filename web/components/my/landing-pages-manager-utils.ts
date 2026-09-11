import type { LandingPageItem } from '@/types/landing-pages'

export function landingPageItemLabel(item: LandingPageItem): string {
  if (item.type === 'profile_link') {
    return (
      item.profile_link.name || item.profile_link.handle || item.profile_link.url || 'Profile link'
    )
  }
  if (item.type === 'review') {
    return item.review.title || 'Review'
  }
  if (item.type === 'referral_link') {
    return item.referral_link.label || item.referral_link.referral_program_name
  }
  if (item.type === 'link') {
    return item.label
  }
  return `Topic group: ${item.topic.name}`
}
