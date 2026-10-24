import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { makeCopyrightStaffQueueItem } from './copyright'

const targets: CopyrightStaffQueueItem['targets'] = [
  {
    id: 'target-1',
    placement_key: 'image-placement:placement-1',
    placement_revision: 2,
    image_id: 'image-1',
    surface: 'post-image',
    provenance: null,
    hosted_use_url: 'https://voucha.ai/discussion/park-photo',
  },
  {
    id: 'target-2',
    placement_key: 'image-placement:placement-2',
    placement_revision: 1,
    image_id: 'image-2',
    surface: 'community-banner-image',
    provenance: {
      set_by_id: 'user-setter',
      set_by_administrator: false,
      uploaded_by_id: 'user-uploader',
    },
    hosted_use_url: 'https://voucha.ai/c/park-lovers',
  },
]

/** A US DMCA case that exercises every staff review section at once. */
export function makeBusyUsStaffCase(): CopyrightStaffQueueItem {
  return makeCopyrightStaffQueueItem({
    id: '019f0000-0000-7000-8000-000000000301',
    claimant: {
      display_name: 'Mara Example',
      contact: 'mara@example.test',
      misuse: {
        notice_withdrawn: 1,
        notice_rejected: 2,
        restriction_reversed_by_counter_notice: 0,
        restriction_reversed_by_appeal: 1,
      },
    },
    work_description: 'A landscape photograph from a public post.',
    targets,
    evidence: [
      {
        id: 'evidence-1',
        submission_id: 'submission-1',
        mime_type: 'image/jpeg',
        byte_size: 48213,
        sha256: 'a'.repeat(64),
      },
    ],
    restrictions: [
      {
        id: 'restriction-1',
        target_id: 'target-1',
        imposed_at: '2026-10-02T00:00:00Z',
        status: 'pending_review',
      },
      {
        id: 'restriction-2',
        target_id: 'target-2',
        imposed_at: '2026-10-02T00:00:00Z',
        status: 'confirmed',
      },
    ],
    appeals: [
      {
        submission_id: 'appeal-1',
        reason: 'I own this image.',
        target_ids: ['target-1', 'target-2'],
        recommendation: {
          id: 'recommendation-1',
          recommendation: 'uncertain',
          rationale: 'Needs a person.',
        },
      },
    ],
    counter_notices: [
      {
        submission_id: 'counter-1',
        received_at: '2026-10-03T00:00:00Z',
        target_ids: ['target-1'],
        statement: { signature: 'Pat Poster', consent_to_jurisdiction: true },
        guidance: {
          summary: 'The counter-notice identifies the image.',
          elements: [
            { element: 'signature', status: 'present', gap: null },
            { element: 'material_identification', status: 'present', gap: null },
            { element: 'has_good_faith_statement', status: 'present', gap: null },
            { element: 'contact_and_jurisdiction_consent', status: 'present', gap: null },
          ],
          risk_notes: [],
        },
      },
    ],
    legal_holds: [
      {
        submission_id: 'hold-1',
        received_at: '2026-10-04T00:00:00Z',
        statement: { court: 'Example District Court' },
        guidance: {
          summary: 'The filing describes a court action.',
          criteria: [
            { criterion: 'is_from_original_claimant', status: 'unclear', gap: 'Check the sender.' },
            { criterion: 'proceeding_kind', status: 'present', gap: null },
            { criterion: 'commenced_at', status: 'present', gap: null },
            {
              criterion: 'received_by_designated_agent_at',
              status: 'unclear',
              gap: 'Check receipt.',
            },
            { criterion: 'is_same_material', status: 'present', gap: null },
          ],
          risk_notes: [],
        },
        assessment: null,
      },
    ],
    action_intents: [
      { id: 'action-1', action: 'withhold', state: 'failed', failure_message: 'Storage timeout' },
    ],
    delivery_intents: [
      {
        id: 'delivery-1',
        delivery_kind: 'staff_information_request',
        channel: 'email',
        state: 'sent',
        delivery_attempt_count: 1,
      },
      {
        id: 'delivery-2',
        delivery_kind: 'staff_information_request',
        channel: 'email',
        state: 'bounced',
        delivery_attempt_count: 1,
      },
      {
        id: 'delivery-3',
        delivery_kind: 'restriction_notice',
        channel: 'in_app',
        state: 'failed',
        delivery_attempt_count: 3,
      },
    ],
    staydown_matches: [
      {
        id: 'match-1',
        image_id: 'image-9',
        registered_image_id: 'image-1',
        uploaded_by_id: 'user-uploader',
        match_kind: 'perceptual',
        hamming_distance: 4,
        matched_at: '2026-10-05T00:00:00Z',
      },
    ],
    email_correspondence: [
      {
        submission_id: 'submission-2',
        kind: 'withdrawal',
        action: 'admitted',
        reviewed_at: '2026-10-06T00:00:00Z',
      },
    ],
    reasons: ['restriction_review', 'legal_hold_review', 'deadline_due'],
    waiting_since: '2026-10-02T00:00:00Z',
    received_at: '2026-10-01T00:00:00Z',
  })
}
