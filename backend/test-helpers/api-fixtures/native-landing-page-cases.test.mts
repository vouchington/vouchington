import { describe, expect, it } from 'vitest'

import { apiFixtureCases } from './cases.mts'
import { nativeLandingPageDetail } from './native-landing-data.mts'

type CandidateReview = {
  id: string
  review_topic_ratings: Array<{ topic_id: string }>
}

type CandidateReferralLink = {
  id: string
  referral_program_id: string
}

type LandingPageItem = (typeof nativeLandingPageDetail.items)[number]

function placedCandidateKeys(item: LandingPageItem): string[] {
  if (item.type === 'profile_link') return [`profile_link:${item.profile_link.id}`]
  if (item.type === 'review') return [`review:${item.review.id}`]
  if (item.type === 'referral_link') return [`referral_link:${item.referral_link.id}`]
  if (item.type !== 'topic_group') return []
  return item.entries.map(entry =>
    entry.type === 'review'
      ? `review:${entry.review.id}`
      : `referral_link:${entry.referral_link.id}`,
  )
}

describe('native landing-page API fixture cases', () => {
  it('keeps candidate-backed item placement globally unique and source-backed', () => {
    const placements = nativeLandingPageDetail.items.flatMap(placedCandidateKeys)
    const fixture = apiFixtureCases.find(
      candidate => candidate.id === 'native.landing-page-candidates.default',
    )!
    const candidates = (
      fixture.body as {
        candidates: {
          profile_links: Array<{ id: string }>
          reviews: CandidateReview[]
          referral_links: CandidateReferralLink[]
        }
      }
    ).candidates
    const candidateKeys = new Set([
      ...candidates.profile_links.map(candidate => `profile_link:${candidate.id}`),
      ...candidates.reviews.map(candidate => `review:${candidate.id}`),
      ...candidates.referral_links.map(candidate => `referral_link:${candidate.id}`),
    ])

    expect(new Set(placements).size).toBe(placements.length)
    expect(placements.every(placement => candidateKeys.has(placement))).toBe(true)
  })

  it('keeps every topic-group entry candidate-backed and topic-valid', () => {
    const fixture = apiFixtureCases.find(
      candidate => candidate.id === 'native.landing-page-candidates.default',
    )!
    const candidates = (
      fixture.body as {
        candidates: {
          reviews: CandidateReview[]
          referral_links: CandidateReferralLink[]
        }
      }
    ).candidates
    const reviews = new Map(candidates.reviews.map(review => [review.id, review]))
    const referrals = new Map(candidates.referral_links.map(link => [link.id, link]))

    const topicGroups = nativeLandingPageDetail.items.filter(
      (item): item is Extract<LandingPageItem, { type: 'topic_group' }> =>
        item.type === 'topic_group',
    )
    const entryTopicValidity = topicGroups.flatMap(item =>
      item.entries.map(entry =>
        entry.type === 'review'
          ? reviews
              .get(entry.review.id)
              ?.review_topic_ratings.some(rating => rating.topic_id === item.topic.id) === true
          : referrals.get(entry.referral_link.id)?.referral_program_id === item.topic.id,
      ),
    )

    expect(topicGroups.every(item => item.entries.length > 0)).toBe(true)
    expect(entryTopicValidity.every(Boolean)).toBe(true)
  })

  it('publishes one shared five-type mutation that follows backend item-placement rules', () => {
    const fixture = apiFixtureCases.find(
      candidate => candidate.id === 'native.landing-page-items-mutation.default',
    )

    expect(fixture).toMatchObject({
      method: 'PUT',
      path: '/api/v1/my/landing-pages/landing-page-1/items',
      consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
      requestBody: {
        items: [
          { type: 'profile_link', profile_link_id: 'profile-link-1' },
          { type: 'review', review_id: 'review-1' },
          { type: 'referral_link', referral_link_id: 'referral-link-1' },
          {
            type: 'topic_group',
            topic_id: 'topic-1',
            entries: [
              { type: 'review', review_id: 'review-2' },
              { type: 'referral_link', referral_link_id: 'referral-link-2' },
            ],
          },
          { type: 'link', label: 'Newsletter', url: 'https://example.com/newsletter' },
        ],
      },
    })
  })
})
