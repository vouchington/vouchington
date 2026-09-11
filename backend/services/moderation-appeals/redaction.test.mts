import { describe, it, expect } from 'vitest'
import type { ModerationAppealResponse } from './types.mts'
import { redactModerationAppeal, listRedactedModerationAppeals } from './redaction.mts'

function makeAppeal(overrides: Partial<ModerationAppealResponse> = {}): ModerationAppealResponse {
  return {
    id: crypto.randomUUID(),
    case_id: crypto.randomUUID(),
    appellant_id: crypto.randomUUID(),
    user_warning_id: null,
    community_ban_id: null,
    post_id: null,
    user_suspension_id: null,
    community_id: null,
    post_removal_kind: null,
    appeal_reason: 'Test reason',
    status: 'pending',
    recommended_action: null,
    ai_public_response: 'AI draft response',
    ai_internal_response: 'AI internal notes',
    model: 'gpt-4o',
    ai_drafted_at: new Date(),
    public_response: 'Final public response',
    internal_notes: 'Private staff notes',
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
    target_context: {
      type: 'warning',
      id: crypto.randomUUID(),
      public_message: 'Public warning',
      created_at: new Date().toISOString(),
      community: null,
    },
    staff_context: {
      appellant: {
        id: crypto.randomUUID(),
        username: 'appellant',
        verified_display_name: null,
        profile_image_id: null,
      },
      original_decision: {
        internal_reason: 'Staff-only reason',
        actor: {
          id: crypto.randomUUID(),
          username: 'moderator',
          verified_display_name: null,
          profile_image_id: null,
        },
      },
    },
    ...overrides,
  }
}

describe('redactModerationAppeal', () => {
  it('strips all staff-only workflow fields from member JSON', () => {
    const rawJson = JSON.stringify(redactModerationAppeal(makeAppeal()))
    for (const field of [
      'case_id',
      'appellant_id',
      'appeal_reason',
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

  it('strips private fields', () => {
    const appeal = makeAppeal()
    const redacted = redactModerationAppeal(appeal)

    expect('case_id' in redacted).toBe(false)
    expect('appellant_id' in redacted).toBe(false)
    expect('appeal_reason' in redacted).toBe(false)
    expect('ai_public_response' in redacted).toBe(false)
    expect('ai_internal_response' in redacted).toBe(false)
    expect('model' in redacted).toBe(false)
    expect('ai_drafted_at' in redacted).toBe(false)
    expect('internal_notes' in redacted).toBe(false)
    expect('edited_by_id' in redacted).toBe(false)
    expect('approved_by_id' in redacted).toBe(false)
    expect('resolved_by_id' in redacted).toBe(false)
    expect('latest_lifecycle_change_id' in redacted).toBe(false)
    expect('staff_context' in redacted).toBe(false)
  })

  it('hides public_response before sent_at', () => {
    const appeal = makeAppeal({ sent_at: null, public_response: 'Response text' })
    const redacted = redactModerationAppeal(appeal)
    expect(redacted.public_response).toBeNull()
  })

  it('exposes public_response after sent_at', () => {
    const appeal = makeAppeal({ sent_at: new Date(), public_response: 'Response text' })
    const redacted = redactModerationAppeal(appeal)
    expect(redacted.public_response).toBe('Response text')
  })

  it('preserves public fields', () => {
    const appeal = makeAppeal({ status: 'pending' })
    const redacted = redactModerationAppeal(appeal)
    expect(redacted.id).toBe(appeal.id)
    expect(redacted.status).toBe('pending')
    expect(redacted.community_id).toBeNull()
    expect(redacted.target_context).toEqual(appeal.target_context)
  })

  it('preserves a nullable target context when the target is unavailable', () => {
    const redacted = redactModerationAppeal(makeAppeal({ target_context: null }))
    expect(redacted.target_context).toBeNull()
  })
})

describe('listRedactedModerationAppeals', () => {
  it('maps each appeal through redactModerationAppeal', () => {
    const appeals = [makeAppeal({ sent_at: null }), makeAppeal({ sent_at: new Date() })]
    const redacted = listRedactedModerationAppeals(appeals)
    expect(redacted.length).toBe(2)
    expect(redacted[0].public_response).toBeNull()
    expect(redacted[1].public_response).toBe('Final public response')
  })
})
