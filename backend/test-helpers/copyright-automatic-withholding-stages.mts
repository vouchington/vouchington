import { expect } from 'vitest'
import type {
  AutomaticNotice,
  readAutomaticWithholdingState,
} from './copyright-automatic-withholding-state.mts'

type State = Awaited<ReturnType<typeof readAutomaticWithholdingState>>
export function automaticRefusalState(notice: AutomaticNotice, before: State, reason: string) {
  return {
    ...before,
    refusals: [
      { submission: notice.intake.copyright_notice_submission_id, reason, at: expect.any(Date) },
    ],
    dispatches: [],
  }
}

/** Assessment admission and enforcement are distinct TXs, with current automated authority retained. */
export function automaticDecisionStages(
  notice: AutomaticNotice,
  before: State,
  after: State,
  staydown: boolean,
  human?: { id: string; rationale: string },
) {
  const assessment = after.assessors[0]
  if (!assessment) return { assessed: null, restricted: null }
  const target = before.effective.state.targets[0]
  if (!target) throw new Error('Owned automatic decision lost its target')
  const submissionId = notice.intake.copyright_notice_submission_id
  const noticeId = notice.intake.copyright_notice_id
  const reviewer = human?.id ?? null
  const assessed = {
    ...before,
    clock: expect.any(Date),
    assessors: [
      {
        id: assessment.id,
        submission: submissionId,
        at: expect.any(Date),
        reviewer,
        screen: human ? null : before.screeningId,
      },
    ],
    reviews: human
      ? [
          {
            intake: notice.intake.id,
            reviewer: human.id,
            accepted: true,
            rationale: human.rationale,
          },
        ]
      : before.reviews,
    dispatches: human ? [] : before.dispatches,
    effective: {
      ...before.effective,
      state: {
        ...before.effective.state,
        assessments: [{ id: assessment.id, supersedes: null, compliant: true }],
        identities: [assessment.id],
        pointers: [{ id: submissionId, assessment: assessment.id, compliant: true }],
        events: [...before.effective.state.events, 'submission_assessed'].toSorted(),
      },
    },
  }
  const restriction = after.effective.state.restrictions[0]
  if (!restriction) return { assessed, restricted: null }
  const action = after.effective.state.actions.find(
    row => row.restriction === restriction.id && row.action === 'withhold',
  )
  const restricted = {
    ...assessed,
    notice: {
      ...before.notice,
      accepted_at: expect.any(Date),
      provisional_withholding_at: expect.any(Date),
    },
    dispatches: [],
    proofs: [
      { id: restriction.id, assessment: assessment.id, automated: !human, imposedBy: reviewer },
    ],
    effective: {
      ...assessed.effective,
      accounts: human
        ? before.effective.accounts.map(account => ({
            ...account,
            incidents: [
              ...account.incidents,
              { notice: noticeId, operative: true, disposition: null },
            ].toSorted((a, b) => a.notice.localeCompare(b.notice)),
          }))
        : before.effective.accounts,
      provenance: human
        ? [...before.effective.provenance, { account: before.posterId, target: target.id }]
        : before.effective.provenance,
      state: {
        ...assessed.effective.state,
        accepted: true,
        provisional: true,
        restrictions: [
          {
            id: restriction.id,
            target: target.id,
            assessment: assessment.id,
            lifted: null,
            review: human ? 'confirm' : null,
            reviewer,
          },
        ],
        actions: [
          {
            id: action?.id,
            restriction: restriction.id,
            deadline: null,
            revision: target.placement_revision,
            action: 'withhold',
            state: 'pending',
          },
        ],
        events: [...assessed.effective.state.events, 'provisional_restriction_imposed'].toSorted(),
        deliveries: [
          ...assessed.effective.state.deliveries,
          `claimant_decision_notice:email:${before.claimantId}`,
          `claimant_decision_notice:in_app:${before.claimantId}`,
          `poster_restriction_notice:email:${before.posterId}`,
          `poster_restriction_notice:in_app:${before.posterId}`,
        ].toSorted(),
        correspondence: [
          ...assessed.effective.state.correspondence,
          'decision_notice',
          'restriction_notice',
        ].toSorted(),
        incidents: human ? 1 : 0,
        staydown: human && staydown ? 1 : 0,
      },
    },
  }
  return { assessed, restricted }
}
