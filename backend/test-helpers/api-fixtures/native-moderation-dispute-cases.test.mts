import { describe, expect, it } from 'vitest'
import {
  listRedactedReviewDisputes,
  redactReviewDispute,
} from '../../services/review-disputes/redaction.mts'
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

  it('keeps enriched staff context on every dispute detail response', () => {
    for (const fixture of nativeModerationDisputeApiFixtureCases) {
      if (fixture.id.endsWith('resolution-drafts.default')) continue
      if (fixture.id.includes('.member.')) continue
      if (fixture.id === 'native.moderation.disputes.default') continue

      const { dispute } = fixture.body as { dispute?: { staff_context?: unknown } }
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

  it('keeps the staff list as summaries without drafts, notes and review context', () => {
    const staffList = nativeModerationDisputeApiFixtureCases.find(
      fixture => fixture.id === 'native.moderation.disputes.default',
    )!.body as { disputes: Array<Record<string, unknown>> }
    const [row] = staffList.disputes

    expect(row).toMatchObject({
      post_slug: 'a-disputed-review',
      disputant: { id: 'user-1', username: 'native-claimant' },
      has_ai_draft: false,
      has_draft: false,
    })
    for (const field of [
      'claim_text',
      'internal_notes',
      'ai_public_response',
      'ai_internal_response',
      'staff_context',
    ]) {
      expect(row).not.toHaveProperty(field)
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
    const staffDetail = nativeModerationDisputeApiFixtureCases.find(
      fixture => fixture.id === 'native.moderation.disputes.detail.default',
    )!.body as { dispute: Record<string, unknown> }
    const dispute = memberList.disputes[0]!

    expect(dispute.id).toBe('00000000-0000-7000-8000-000000000201')
    expect(dispute.post_label).toBe('A disputed review')
    expect(dispute).toEqual(
      listRedactedReviewDisputes(
        staffList.disputes as unknown as Parameters<typeof listRedactedReviewDisputes>[0],
      )[0],
    )
    expect(memberDetail.dispute).toEqual(dispute)
    expect(memberDetail.dispute).toEqual(
      redactReviewDispute(
        staffDetail.dispute as unknown as Parameters<typeof redactReviewDispute>[0],
      ),
    )
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

    for (const [key, definition] of [
      ['GET:/api/v1/disputes#member', 'RedactedReviewDisputeSummary'],
      ['GET:/api/v1/disputes/:id#member', 'RedactedReviewDispute'],
    ] as const) {
      const contract = backendResponseContracts[key]!
      const redactedSchema = contract.schema.definitions[definition]
      expect(redactedSchema?.type).toBe('object')
      if (redactedSchema?.type !== 'object') throw new Error(`Invalid redacted schema for ${key}`)
      expect(redactedSchema.properties.post_label).toEqual({
        required: true,
        schema: { type: 'string' },
      })
      expect(contract.schema.root).toEqual(expect.any(Object))
      expect(JSON.stringify(contract.schema)).not.toContain('staff_context')
      expect(JSON.stringify(contract.schema)).not.toContain('disputant_user_id')
    }
  })
})
