import { describe, it, expect } from 'vitest'
import type { ReviewDisputeResponse, ReviewDisputeSummary } from './types.mts'
import { redactReviewDispute, listRedactedReviewDisputes } from './redaction.mts'

function makeDispute(overrides: Partial<ReviewDisputeResponse> = {}): ReviewDisputeResponse {
  return {
    id: crypto.randomUUID(),
    post_id: crypto.randomUUID(),
    post_label: 'A review',
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
    ai_draft_run_id: 'private-job-id',
    ai_draft_requested_run_id: 'private-requested-job-id',
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
    const redacted = redactReviewDispute(makeDispute())
    const rawJson = JSON.stringify(redacted)
    for (const field of [
      'disputant_user_id',
      'claim_text',
      'recommended_action',
      'ai_public_response',
      'ai_internal_response',
      'model',
      'ai_drafted_at',
      'ai_draft_run_id',
      'ai_draft_requested_run_id',
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

function makeSummary(overrides: Partial<ReviewDisputeSummary> = {}): ReviewDisputeSummary {
  return {
    id: crypto.randomUUID(),
    post_id: crypto.randomUUID(),
    topic_id: crypto.randomUUID(),
    disputant_user_id: crypto.randomUUID(),
    reason: 'other',
    status: 'pending',
    recommended_action: 'remove',
    public_response: null,
    approved_at: null,
    sent_at: null,
    resolved_at: null,
    resolution_action: null,
    created_at: new Date(),
    updated_at: new Date(),
    post_label: 'A review',
    post_content: null,
    post_slug: 'a-review',
    disputant: {
      id: crypto.randomUUID(),
      username: 'claimant',
      verified_display_name: null,
      profile_image_id: null,
    },
    has_ai_draft: true,
    has_draft: true,
    ...overrides,
  }
}

describe('listRedactedReviewDisputes', () => {
  it('maps an empty array to empty', () => {
    expect(listRedactedReviewDisputes([])).toEqual([])
  })

  it('drops the disputant, the AI recommendation, the slug and the draft flags from every row', () => {
    const rows = listRedactedReviewDisputes([makeSummary(), makeSummary()])
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row).not.toHaveProperty('disputant_user_id')
      expect(row).not.toHaveProperty('disputant')
      expect(row).not.toHaveProperty('recommended_action')
      expect(row).not.toHaveProperty('post_slug')
      expect(row).not.toHaveProperty('has_ai_draft')
      expect(row).not.toHaveProperty('has_draft')
    }
  })

  it('keeps the public fields, including a sent response', () => {
    const [row] = listRedactedReviewDisputes([
      makeSummary({ sent_at: new Date(), public_response: 'Human response' }),
    ])
    expect(row!.public_response).toBe('Human response')
  })
})
