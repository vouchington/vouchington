import { expect } from 'vitest'
import type { PrivateUser } from '../services/users/types.mts'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import { createTestHistoricalEuDecisionWindow } from './copyright-territorial-historical-window.mts'
import {
  createTestThreadedTerritorialComplaintEmail,
  readTestTerritorialComplaintEmailRecords,
} from './copyright-territorial-complaint-email.mts'
import {
  assertRetainedGuestComplaint,
  retainedGuestComplaintInput,
} from './copyright-retained-guest-complaint-outcome.mts'
import { readRetainedGuestComplaintState } from './copyright-retained-guest-complaint-state.mts'
import { seedRetainedGuestComplaintAdmission } from './copyright-retained-guest-complaint-seed.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'

async function historicalComplaint(offset: number) {
  const scene = await createTestHistoricalEuDecisionWindow()
  const receivedAt = new Date(scene.windowEndsAt.getTime() + offset)
  const email = await createTestThreadedTerritorialComplaintEmail({
    noticeId: scene.noticeId,
    senderEmail: scene.notifierEmail,
    receivedAt,
  })
  // Staff admission happens after the period; only inbound receipt time establishes timeliness.
  expect(receivedAt.getTime()).toBeLessThan(Date.now())
  return { ...scene, ...email }
}

/** The actual timely admission runs once; all source, review, evidence, case and cutoff facts are atomic. */
export async function assertTimelyHistoricalComplaint(staff: PrivateUser) {
  const actor = await historicalComplaint(-1000)
  await assertRetainedGuestComplaint(staff, actor.noticeId, actor.intake)

  // Independent committed facts keep the positive date/identity contract unconditional after SSI.
  const committed = await historicalComplaint(-1000)
  const admitted = await seedRetainedGuestComplaintAdmission(
    retainedGuestComplaintInput(staff, committed.intake.id),
  )
  const records = await readTestTerritorialComplaintEmailRecords(committed.noticeId)
  expect(records.requests).toMatchObject([
    { submitted_by_id: null, received_at: committed.receivedAt },
  ])
  expect(records.submissions).toMatchObject([
    { id: admitted.submissionId, kind: 'complaint', received_at: committed.receivedAt },
  ])
}

/** The late actor never writes; an independent borrowed producer proves the cutoff even after SSI. */
export async function assertLateHistoricalComplaint(staff: PrivateUser) {
  const actor = await historicalComplaint(1000)
  const before = await readRetainedGuestComplaintState(actor.noticeId, actor.intake)
  const [result] = await Promise.allSettled([
    admitCopyrightEmailCorrespondence(retainedGuestComplaintInput(staff, actor.intake.id)),
  ])
  const after = await readRetainedGuestComplaintState(actor.noticeId, actor.intake)
  expect([
    {
      outcome: {
        status: 'rejected',
        statusCode: 422,
        code: undefined,
        message: 'The complaint period for this decision has ended',
        causeCode: undefined,
      },
      state: before,
    },
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Conflicting copyright case change',
        causeCode: '40001',
      },
      state: before,
    },
  ]).toContainEqual({ outcome: copyrightRaceResult(result!), state: after })
  expect(await readTestTerritorialComplaintEmailRecords(actor.noticeId)).toEqual({
    requests: [],
    submissions: [],
  })

  const probe = await historicalComplaint(1000)
  const probeBefore = await readRetainedGuestComplaintState(probe.noticeId, probe.intake)
  await expect(
    seedRetainedGuestComplaintAdmission(retainedGuestComplaintInput(staff, probe.intake.id)),
  ).rejects.toMatchObject({
    status: 422,
    message: 'The complaint period for this decision has ended',
  })
  expect(await readRetainedGuestComplaintState(probe.noticeId, probe.intake)).toEqual(probeBefore)
  expect(await readTestTerritorialComplaintEmailRecords(probe.noticeId)).toEqual({
    requests: [],
    submissions: [],
  })
}
