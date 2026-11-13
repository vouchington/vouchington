import { expect } from 'vitest'
import { hashToken } from '@modules/token-secrets'
import { promoteCopyrightEmailIntake } from '../services/copyright-notices/email-promotion.mts'
import { COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE } from '../services/copyright-notices/email-thread-references.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import { linkCopyrightEmailIntakeToNotice } from './copyright-email-intake-link.mts'
import { commitCopyrightWritersInOrder } from './copyright-form-review-assessment-race.mts'
import {
  readCopyrightPromotionScene,
  type PromotionScene,
} from './copyright-email-promotion-scene-state.mts'
import { copyrightPromotionStageStates } from './copyright-email-promotion-stage-states.mts'
import {
  copyrightPromotionResult,
  copyrightPromotionAdmissionAbort,
  copyrightPromotionAssessmentAbort,
  copyrightPromotionEnforcementAbort,
  copyrightPromotionConcurrentDecision,
} from './copyright-email-promotion-outcomes.mts'

/** RC thread insertion may win, replay false, or lose its receipt guard; promotion's legal stages stay atomic. */
export async function assertCopyrightPromotionThreadRace(
  scene: PromotionScene,
  parentId: string,
  reference: string,
  order: 'simultaneous' | 'review-before-link',
) {
  const before = await readCopyrightPromotionScene(scene)
  const staydown = await isCopyrightStaydownMatchingEnabled()
  const promote = () => promoteCopyrightEmailIntake(scene.input)
  const link = () =>
    linkCopyrightEmailIntakeToNotice({
      intakeId: scene.input.intakeId,
      noticeId: parentId,
      linkKind: 'thread',
      matchedReference: reference,
    })
  const [promotion, thread] =
    order === 'simultaneous'
      ? await Promise.allSettled([promote(), link()])
      : await commitCopyrightWritersInOrder(
          promote,
          link,
          'promoteCopyrightEmailIntake:evidence',
          'linkCopyrightEmailIntakeToNotice',
          scene.input.intakeId,
          [scene.input.intakeId, scene.input.targets[0]!.placementId],
        )
  const after = await readCopyrightPromotionScene(scene)
  const stages = copyrightPromotionStageStates(scene, before, after, [], staydown)
  const completed = {
    status: 'fulfilled',
    value: { noticeId: stages.noticeId, submissionId: stages.submissionId },
  }
  const noLink = { status: 'fulfilled', value: false }
  const guardedLink = {
    status: 'rejected',
    statusCode: 409,
    code: 'copyright_email_thread_changed',
    message: 'Copyright email thread changed; retry staff approval',
    causeCode: '23514',
    causeMessage: 'reviewed copyright email intake cannot be linked as thread correspondence',
  }
  const threadWon = {
    ...before,
    links: [
      ...before.links,
      {
        intake: scene.input.intakeId,
        notice: parentId,
        kind: 'thread',
        action: 'pending',
        matched: hashToken(COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE, reference),
      },
    ],
    clocks: before.clocks.map(row =>
      row.id === parentId ? { ...row, at: expect.any(Date) } : row,
    ),
  }
  // A committed review excludes the RC thread link even if assessment/enforcement later aborts.
  // If admission aborts, the ordinary thread writer may acquire the parent with no orphan case.
  expect([
    { promotion: completed, thread: noLink, state: stages.restricted },
    { promotion: completed, thread: guardedLink, state: stages.restricted },
    { promotion: copyrightPromotionAssessmentAbort, thread: noLink, state: stages.admitted },
    { promotion: copyrightPromotionAssessmentAbort, thread: guardedLink, state: stages.admitted },
    { promotion: copyrightPromotionEnforcementAbort, thread: noLink, state: stages.assessed },
    { promotion: copyrightPromotionEnforcementAbort, thread: guardedLink, state: stages.assessed },
    {
      promotion: copyrightPromotionAdmissionAbort,
      thread: { status: 'fulfilled', value: true },
      state: threadWon,
    },
    {
      promotion: {
        status: 'rejected',
        statusCode: 409,
        code: undefined,
        message: 'Thread-linked copyright email cannot be approved as an initial intake',
        causeCode: undefined,
      },
      thread: { status: 'fulfilled', value: true },
      state: threadWon,
    },
    {
      promotion: {
        status: 'rejected',
        statusCode: 409,
        code: undefined,
        message: 'Copyright email intake was linked concurrently',
        causeCode: undefined,
      },
      thread: { status: 'fulfilled', value: true },
      state: threadWon,
    },
  ]).toContainEqual({
    promotion: copyrightPromotionResult(promotion!),
    thread: copyrightPromotionResult(thread!),
    state: after,
  })
}

/** Both promotion snapshots precede the first decision commit, but either invocation can lose SSI. */
export async function assertCopyrightSameReceiptPromotions(scene: PromotionScene) {
  const before = await readCopyrightPromotionScene(scene)
  const staydown = await isCopyrightStaydownMatchingEnabled()
  const [first, second] = await commitCopyrightWritersInOrder(
    () => promoteCopyrightEmailIntake(scene.input),
    () => promoteCopyrightEmailIntake(scene.input),
    'promoteCopyrightEmailIntake:review',
    'promoteCopyrightEmailIntake:currentDecision',
    scene.input.intakeId,
    [scene.input.intakeId, scene.input.targets[0]!.placementId],
  )
  const after = await readCopyrightPromotionScene(scene)
  const stages = copyrightPromotionStageStates(scene, before, after, [], staydown)
  const completed = {
    status: 'fulfilled',
    value: { noticeId: stages.noticeId, submissionId: stages.submissionId },
  }
  expect([
    {
      first: copyrightPromotionAdmissionAbort,
      second: copyrightPromotionAdmissionAbort,
      state: before,
    },
    {
      first: copyrightPromotionAdmissionAbort,
      second: copyrightPromotionAssessmentAbort,
      state: stages.admitted,
    },
    {
      first: copyrightPromotionAdmissionAbort,
      second: copyrightPromotionEnforcementAbort,
      state: stages.assessed,
    },
    { first: copyrightPromotionAdmissionAbort, second: completed, state: stages.restricted },
    {
      first: copyrightPromotionAssessmentAbort,
      second: copyrightPromotionAdmissionAbort,
      state: stages.admitted,
    },
    {
      first: copyrightPromotionAssessmentAbort,
      second: copyrightPromotionConcurrentDecision,
      state: stages.admitted,
    },
    {
      first: copyrightPromotionEnforcementAbort,
      second: copyrightPromotionAdmissionAbort,
      state: stages.assessed,
    },
    {
      first: copyrightPromotionEnforcementAbort,
      second: copyrightPromotionConcurrentDecision,
      state: stages.assessed,
    },
    { first: completed, second: copyrightPromotionAdmissionAbort, state: stages.restricted },
    { first: completed, second: copyrightPromotionConcurrentDecision, state: stages.restricted },
  ]).toContainEqual({
    first: copyrightPromotionResult(first),
    second: copyrightPromotionResult(second),
    state: after,
  })
}
