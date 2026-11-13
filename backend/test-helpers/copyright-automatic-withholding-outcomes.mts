import { expect } from 'vitest'
import { applyNonSpamSignedInCopyrightFormScreening } from '../services/copyright-notices/form-screenings.mts'
import { reviewCopyrightFormIntake } from '../services/copyright-notices/form-reviews.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import {
  readAutomaticWithholdingState,
  type AutomaticNotice,
} from './copyright-automatic-withholding-state.mts'
import {
  automaticDecisionStages,
  automaticRefusalState,
} from './copyright-automatic-withholding-stages.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import type { AutomaticWithholdingRefusalReason } from '../services/copyright-notices/automatic-withholding-gates.mts'

function voidOutcome(result: PromiseSettledResult<unknown>) {
  return result.status === 'fulfilled'
    ? { status: 'fulfilled', value: result.value }
    : copyrightRaceResult(result)
}

/** One real workflow invocation; a failed enforcement preserves only its complete automated assessment. */
export async function assertAutomaticWithholdingOutcome(
  notice: AutomaticNotice,
  expected: AutomaticWithholdingRefusalReason | 'off' | 'sticky' | null,
) {
  const before = await readAutomaticWithholdingState(notice)
  const [result] = await Promise.allSettled([
    applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id),
  ])
  const after = await readAutomaticWithholdingState(notice)
  const success = { status: 'fulfilled', value: undefined }
  const stages = automaticDecisionStages(
    notice,
    before,
    after,
    await isCopyrightStaydownMatchingEnabled(),
  )
  const abort = { outcome: nativeCopyrightSerializationConflict, state: before }
  const allowed =
    expected === 'off'
      ? [{ outcome: success, state: before }]
      : expected === 'sticky'
        ? [abort, { outcome: success, state: before }]
        : expected
          ? [abort, { outcome: success, state: automaticRefusalState(notice, before, expected) }]
          : [
              abort,
              { outcome: nativeCopyrightSerializationConflict, state: stages.assessed },
              { outcome: success, state: stages.restricted },
            ]
  expect(allowed).toContainEqual({ outcome: voidOutcome(result!), state: after })
  expect(after.clock.getTime()).toBeGreaterThanOrEqual(before.clock.getTime())
}

/** Moderator acceptance is independent of an earlier racing cap refusal, and preserves that sticky fact. */
export async function assertModeratorAcceptsAutomaticRefusal(
  notice: AutomaticNotice,
  input: Omit<Parameters<typeof reviewCopyrightFormIntake>[0], 'intakeId'>,
) {
  const before = await readAutomaticWithholdingState(notice)
  const [result] = await Promise.allSettled([
    reviewCopyrightFormIntake({ ...input, intakeId: notice.intake.id }),
  ])
  const after = await readAutomaticWithholdingState(notice)
  const stages = automaticDecisionStages(
    notice,
    before,
    after,
    await isCopyrightStaydownMatchingEnabled(),
    { id: input.currentUser.id, rationale: input.rationale },
  )
  const conflict = {
    status: 'rejected',
    statusCode: 409,
    code: 'CONFLICT',
    message: 'Conflicting copyright case change',
    causeCode: '40001',
  }
  expect([
    { outcome: conflict, state: before },
    { outcome: conflict, state: stages.assessed },
    {
      outcome: {
        status: 'fulfilled',
        value: {
          noticeId: notice.intake.copyright_notice_id,
          submissionId: notice.intake.copyright_notice_submission_id,
          is_accepted: true,
        },
      },
      state: stages.restricted,
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
  expect(after.clock.getTime()).toBeGreaterThanOrEqual(before.clock.getTime())
}

/** SERIAL cap admission permits at most one committed automated assessment; enforcement may still abort. */
export async function assertConcurrentAutomaticClaimantCap(
  notices: [AutomaticNotice, AutomaticNotice],
) {
  const before = await Promise.all(notices.map(readAutomaticWithholdingState))
  expect(before[0]!.claimantId).toBe(before[1]!.claimantId)
  for (const state of before) {
    expect(state.assessors).toEqual([])
    expect(state.refusals).toEqual([])
    expect(state.effective.state.restrictions).toEqual([])
  }
  const results = await Promise.allSettled(
    notices.map(notice =>
      applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id),
    ),
  )
  const after = await Promise.all(notices.map(readAutomaticWithholdingState))
  for (const [index, state] of after.entries())
    expect(state.clock.getTime()).toBeGreaterThanOrEqual(before[index]!.clock.getTime())
  const staydown = await isCopyrightStaydownMatchingEnabled()
  const first = automaticDecisionStages(notices[0], before[0]!, after[0]!, staydown)
  const second = automaticDecisionStages(notices[1], before[1]!, after[1]!, staydown)
  const empty0 = { outcome: nativeCopyrightSerializationConflict, state: before[0] }
  const empty1 = { outcome: nativeCopyrightSerializationConflict, state: before[1] }
  const assessed0 = { outcome: nativeCopyrightSerializationConflict, state: first.assessed }
  const assessed1 = { outcome: nativeCopyrightSerializationConflict, state: second.assessed }
  const restricted0 = {
    outcome: { status: 'fulfilled', value: undefined },
    state: first.restricted,
  }
  const restricted1 = {
    outcome: { status: 'fulfilled', value: undefined },
    state: second.restricted,
  }
  const refused0 = {
    outcome: { status: 'fulfilled', value: undefined },
    state: automaticRefusalState(notices[0], before[0]!, 'claimant_daily_cap'),
  }
  const refused1 = {
    outcome: { status: 'fulfilled', value: undefined },
    state: automaticRefusalState(notices[1], before[1]!, 'claimant_daily_cap'),
  }
  expect([
    [empty0, empty1],
    [empty0, assessed1],
    [assessed0, empty1],
    [empty0, restricted1],
    [restricted0, empty1],
    [assessed0, refused1],
    [refused0, assessed1],
    [restricted0, refused1],
    [refused0, restricted1],
  ]).toContainEqual(
    results.map((result, index) => ({ outcome: voidOutcome(result), state: after[index] })),
  )
}
