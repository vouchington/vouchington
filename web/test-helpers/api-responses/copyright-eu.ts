import type { CopyrightParticipantNoticeDetail } from '@/types/copyright-notices'
import type { createCopyrightEuRedress } from '@/lib/api/client/copyright-notices'

type EuParticipant = Extract<CopyrightParticipantNoticeDetail, { jurisdiction: 'eu_dsa' }>

export function makeCopyrightEuParticipantNotice(
  input: {
    outcome?: 'restrict' | 'no_action' | null
    decided_at?: string | null
    canSubmit?: boolean
    reopenedAt?: string | null
    viewerRole?: EuParticipant['viewer_role']
    windowEndsAt?: string | null
    eu?: Partial<EuParticipant['eu']>
  } = {},
): EuParticipant {
  const awaitingDecision = input.outcome === null
  return {
    id: '019f0000-0000-7000-8000-000000000001',
    jurisdiction: 'eu_dsa',
    received_at: '2026-10-01T10:00:00Z',
    accepted_at: null,
    provisional_withholding_at: null,
    target_count: 0,
    claimant: null,
    targets: [],
    timeline: [],
    statements: awaitingDecision
      ? []
      : [
          {
            id: '019f0000-0000-7000-8000-000000000002',
            delivery_kind: 'claimant_decision_notice',
            state: 'sent',
            sent_at: '2026-10-02T10:00:00Z',
            text: 'No action was taken. Automated means: none. You may submit an internal complaint or refer the dispute to a certified out-of-court dispute settlement body under DSA Article 21. Judicial redress is also available.',
          },
        ],
    viewer_role: input.viewerRole ?? 'claimant',
    respondable_target_ids: [],
    submissions: [],
    eu: {
      outcome: input.outcome === undefined ? 'no_action' : input.outcome,
      decided_at:
        input.decided_at === undefined
          ? awaitingDecision
            ? null
            : '2026-10-02T09:00:00Z'
          : input.decided_at,
      informed_at: awaitingDecision ? null : '2026-10-02T10:00:00Z',
      reopened_at: input.reopenedAt ?? null,
      complaint: {
        can_submit: input.canSubmit ?? !awaitingDecision,
        window_ends_at:
          input.windowEndsAt === undefined
            ? awaitingDecision
              ? null
              : '2027-04-02T10:00:00Z'
            : input.windowEndsAt,
        request: null,
        decision: null,
      },
      dispute_settlements: [],
      ...input.eu,
    },
  }
}

export function makeCopyrightEuRedressResponse(
  isDuplicate = false,
): Awaited<ReturnType<typeof createCopyrightEuRedress>> {
  return {
    copyright_eu_redress_request: {
      id: '019f0000-0000-7000-8000-000000000003',
      is_duplicate: isDuplicate,
    },
  }
}
