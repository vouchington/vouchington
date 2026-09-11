import { describe, expect, it } from 'vitest'
import { getAdminReviewQueuePostHref } from '../admin-review-queue'
import type { AdminReviewQueuePost } from '@/types/admin-review-queue'

function makePost(overrides: Partial<AdminReviewQueuePost> = {}): AdminReviewQueuePost {
  return {
    id: 'post-1',
    title: 'Review queue post',
    declared_language: null,
    lingua_rs_detected_language: null,
    slug: null,
    markdown_preview: '',
    post_type: 'discussion',
    created_by_id: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    root_id: null,
    root_post_type: null,
    root_slug: null,
    clearance_status: 'pending',
    clearance_updated_at: null,
    spam_detection_flagged: null,
    spam_detection_score: null,
    spam_detection_results: null,
    openai_omni_moderation_flagged: null,
    openai_omni_moderation_results: null,
    media_context: { requires_reveal: false, images: [] },
    ...overrides,
  }
}

describe('getAdminReviewQueuePostHref', () => {
  it('links comments to routable post comment paths', () => {
    expect(
      getAdminReviewQueuePostHref(
        makePost({
          id: 'comment-1',
          post_type: 'comment',
          root_id: 'root-1',
          root_post_type: 'review',
          root_slug: 'root-review',
        }),
      ),
    ).toBe('/review/root-review/comment/comment-1')
  })

  it('routes topic recommendation comments to the review queue fallback', () => {
    expect(
      getAdminReviewQueuePostHref(
        makePost({
          id: 'comment-1',
          title: 'Recommended topic',
          post_type: 'comment',
          root_id: 'root-1',
          root_post_type: 'topic_recommendation',
        }),
      ),
    ).toBe('/topic-recommendations?q=Recommended%20topic')
  })
})
