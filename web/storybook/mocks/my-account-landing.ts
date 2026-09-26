import { landingPageWithItems } from '@/storybook/entities/fixtures/landing'
import type { LandingPageItem, LandingPageWithItems } from '@/types/landing-pages'

function record(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

function matchesSubmittedItem(existing: LandingPageItem, input: Record<string, unknown>): boolean {
  if (existing.type === 'profile_link' && input.type === 'profile_link') {
    return existing.profile_link.id === input.profile_link_id
  }
  if (existing.type === 'review' && input.type === 'review')
    return existing.review.id === input.review_id
  if (existing.type === 'referral_link' && input.type === 'referral_link') {
    return existing.referral_link.id === input.referral_link_id
  }
  if (existing.type === 'topic_group' && input.type === 'topic_group') {
    return existing.topic.id === input.topic_id
  }
  return false
}

function submittedItems(fields: Record<string, unknown>): LandingPageItem[] | undefined {
  if (!Array.isArray(fields.items)) return undefined
  return fields.items.flatMap(item => {
    const input = record(item)
    if (input.type === 'link') {
      const label = typeof input.label === 'string' ? input.label : 'Link'
      const url = typeof input.url === 'string' ? input.url : 'https://example.com'
      return [{ id: `lp-link-${url}`, type: 'link' as const, label, url }]
    }
    const match = landingPageWithItems.items.find(existing => matchesSubmittedItem(existing, input))
    return match ? [match] : []
  })
}

export function updatedLandingPage(body: unknown): LandingPageWithItems {
  const fields = record(body)
  const items = submittedItems(fields)
  return {
    ...landingPageWithItems,
    title: typeof fields.title === 'string' ? fields.title : landingPageWithItems.title,
    subtitle:
      typeof fields.subtitle === 'string' || fields.subtitle === null
        ? fields.subtitle
        : landingPageWithItems.subtitle,
    slug: typeof fields.slug === 'string' ? fields.slug : landingPageWithItems.slug,
    is_default: fields.is_default === true || landingPageWithItems.is_default,
    ...(items === undefined ? {} : { items }),
  }
}
