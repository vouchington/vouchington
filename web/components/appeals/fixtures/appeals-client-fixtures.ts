import type { ModerationAppeal } from '@/types/appeals'

export function makeAppeal(overrides: Partial<ModerationAppeal> = {}): ModerationAppeal {
  return {
    id: 'appeal-1',
    user_warning_id: 'warning-1',
    community_ban_id: null,
    post_id: null,
    user_suspension_id: null,
    community_id: null,
    post_removal_kind: null,
    status: 'pending',
    recommended_action: null,
    ai_drafted_at: null,
    ai_public_response: null,
    public_response: 'Some response',
    drafted_at: null,
    edited_at: null,
    approved_at: null,
    sent_at: null,
    resolved_at: null,
    resolution_action: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    target_context: {
      type: 'warning',
      id: 'warning-1',
      public_message: 'Please keep reviews factual.',
      created_at: '2026-01-01T00:00:00Z',
      community: null,
    },
    appellant_id: 'user-1',
    appeal_reason: 'I did not violate any rules.',
    staff_context: {
      appellant: {
        id: 'user-1',
        username: 'member',
        verified_display_name: null,
        profile_image_id: null,
      },
      original_decision: {
        internal_reason: 'The warning followed repeated unsupported claims.',
        actor: null,
      },
    },
    ...overrides,
  }
}

export function makeAppealsData(appeals: ModerationAppeal[] = [makeAppeal()]) {
  return {
    appeals,
    page_info: { has_next_page: false, end_cursor: null },
  }
}
