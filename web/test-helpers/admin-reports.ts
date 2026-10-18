import type {
  AdminModerationReport,
  AdminModerationReportsResponse,
} from '@/components/admin/reports-client-types'

export function makeReportsResponse(
  overrides: {
    status?: 'pending' | 'reviewed' | 'actioned' | 'dismissed'
    judgement?: AdminModerationReport['judgement']
  } & Partial<AdminModerationReport> = {},
): AdminModerationReportsResponse {
  return {
    results: [makeReport(overrides)],
    page_info: {
      has_next_page: false,
      has_previous_page: false,
      start_cursor: null,
      end_cursor: null,
    },
  }
}

export function makeReport(overrides: Partial<AdminModerationReport> = {}): AdminModerationReport {
  return {
    id: 'report-1',
    case_id: 'case-1',
    created_at: '2026-05-31T00:00:00.000Z',
    reviewed_at: null,
    reporter_user_id: 'user-1',
    reporter_username: 'reader',
    entity_type: 'post',
    entity_id: 'post-1',
    admin_action_path: '/discussion/reported-post',
    target_label: 'Reported post',
    target_path: '/discussion/reported-post',
    target_user_id: null,
    target_available: true,
    target_is_restricted: false,
    reason: 'spam',
    note: null,
    status: 'pending',
    report_count: 1,
    resolved_by_id: null,
    is_system_generated: false,
    automatic_judgement_enabled: true,
    judgement: null,
    post_moderation_context: null,
    ...overrides,
    target_content: overrides.target_content ?? null,
  }
}
