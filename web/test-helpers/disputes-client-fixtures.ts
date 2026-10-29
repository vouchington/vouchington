import type { ReviewDispute } from '@/types/review-disputes'

export function makeDispute(overrides: Partial<ReviewDispute> = {}): ReviewDispute {
  return {
    id: 'dispute-1',
    post_id: 'post-1',
    topic_id: 'topic-1',
    reason: 'factually_inaccurate',
    status: 'pending',
    post_content: {
      text: 'A Review',
      declared_language: null,
      lingua_rs_detected_language: null,
    },
    created_at: '2026-01-01T00:00:00Z',
    public_response: 'Some response',
    approved_at: null,
    sent_at: null,
    ...overrides,
  }
}

export function makeDisputesData(disputes: ReviewDispute[] = [makeDispute()]) {
  return {
    disputes,
    page_info: { has_next_page: false, end_cursor: null },
  }
}
