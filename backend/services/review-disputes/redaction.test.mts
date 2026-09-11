import { describe, it, expect } from 'vitest'
import type { ReviewDisputeResponse } from './types.mts'
import { redactReviewDispute, listRedactedReviewDisputes } from './redaction.mts'

function makeDispute(overrides: Partial<ReviewDisputeResponse> = {}): ReviewDisputeResponse {
  return {
    id: crypto.randomUUID(),
    post_id: crypto.randomUUID(),
    post_content: null,
    topic_id: crypto.randomUUID(),
    disputant_user_id: crypto.randomUUID(),
    reason: 'other',
    claim_text: 'Secret claim text',
    status: 'pending',
    recommended_action: null,
    ai_public_response: 'AI draft',
    ai_internal_response: 'AI internal',
    model: 'gpt-4o',
    ai_drafted_at: new Date(),
    public_response: 'Human response',
    internal_notes: 'Private notes',
    drafted_at: new Date(),
    edited_at: null,
    edited_by_id: crypto.randomUUID(),
    approved_at: null,
    approved_by_id: crypto.randomUUID(),
    sent_at: null,
    resolved_at: null,
    resolved_by_id: crypto.randomUUID(),
    resolution_action: null,
    latest_lifecycle_change_id: crypto.randomUUID(),
    created_at: new Date(),
    updated_at: new Date(),
    staff_context: {
      disputant: {
        id: crypto.randomUUID(),
        username: 'private-disputant',
        verified_display_name: null,
        profile_image_id: null,
      },
      review: {
        post: {
          id: crypto.randomUUID(),
          title: 'Private review context',
          declared_language: null,
          lingua_rs_detected_language: null,
          slug: 'private-review-context',
          markdown_preview: 'Private review preview',
          created_by_id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        },
        topic: {
          id: crypto.randomUUID(),
          name: 'Private topic context',
          slug: 'private-topic-context',
          topic_type: 'topic',
        },
        rating: 1,
      },
    },
    ...overrides,
  }
}

describe('redactReviewDispute', () => {
  it('strips all staff-only workflow fields from member JSON', () => {
    const rawJson = JSON.stringify(redactReviewDispute(makeDispute()))
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
      expect(rawJson).not.toContain(`"${field}"`)
    }
  })

  it('strips private fields from the dispute', () => {
    const dispute = makeDispute()
    const redacted = redactReviewDispute(dispute)

    expect(redacted).not.toHaveProperty('disputant_user_id')
    expect(redacted).not.toHaveProperty('claim_text')
    expect(redacted).not.toHaveProperty('ai_public_response')
    expect(redacted).not.toHaveProperty('ai_internal_response')
    expect(redacted).not.toHaveProperty('model')
    expect(redacted).not.toHaveProperty('ai_drafted_at')
    expect(redacted).not.toHaveProperty('internal_notes')
    expect(redacted).not.toHaveProperty('edited_by_id')
    expect(redacted).not.toHaveProperty('approved_by_id')
    expect(redacted).not.toHaveProperty('resolved_by_id')
    expect(redacted).not.toHaveProperty('latest_lifecycle_change_id')
    expect(redacted).not.toHaveProperty('staff_context')
  })

  it('hides public_response when sent_at is null', () => {
    const dispute = makeDispute({ sent_at: null, public_response: 'Should be hidden' })
    const redacted = redactReviewDispute(dispute)
    expect(redacted.public_response).toBeNull()
  })

  it('exposes public_response when sent_at is set', () => {
    const dispute = makeDispute({ sent_at: new Date(), public_response: 'Visible after send' })
    const redacted = redactReviewDispute(dispute)
    expect(redacted.public_response).toBe('Visible after send')
  })

  it('preserves public non-private fields', () => {
    const dispute = makeDispute({ status: 'resolved', resolution_action: 'annotate' })
    const redacted = redactReviewDispute(dispute)

    expect(redacted.id).toBe(dispute.id)
    expect(redacted.post_id).toBe(dispute.post_id)
    expect(redacted.topic_id).toBe(dispute.topic_id)
    expect(redacted.status).toBe('resolved')
    expect(redacted.resolution_action).toBe('annotate')
  })
})

describe('listRedactedReviewDisputes', () => {
  it('maps an empty array to empty', () => {
    expect(listRedactedReviewDisputes([])).toEqual([])
  })

  it('redacts every dispute in the list', () => {
    const disputes = [makeDispute(), makeDispute({ sent_at: new Date() })]
    const redacted = listRedactedReviewDisputes(disputes)
    expect(redacted).toHaveLength(2)
    for (const r of redacted) {
      expect(r).not.toHaveProperty('claim_text')
      expect(r).not.toHaveProperty('disputant_user_id')
      expect(r).not.toHaveProperty('staff_context')
    }
    // Second dispute has sent_at set so public_response is visible
    expect(redacted[1].public_response).toBe('Human response')
    // First dispute sent_at is null so public_response is hidden
    expect(redacted[0].public_response).toBeNull()
  })
})
