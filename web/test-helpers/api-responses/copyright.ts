import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'

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
