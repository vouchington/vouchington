import { copyrightPromotionAdmittedState } from './copyright-email-promotion-admitted-state.mts'
import { copyrightRestrictedRaceState } from './copyright-assessment-race-outcomes.mts'
import type {
  PromotionScene,
  readCopyrightPromotionScene,
} from './copyright-email-promotion-scene-state.mts'

type State = Awaited<ReturnType<typeof readCopyrightPromotionScene>>
export function copyrightPromotionStageStates(
  scene: PromotionScene,
  before: State,
  after: State,
  linkedDescendantIds: string[],
  staydown: boolean,
) {
  const { input } = scene
  const actual = after.candidate
  if (!actual)
    return {
      admitted: null,
      assessed: null,
      restricted: null,
      noticeId: undefined,
      submissionId: undefined,
    }
  const submission = actual.submissions[0]
  const currentTarget = actual.legal.targets[0]
  if (!submission || !currentTarget)
    throw new Error('Committed promotion lost its submission or target')
  const noticeId = actual.id
  const submissionId = submission.id
  const targetId = currentTarget.id
  const target = input.targets[0]!
  const { admitted, candidate, legal } = copyrightPromotionAdmittedState(
    scene,
    before,
    noticeId,
    submissionId,
    targetId,
    linkedDescendantIds,
  )
  const assessment = actual.legal.assessments[0]
  if (!assessment) return { admitted, assessed: null, restricted: null, noticeId, submissionId }
  const assessmentId = assessment.id
  const assessed = {
    ...admitted,
    candidate: {
      ...candidate,
      legal: {
        ...legal,
        assessments: [{ id: assessmentId, supersedes: null, compliant: true }],
        identities: [assessmentId],
        pointers: [{ id: submissionId, assessment: assessmentId, compliant: true }],
        events: ['notice_received', 'submission_assessed'],
      },
      assessors: [
        {
          id: assessmentId,
          submission: submissionId,
          reviewer: input.currentUser.id,
          screen: null,
        },
      ],
      audits: [
        ...candidate.audits,
        {
          kind: 'submission_assessed',
          actor: input.currentUser.id,
          assessment: assessmentId,
          restriction: null,
        },
      ],
    },
  }
  const restrictionId = after.candidate?.legal.restrictions[0]?.id
  const restrictedLegal = copyrightRestrictedRaceState(
    assessed.candidate.legal,
    { assessmentId, targetId, imposedById: input.currentUser.id },
    restrictionId,
    before.posterId,
    target.placementRevision,
    staydown,
  )
  const restricted = {
    ...assessed,
    candidate: {
      ...assessed.candidate,
      legal: {
        ...restrictedLegal,
        deliveries: [
          ...restrictedLegal.deliveries,
          'claimant_decision_notice:email:null',
        ].toSorted(),
      },
      audits: [
        ...assessed.candidate.audits,
        {
          kind: 'provisional_restriction_imposed',
          actor: input.currentUser.id,
          assessment: null,
          restriction: restrictionId,
        },
      ],
    },
    incidents: [
      ...before.incidents,
      { account: before.posterId, notice: noticeId, operative: true, disposition: null },
    ],
    provenance: [
      ...before.provenance,
      { account: before.posterId, notice: noticeId, target: targetId },
    ],
  }
  return { admitted, assessed, restricted, noticeId, submissionId }
}
