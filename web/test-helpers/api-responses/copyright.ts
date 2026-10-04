import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { createCopyrightEuNotice } from '@/lib/api/client/copyright-notices'
import type { getCopyrightJurisdictionAvailabilityServer } from '@/lib/api/server/copyright-notices'

export function makeCopyrightStaffQueueItem(
  overrides: Partial<CopyrightStaffQueueItem> = {},
): CopyrightStaffQueueItem {
  return {
    id: 'case-test',
    jurisdiction: 'us_dmca',
    received_at: '2026-01-01T00:00:00Z',
    claimant: { display_name: null, contact: 'claimant@example.test', misuse: null },
    work_description: 'Photograph',
    targets: [],
    evidence: [],
    form_review: null,
    restrictions: [],
    appeals: [],
    counter_notices: [],
    legal_holds: [],
    action_intents: [],
    delivery_intents: [],
    staydown_matches: [],
    email_correspondence: [],
    reasons: ['legal_hold_review'],
    waiting_since: '2026-01-02T00:00:00Z',
    next_deadline: {
      escalation_at: '2026-01-14T00:00:00Z',
      restoration_deadline_at: '2026-01-14T23:59:00Z',
    },
    ...overrides,
  }
}

type HostedImagePlacement = { image_id: string; placement_id: string; placement_revision: number }

export function makeCopyrightHostedTopicResponse(input: {
  id: string
  topicType: string
  logo: HostedImagePlacement | null
  hero: HostedImagePlacement | null
}) {
  return {
    topic: {
      id: input.id,
      topic_type: input.topicType,
      logo_image_placement: input.logo,
      hero_image_placement: input.hero,
    },
  }
}

export function makeCopyrightHostedCommunityResponse(input: {
  id: string
  profile: HostedImagePlacement | null
  banner: HostedImagePlacement | null
}) {
  return {
    community: {
      id: input.id,
      profile_image_placement: input.profile,
      banner_image_placement: input.banner,
    },
  }
}

export function makeCopyrightEuNoticeResponse(
  isDuplicate = false,
): Awaited<ReturnType<typeof createCopyrightEuNotice>> {
  return {
    copyright_eu_notice: {
      notice_id: '019f0000-0000-7000-8000-00000000e001',
      receipt_id: '019f0000-0000-7000-8000-00000000e002',
      acknowledgment_id: '019f0000-0000-7000-8000-00000000e003',
      route_destination: 'staff_queue',
      is_duplicate: isDuplicate,
    },
    acknowledgment: {
      id: '019f0000-0000-7000-8000-00000000e003',
      attempt_count: 1,
      last_attempt_at: null,
      acknowledged_at: '2026-10-04T00:00:00.000Z',
      exhausted_at: null,
      escalated: false,
    },
  }
}

export function makeCopyrightJurisdictionAvailability(
  euDsa = false,
  uk = false,
): Awaited<ReturnType<typeof getCopyrightJurisdictionAvailabilityServer>> {
  return { copyright_jurisdiction_availability: { eu_dsa: euDsa, uk } }
}
