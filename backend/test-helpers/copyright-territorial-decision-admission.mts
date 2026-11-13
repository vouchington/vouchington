import { expect } from 'vitest'
import type {
  readTerritorialDecisionState,
  TerritorialRestrictionScene,
} from './copyright-territorial-decision-state.mts'
import type { TerritorialCopyrightDecisionInput } from '../services/copyright-notices/territorial-decision.mts'
import type { CopyrightNoticeTargetInput } from '../services/copyright-notices/types.mts'

type State = Awaited<ReturnType<typeof readTerritorialDecisionState>>
/** Admission is atomic; each later target imposition is a separate complete transaction. */
export function territorialDecisionAdmission(
  jurisdiction: 'eu_dsa' | 'uk',
  scene: TerritorialRestrictionScene,
  input: TerritorialCopyrightDecisionInput,
  before: State,
  after: State,
  placements: CopyrightNoticeTargetInput[],
) {
  const decision = after.decisions.find(row => !before.decisions.some(prior => prior.id === row.id))
  if (!decision) return null
  const assessment = after.assessors.find(
    row => !before.assessors.some(prior => prior.id === row.id),
  )
  const restrict = input.outcome === 'restrict'
  const submissionId = assessment?.submission
  const targets = input.targets
    .map((target, index) => ({
      id: after.effective.state.targets.find(
        row => row.placement_id === placements[index]!.placementId,
      )?.id,
      copyright_notice_id: scene.noticeId,
      placement_id: placements[index]!.placementId,
      placement_revision: placements[index]!.placementRevision,
      image_id: target.imageId,
      hosted_use_url: placements[index]!.hostedUseUrl,
      surface_activation_revision: null,
      surface_owner_user_id: null,
      created_at: expect.any(Date),
    }))
    .toSorted((a, b) => String(a.id).localeCompare(String(b.id)))
  const admitted = {
    ...before,
    parent: {
      id: decision.id,
      outcome: input.outcome,
      at: expect.any(Date),
      actor: scene.staff.id,
      assessment: restrict ? assessment?.id : null,
      rationale: input.text,
      explanation: input.publicExplanation,
      clock: expect.any(Date),
    },
    identities: [...before.identities, { id: decision.id, notice: scene.noticeId, jurisdiction }],
    decisions: [
      ...before.decisions,
      {
        id: decision.id,
        notice: scene.noticeId,
        jurisdiction,
        actor: scene.staff.id,
        outcome: input.outcome,
        assessment: restrict ? assessment?.id : null,
        predecessor: before.parent.id,
        automation: 'human',
        at: expect.any(Date),
        rationale: input.text,
        explanation: input.publicExplanation,
      },
    ],
    submissions: restrict
      ? [
          ...before.submissions,
          {
            id: submissionId,
            notice: scene.noticeId,
            author: scene.staff.id,
            kind: 'notice',
            source: 'staff',
            at: before.receipts[0]!.at,
            body: { territorialReceiptId: before.receipts[0]!.id, text: input.text },
          },
        ]
      : before.submissions,
    assessors: restrict
      ? [
          ...before.assessors,
          {
            id: assessment?.id,
            submission: submissionId,
            reviewer: scene.staff.id,
            screen: null,
            at: expect.any(Date),
          },
        ]
      : before.assessors,
    effective: {
      ...before.effective,
      state: {
        ...before.effective.state,
        targets: restrict
          ? [...before.effective.state.targets, ...targets]
          : before.effective.state.targets,
        assessments: restrict
          ? [
              ...before.effective.state.assessments,
              { id: assessment?.id, supersedes: null, compliant: true },
            ]
          : before.effective.state.assessments,
        identities: restrict
          ? [...before.effective.state.identities, assessment?.id]
          : before.effective.state.identities,
        pointers: restrict
          ? [
              ...before.effective.state.pointers,
              { id: submissionId, assessment: assessment?.id, compliant: true },
            ]
          : before.effective.state.pointers,
        events: [
          ...before.effective.state.events,
          ...(restrict ? ['submission_assessed'] : []),
        ].toSorted(),
        deliveries: [
          ...before.effective.state.deliveries,
          ...(!restrict
            ? [
                ...(jurisdiction === 'eu_dsa'
                  ? [`claimant_decision_notice:email:${scene.claimant.id}`]
                  : []),
                `claimant_decision_notice:in_app:${scene.claimant.id}`,
              ]
            : []),
        ].toSorted(),
        correspondence: [
          ...before.effective.state.correspondence,
          ...(!restrict ? ['decision_notice'] : []),
        ].toSorted(),
      },
    },
  }
  return { admitted, targets, assessment, restrict }
}
