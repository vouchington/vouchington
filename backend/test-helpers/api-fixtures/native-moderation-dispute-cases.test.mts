import { describe, expect, it } from 'vitest'
import { nativeModerationDisputeApiFixtureCases } from './native-moderation-dispute-cases.mts'

describe('native moderation dispute fixtures', () => {
  it('covers every staff dispute read and mutation contract', () => {
    expect(
      nativeModerationDisputeApiFixtureCases.map(fixture => fixture.backendResponseContractKey),
    ).toEqual([
      'GET:/api/v1/disputes#staff',
      'GET:/api/v1/disputes/:id#staff',
      'PATCH:/api/v1/disputes/:id#staff',
      'POST:/api/v1/disputes/:id/approval#staff',
      'POST:/api/v1/disputes/:id/delivery#staff',
      'POST:/api/v1/disputes/:id/resolution#staff',
      'POST:/api/v1/disputes/:id/resolution#staff',
      'POST:/api/v1/disputes/:id/resolution#staff',
      'POST:/api/v1/disputes/:id/resolution-drafts#staff',
    ])
  })

  it('keeps enriched staff context on every dispute response', () => {
    for (const fixture of nativeModerationDisputeApiFixtureCases) {
      if (fixture.id.endsWith('resolution-drafts.default')) continue

      const body = fixture.body as {
        dispute?: { staff_context?: unknown }
        disputes?: Array<{ staff_context?: unknown }>
      }
      const dispute = body.dispute ?? body.disputes?.[0]
      if (!dispute) throw new Error(`Missing dispute response in ${fixture.id}`)

      expect(dispute.staff_context).toMatchObject({
        disputant: {
          id: 'user-1',
          username: 'native-claimant',
        },
        review: {
          post: {
            id: 'post-1',
            slug: 'a-disputed-review',
          },
          rating: 1,
          topic: {
            id: 'topic-1',
            topic_type: 'business',
          },
        },
      })
    }
  })
})
