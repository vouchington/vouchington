import { expect } from 'vitest'
import type { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import type {
  admitAndAssociateCopyrightEmail,
  failRestorationAndAdmitCopyrightEmail,
} from './copyright-admission-association-race.mts'
import { readCopyrightAdmissionAssociationState } from './copyright-admission-association-state.mts'
import {
  expectedCopyrightAdmissionState,
  expectedCopyrightAssociationState,
  copyrightAdmissionConflict,
  copyrightAssociationConflict,
} from './copyright-admission-association-expected.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'

type Input = Parameters<typeof admitCopyrightEmailCorrespondence>[0]
type State = Awaited<ReturnType<typeof readCopyrightAdmissionAssociationState>>
const result = (value: PromiseSettledResult<unknown>) =>
  value.status === 'fulfilled' ? value : copyrightRaceResult(value)

/** No fixed winner: each public result must match every authoritative legal stage. */
export async function assertCopyrightAdmissionAssociationRace(input: {
  admission: Input
  associatedId: string
  before: State
  result: Awaited<ReturnType<typeof admitAndAssociateCopyrightEmail>>
}) {
  const noticeId = input.before.aggregate.notice.id
  const after = await readCopyrightAdmissionAssociationState(
    noticeId,
    input.admission.intakeId,
    input.associatedId,
  )
  const submissionId = after.aggregate.submissions.find(
    row => !input.before.aggregate.submissions.some(prior => prior.id === row.id),
  )?.id
  const correspondenceId = after.aggregate.correspondence.find(
    row => row.copyright_notice_email_intake_id === input.admission.intakeId,
  )?.id
  expect([
    {
      admission: {
        status: 'fulfilled',
        value: { noticeId, submissionId, correspondenceId, isDuplicate: false },
      },
      association: copyrightAssociationConflict,
      state: expectedCopyrightAdmissionState(input.before, after, input.admission),
    },
    {
      admission: copyrightAdmissionConflict,
      association: {
        status: 'fulfilled',
        value: {
          copyright_notice: { id: noticeId },
          copyright_email_intake: { id: input.associatedId },
        },
      },
      state: expectedCopyrightAssociationState(
        input.before,
        input.admission.currentUser.id,
        input.associatedId,
      ),
    },
    {
      admission: copyrightAdmissionConflict,
      association: copyrightAssociationConflict,
      state: input.before,
    },
  ]).toContainEqual({
    admission: result(input.result.admission),
    association: result(input.result.association),
    state: after,
  })
}

/** The failed lease or the filing owns all its effects; neither may leak an intermediate stage. */
export async function assertCopyrightFailureAdmissionRace(input: {
  admission: Input
  restoreId: string
  failure: Parameters<typeof failRestorationAndAdmitCopyrightEmail>[2]
  before: State
  result: Awaited<ReturnType<typeof failRestorationAndAdmitCopyrightEmail>>
}) {
  const noticeId = input.before.aggregate.notice.id
  const after = await readCopyrightAdmissionAssociationState(noticeId, input.admission.intakeId)
  const submissionId = after.aggregate.submissions.find(
    row => !input.before.aggregate.submissions.some(prior => prior.id === row.id),
  )?.id
  const correspondenceId = after.aggregate.correspondence.find(
    row => row.copyright_notice_email_intake_id === input.admission.intakeId,
  )?.id
  const failed = {
    ...input.before,
    aggregate: {
      ...input.before.aggregate,
      actionIntents: input.before.aggregate.actionIntents.map(row =>
        row.id === input.restoreId
          ? {
              ...row,
              state: 'pending',
              updated_at: expect.any(Date),
              completed_at: null,
              completed_at_reason: null,
              failure_message: input.failure.failureMessage,
              leased_at: null,
              lease_token: null,
              lease_expires_at: null,
              available_at: new Date(
                input.failure.failedAt.getTime() + 60_000 * 2 ** (row.attempt_count - 1),
              ),
            }
          : row,
      ),
    },
    legal: {
      ...input.before.legal,
      actions: input.before.legal.actions.map(row =>
        row.id === input.restoreId ? { ...row, state: 'pending' } : row,
      ),
    },
    attempts: input.before.attempts.map(row =>
      row.work === input.restoreId ? { ...row, failed: true } : row,
    ),
  }
  expect([
    {
      failure: { status: 'fulfilled', value: 'retrying' },
      admission: copyrightAdmissionConflict,
      state: failed,
    },
    {
      failure: nativeCopyrightSerializationConflict,
      admission: {
        status: 'fulfilled',
        value: { noticeId, submissionId, correspondenceId, isDuplicate: false },
      },
      state: expectedCopyrightAdmissionState(input.before, after, input.admission),
    },
    {
      failure: nativeCopyrightSerializationConflict,
      admission: copyrightAdmissionConflict,
      state: input.before,
    },
  ]).toContainEqual({
    failure: result(input.result.outcome),
    admission: result(input.result.admission),
    state: after,
  })
}
