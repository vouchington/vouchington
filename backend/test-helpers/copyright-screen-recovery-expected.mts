import { expect } from 'vitest'
import type { ScreenRecoveryScene } from './copyright-screen-recovery-fixtures.mts'
import type { ScreenRecoveryState } from './copyright-screen-recovery-state.mts'

export function screenAssessedState(
  before: ScreenRecoveryState,
  scene: ScreenRecoveryScene,
  id: string | undefined,
  rejected = false,
): ScreenRecoveryState {
  const submissionId = scene.notice.intake.copyright_notice_submission_id
  const previous = before.effective.state.pointers.find(row => row.id === submissionId)!.assessment
  const keys = rejected ? ['not_accepted'] : []
  return {
    ...before,
    assessments: [
      ...before.assessments,
      {
        id: id!,
        reviewer: rejected ? scene.moderator.id : null,
        screening: rejected ? null : scene.screeningId,
      },
    ],
    misuse: rejected
      ? [...before.misuse, { outcome: 'notice_rejected', assessment: id!, restriction: null }]
      : before.misuse,
    decisions: [
      ...before.decisions,
      ...keys.flatMap(event => [
        `copyright-decision:${scene.notice.intake.copyright_notice_id}:${event}:claimant`,
        `copyright-decision:${scene.notice.intake.copyright_notice_id}:${event}:claimant:email`,
      ]),
    ].toSorted(),
    formEffects: rejected ? [] : before.formEffects,
    enforcement: rejected ? [] : [id!],
    reviewRecovery:
      rejected &&
      before.effective.state.restrictions.some(row => row.lifted === null && row.review === null)
        ? [scene.notice.intake.id]
        : [],
    effective: {
      ...before.effective,
      misuse: rejected
        ? [...before.effective.misuse, { restriction: null, outcome: 'notice_rejected' }]
        : before.effective.misuse,
      state: {
        ...before.effective.state,
        assessments: [
          ...before.effective.state.assessments,
          { id: id!, supersedes: previous, compliant: !rejected },
        ],
        identities: [...before.effective.state.identities, id!].toSorted(),
        pointers: before.effective.state.pointers.map(row =>
          row.id === submissionId ? { ...row, assessment: id!, compliant: !rejected } : row,
        ),
        events: [...before.effective.state.events, 'submission_assessed'].toSorted(),
        deliveries: rejected
          ? [
              ...before.effective.state.deliveries,
              `claimant_decision_notice:email:${scene.claimant.id}`,
              `claimant_decision_notice:in_app:${scene.claimant.id}`,
            ].toSorted()
          : before.effective.state.deliveries,
        correspondence: rejected
          ? [...before.effective.state.correspondence, 'decision_notice' as const].toSorted()
          : before.effective.state.correspondence,
      },
    },
  }
}

export function screenRestrictedState(
  before: ScreenRecoveryState,
  scene: ScreenRecoveryScene,
  assessmentId: string | undefined,
  restrictionId: string | undefined,
  index = 0,
): ScreenRecoveryState {
  const target = before.effective.state.targets[index]!
  const key = `copyright-decision:${scene.notice.intake.copyright_notice_id}:restricted:claimant`
  const claimant = !before.decisions.includes(key)
  return {
    ...before,
    enforcement: [],
    formEffects: [],
    decisions: claimant ? [...before.decisions, key, `${key}:email`].toSorted() : before.decisions,
    effective: {
      ...before.effective,
      state: {
        ...before.effective.state,
        accepted: true,
        provisional: true,
        restrictions: [
          ...before.effective.state.restrictions,
          {
            id: restrictionId!,
            target: target.id,
            assessment: assessmentId!,
            lifted: null,
            review: null,
            reviewer: null,
          },
        ],
        actions: [
          ...before.effective.state.actions,
          {
            id: expect.any(String),
            restriction: restrictionId!,
            deadline: null,
            revision: target.placement_revision,
            action: 'withhold' as const,
            state: 'pending' as const,
          },
        ],
        events: [...before.effective.state.events, 'provisional_restriction_imposed'].toSorted(),
        correspondence: [
          ...before.effective.state.correspondence,
          'restriction_notice' as const,
          ...(claimant ? ['decision_notice' as const] : []),
        ].toSorted(),
        deliveries: [
          ...before.effective.state.deliveries,
          `poster_restriction_notice:email:${scene.poster.id}`,
          `poster_restriction_notice:in_app:${scene.poster.id}`,
          ...(claimant
            ? [
                `claimant_decision_notice:email:${scene.claimant.id}`,
                `claimant_decision_notice:in_app:${scene.claimant.id}`,
              ]
            : []),
        ].toSorted(),
      },
    },
  }
}

export function screenReversedState(
  before: ScreenRecoveryState,
  scene: ScreenRecoveryScene,
): ScreenRecoveryState {
  const restrictions = before.effective.state.restrictions.filter(
    row => row.lifted === null && row.review === null,
  )
  if (restrictions.length === 0) return before
  const key = `copyright-decision:${scene.notice.intake.copyright_notice_id}:reversed:claimant`
  return {
    ...before,
    reviewRecovery: [],
    decisions: [...before.decisions, key, `${key}:email`].toSorted(),
    effective: {
      ...before.effective,
      state: {
        ...before.effective.state,
        restrictions: before.effective.state.restrictions.map(row =>
          restrictions.some(value => value.id === row.id)
            ? { ...row, review: 'reverse' as const, reviewer: scene.moderator.id }
            : row,
        ),
        actions: [
          ...before.effective.state.actions,
          ...restrictions.map(row => ({
            id: expect.any(String),
            restriction: row.id,
            deadline: null,
            revision: before.effective.state.targets.find(target => target.id === row.target)!
              .placement_revision,
            action: 'restore' as const,
            state: 'pending' as const,
          })),
        ],
        events: [
          ...before.effective.state.events,
          ...restrictions.map(() => 'reversal_restoration_intent_created'),
        ].toSorted(),
        correspondence: [
          ...before.effective.state.correspondence,
          'decision_notice' as const,
          'decision_notice' as const,
        ].toSorted(),
        deliveries: [
          ...before.effective.state.deliveries,
          `poster_review_notice:email:${scene.poster.id}`,
          `poster_review_notice:in_app:${scene.poster.id}`,
          `claimant_decision_notice:email:${scene.claimant.id}`,
          `claimant_decision_notice:in_app:${scene.claimant.id}`,
        ].toSorted(),
      },
    },
  }
}
