import type { ReviewDispute, PostDisputeAnnotation } from '@/types/review-disputes'
import type { TopicClaim } from '@/types/topic-claims'

export const pendingDispute: ReviewDispute = {
  id: 'dispute-1',
  post_id: 'post-1',
  topic_id: 'topic-1',
  reason: 'factually_inaccurate',
  status: 'pending',
  post_content: {
    text: 'Misleading review of Acme Card',
    declared_language: null,
    lingua_rs_detected_language: null,
  },
  created_at: '2026-05-31T06:00:00.000Z',
  disputant_user_id: 'claimant-1',
  claim_text: 'This review states our APR is 30% but it is 18%.',
  recommended_action: 'annotate',
  ai_public_response: 'Thank you for your dispute. A moderator will review the claim.',
  ai_internal_response: 'Claimant disputes a factual APR figure; verify against issuer site.',
  ai_drafted_at: '2026-05-31T06:05:00.000Z',
  public_response: 'Thank you for your dispute. A moderator will review the claim.',
  drafted_at: '2026-05-31T06:05:00.000Z',
  staff_context: {
    disputant: {
      id: 'claimant-1',
      username: 'claimant',
      verified_display_name: 'Acme Representative',
      profile_image_id: null,
    },
    review: {
      post: {
        id: 'post-1',
        title: 'Misleading review of Acme Card',
        declared_language: null,
        lingua_rs_detected_language: null,
        slug: 'misleading-acme-card',
        markdown_preview: 'The review being disputed.',
        created_by_id: 'author-1',
        created_at: '2026-05-30T06:00:00.000Z',
      },
      topic: {
        id: 'topic-1',
        name: 'Acme Card',
        slug: 'acme-card',
        topic_type: 'business',
      },
      rating: 2,
    },
  },
}

export const resolvedDispute: ReviewDispute = {
  id: 'dispute-2',
  post_id: 'post-2',
  topic_id: 'topic-2',
  reason: 'defamatory',
  status: 'resolved',
  post_content: {
    text: 'Review of Beta Rewards',
    declared_language: null,
    lingua_rs_detected_language: null,
  },
  created_at: '2026-05-30T06:00:00.000Z',
  public_response: 'After review, we attached a public clarification to the review.',
  sent_at: '2026-05-30T08:00:00.000Z',
  resolved_at: '2026-05-30T08:00:00.000Z',
  resolution_action: 'annotate',
}

export const staffData = {
  disputes: [pendingDispute, resolvedDispute],
  page_info: { has_next_page: false, end_cursor: null },
}

export const memberData = {
  disputes: [
    {
      id: 'dispute-3',
      post_id: 'post-3',
      topic_id: 'topic-3',
      reason: 'privacy_violation',
      status: 'pending',
      post_content: {
        text: 'Review of Gamma Bank',
        declared_language: null,
        lingua_rs_detected_language: null,
      },
      created_at: '2026-05-29T06:00:00.000Z',
    } satisfies ReviewDispute,
  ],
  page_info: { has_next_page: false, end_cursor: null },
}

export const annotation: PostDisputeAnnotation = {
  id: 'annotation-1',
  post_id: 'post-2',
  review_dispute_id: 'dispute-2',
  body_text: 'The reviewed party disputes the APR figure; the issuer confirms 18% APR.',
  created_at: '2026-05-30T08:00:00.000Z',
}

export const verifiedClaim: TopicClaim = {
  id: 'claim-1',
  topic_id: 'topic-1',
  claimant_user_id: 'claimant-1',
  verification_method: 'manual_admin',
  claimed_role: 'Card issuer',
  evidence: 'We operate acme.example and issue the Acme Card.',
  submitted_at: '2026-05-28T06:00:00.000Z',
  verified_at: '2026-05-28T07:00:00.000Z',
  verified_by_id: 'staff-1',
  rejected_at: null,
  rejected_by_id: null,
  rejection_reason: null,
  revoked_at: null,
  revoked_by_id: null,
  revocation_reason: null,
  verification_hostname_id: 'hostname-1',
  verification_token_issued_at: null,
  domain_verified_at: null,
  created_at: '2026-05-28T06:00:00.000Z',
  updated_at: '2026-05-28T07:00:00.000Z',
}

export const pendingClaim: TopicClaim = {
  ...verifiedClaim,
  id: 'claim-2',
  verification_method: null,
  verified_at: null,
  verified_by_id: null,
}
