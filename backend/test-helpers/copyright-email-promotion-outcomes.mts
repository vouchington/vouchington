import { expect } from 'vitest'
import { promoteCopyrightEmailIntake } from '../services/copyright-notices/email-promotion.mts'
import { isCopyrightStaydownMatchingEnabled } from '../services/copyright-notices/config.mts'
import {
  readCopyrightPromotionScene,
  type PromotionScene,
} from './copyright-email-promotion-scene-state.mts'
import { copyrightPromotionStageStates } from './copyright-email-promotion-stage-states.mts'

export function copyrightPromotionResult(result: PromiseSettledResult<unknown>) {
  if (result.status === 'fulfilled') return { status: 'fulfilled', value: result.value }
  const failure = result.reason as {
    status?: number
    code?: string
    message?: string
    cause?: { code?: string; message?: string }
  }
  return {
    status: 'rejected',
    statusCode: failure.status,
    code: failure.code,
    message: failure.message,
    causeCode: failure.cause?.code,
    ...(failure.cause?.code === '23514' ? { causeMessage: failure.cause.message } : {}),
  }
}
export const copyrightPromotionAdmissionAbort = {
  status: 'rejected',
  statusCode: 409,
  code: 'copyright_email_thread_changed',
  message: 'Copyright email changed during admission',
  causeCode: '40001',
}
export const copyrightPromotionAssessmentAbort = {
  status: 'rejected',
  statusCode: 409,
  code: 'CONFLICT',
  message: 'Conflicting copyright assessment',
  causeCode: '40001',
}
export const copyrightPromotionEnforcementAbort = {
  status: 'rejected',
  statusCode: 409,
  code: 'copyright_email_thread_changed',
  message: 'Copyright email changed during promotion',
  causeCode: '40001',
}
export const copyrightPromotionConcurrentDecision = {
  status: 'rejected',
  statusCode: 409,
  code: undefined,
  message: 'Copyright email intake was decided concurrently',
  causeCode: undefined,
}

/** One actual promotion: admission/assessment/enforcement each commit fully or leave the previous stage. */
export async function assertCopyrightPromotionOutcome(
  scene: PromotionScene,
  options: {
    linkedDescendantIds?: string[]
    logs?: () => unknown[][]
    overflow?: { event: string; observedRows: number }
  } = {},
) {
  const before = await readCopyrightPromotionScene(scene)
  const staydown = await isCopyrightStaydownMatchingEnabled()
  const [result] = await Promise.allSettled([promoteCopyrightEmailIntake(scene.input)])
  const after = await readCopyrightPromotionScene(scene)
  const stages = copyrightPromotionStageStates(
    scene,
    before,
    after,
    options.linkedDescendantIds ?? [],
    staydown,
  )
  const logs = options.overflow
    ? [
        [
          options.overflow.event,
          { noticeId: stages.noticeId, observedRows: options.overflow.observedRows },
        ],
      ]
    : []
  expect([
    { outcome: copyrightPromotionAdmissionAbort, state: before, logs: [] },
    { outcome: copyrightPromotionAssessmentAbort, state: stages.admitted, logs },
    { outcome: copyrightPromotionEnforcementAbort, state: stages.assessed, logs },
    {
      outcome: {
        status: 'fulfilled',
        value: { noticeId: stages.noticeId, submissionId: stages.submissionId },
      },
      state: stages.restricted,
      logs,
    },
  ]).toContainEqual({
    outcome: copyrightPromotionResult(result!),
    state: after,
    logs: options.logs?.() ?? [],
  })
}

/** Guard failure and SSI in the guard both leave all parent/receipt/reference/case facts unchanged. */
export async function assertCopyrightPromotionGuard(scene: PromotionScene, message: string) {
  const before = await readCopyrightPromotionScene(scene)
  const [result] = await Promise.allSettled([promoteCopyrightEmailIntake(scene.input)])
  expect([
    { outcome: copyrightPromotionAdmissionAbort, state: before },
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: undefined,
        message,
        causeCode: undefined,
      },
      state: before,
    },
  ]).toContainEqual({
    outcome: copyrightPromotionResult(result!),
    state: await readCopyrightPromotionScene(scene),
  })
}

/** A replay starts with complete committed authority; no prior racing success is assumed. */
export async function assertCopyrightPromotionReplay(
  scene: PromotionScene,
  expected: { noticeId: string; submissionId: string },
  logs: () => unknown[][],
  overflow: { event: string; observedRows: number },
) {
  const before = await readCopyrightPromotionScene(scene)
  const [result] = await Promise.allSettled([promoteCopyrightEmailIntake(scene.input)])
  expect([
    { outcome: copyrightPromotionAdmissionAbort, state: before, logs: [] },
    {
      outcome: { status: 'fulfilled', value: expected },
      state: before,
      logs: [
        [overflow.event, { noticeId: expected.noticeId, observedRows: overflow.observedRows }],
      ],
    },
  ]).toContainEqual({
    outcome: copyrightPromotionResult(result!),
    state: await readCopyrightPromotionScene(scene),
    logs: logs(),
  })
}
