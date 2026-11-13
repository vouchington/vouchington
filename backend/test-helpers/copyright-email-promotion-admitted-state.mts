import { expect } from 'vitest'
import type { copyrightRestrictedRaceState } from './copyright-assessment-race-outcomes.mts'
import type {
  PromotionScene,
  readCopyrightPromotionScene,
} from './copyright-email-promotion-scene-state.mts'

type State = Awaited<ReturnType<typeof readCopyrightPromotionScene>>
/** A complete admission includes its legal case, source review, evidence, receipt and graph links. */
export function copyrightPromotionAdmittedState(
  scene: PromotionScene,
  before: State,
  noticeId: string,
  submissionId: string,
  targetId: string,
  linkedDescendantIds: string[],
) {
  const { input } = scene
  const target = input.targets[0]
  const intake = before.intakes.find(row => row.id === input.intakeId)
  if (!target || !intake) throw new Error('Owned promotion input lost its target or source')
  const legal: Parameters<typeof copyrightRestrictedRaceState>[0] = {
    accepted: false,
    provisional: false,
    assessments: [],
    identities: [],
    pointers: [{ id: submissionId, assessment: null, compliant: null }],
    restrictions: [],
    actions: [],
    events: ['notice_received'],
    deliveries: ['claimant_receipt:email:null'],
    correspondence: ['receipt'],
    incidents: 0,
    staydown: 0,
    deadlines: [],
    targets: [
      expect.objectContaining({
        id: targetId,
        copyright_notice_id: noticeId,
        placement_id: target.placementId,
        placement_revision: target.placementRevision,
        image_id: target.imageId,
        hosted_use_url: target.hostedUseUrl,
      }),
    ],
  }
  const candidate = {
    id: noticeId,
    legal,
    header: {
      jurisdiction: input.jurisdiction,
      claimant: null,
      name: input.claimantDisplayName,
      contact: input.claimantContact,
      work: input.workDescription,
      policy: 'copyright-email-moderated-v1',
    },
    submissions: [
      {
        id: submissionId,
        kind: 'notice',
        source: 'email',
        author: null,
        body: {
          has_good_faith_belief: input.goodFaithBelief,
          has_accuracy_authority_under_penalty_of_perjury:
            input.accuracyAuthorityUnderPenaltyOfPerjury,
          electronic_signature: input.electronicSignature,
        },
      },
    ],
    assessors: [],
    audits: [{ kind: 'notice_received', actor: null, assessment: null, restriction: null }],
  }
  const admitted = {
    ...before,
    candidateCount: 1,
    candidate,
    intakes: before.intakes.map(row =>
      row.id === input.intakeId
        ? {
            ...row,
            decision: 'approved',
            reviewer: input.currentUser.id,
            reviewed: expect.any(Date),
            rationale: {
              rationale: input.rationale,
              manual_fallback_reason: input.manualFallbackReason,
            },
          }
        : row,
    ),
    links: [
      ...before.links,
      { intake: input.intakeId, notice: noticeId, kind: 'initial', action: null, matched: null },
      ...linkedDescendantIds.map(id => ({
        intake: id,
        notice: noticeId,
        kind: 'thread',
        action: 'pending',
        matched: null,
      })),
    ].toSorted((a, b) => a.intake.localeCompare(b.intake)),
    reviews: [
      ...before.reviews,
      {
        intake: input.intakeId,
        notice: noticeId,
        reviewer: input.currentUser.id,
        recommendation: input.recommendationId,
        decision: 'approved',
        matchesReceipt: true,
      },
    ],
    evidence: [
      ...before.evidence,
      {
        submission: submissionId,
        storage: intake.storage,
        sha: intake.sha,
        media: intake.media,
        size: intake.size,
      },
    ],
    clocks: [...before.clocks, { id: noticeId, at: expect.any(Date) }].toSorted((a, b) =>
      (a.id ?? '').localeCompare(b.id ?? ''),
    ),
  }
  return { admitted, candidate, legal }
}
