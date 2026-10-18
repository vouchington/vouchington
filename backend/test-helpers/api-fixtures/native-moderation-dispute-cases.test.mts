import { describe, expect, it } from 'vitest'
import { redactReviewDispute } from '../../services/review-disputes/redaction.mts'
import { backendResponseContracts } from './response-contracts.mts'
import { nativeModerationDisputeApiFixtureCases } from './native-moderation-dispute-cases.mts'

describe('native moderation dispute fixtures', () => {
  it('covers every staff dispute read and mutation contract', () => {
    expect(
      nativeModerationDisputeApiFixtureCases.map(fixture => fixture.backendResponseContractKey),
    ).toEqual([
      'GET:/api/v1/disputes#staff',
      'GET:/api/v1/disputes/:id#staff',
      'GET:/api/v1/disputes#member',
      'GET:/api/v1/disputes/:id#member',
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
      if (fixture.id.includes('.member.')) continue

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

  it('keeps member list and detail fixtures as the exact redacted projection', () => {
    const memberList = nativeModerationDisputeApiFixtureCases.find(
      fixture => fixture.id === 'native.moderation.disputes.member.default',
    )!.body as { disputes: Array<Record<string, unknown>> }
    const memberDetail = nativeModerationDisputeApiFixtureCases.find(
      fixture => fixture.id === 'native.moderation.disputes.detail.member.default',
    )!.body as { dispute: Record<string, unknown> }
    const staffList = nativeModerationDisputeApiFixtureCases.find(
      fixture => fixture.id === 'native.moderation.disputes.default',
    )!.body as { disputes: Array<Record<string, unknown>> }
    const dispute = memberList.disputes[0]!

    expect(dispute.id).toBe('00000000-0000-7000-8000-000000000201')
    expect(dispute).toEqual(
      redactReviewDispute(
        staffList.disputes[0]! as unknown as Parameters<typeof redactReviewDispute>[0],
      ),
    )
    expect(memberDetail.dispute).toEqual(dispute)
    for (const field of [
      'disputant_user_id',
      'claim_text',
      'recommended_action',
      'ai_public_response',
      'ai_internal_response',
      'model',
      'ai_drafted_at',
      'internal_notes',
      'drafted_at',
      'edited_at',
      'edited_by_id',
      'approved_by_id',
      'resolved_by_id',
      'latest_lifecycle_change_id',
      'staff_context',
    ]) {
      expect(dispute).not.toHaveProperty(field)
    }

    for (const key of ['GET:/api/v1/disputes#member', 'GET:/api/v1/disputes/:id#member']) {
      const contract = backendResponseContracts[key]!
      expect(contract.schema.definitions.RedactedReviewDispute).toBeDefined()
      expect(contract.schema.root).toEqual(expect.any(Object))
      expect(JSON.stringify(contract.schema)).not.toContain('staff_context')
      expect(JSON.stringify(contract.schema)).not.toContain('disputant_user_id')
    }
  })
})
