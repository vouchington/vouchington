import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestRewardsProgramStatus } from '@voucha/test-helpers'
import {
  deleteIndividualDuringInsertForTest,
  deleteRewardsProgramStatusTopicDuringInsertForTest,
} from '@voucha/test-helpers/postgres-fk-target-race'
import {
  createIndividualRewardsProgramStatus,
  getIndividualRewardsProgramStatuses,
  updateIndividualRewardsProgramStatusById,
} from './rewards-program-statuses.mts'

describe('rewards program status database failures', () => {
  it('returns not found when a status topic is deleted during the insert FK check', async () => {
    const user = await createTestUser()
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    const outcome = await deleteRewardsProgramStatusTopicDuringInsertForTest(
      '/* createIndividualRewardsProgramStatus */',
      statusId,
      () => createIndividualRewardsProgramStatus(user, user, statusId),
    )

    expect(outcome).toMatchObject({ error: { status: 404, message: 'Topic not found' } })
  })

  it('preserves the former validation response when the owner FK fails during insert', async () => {
    const user = await createTestUser()
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    const outcome = await deleteIndividualDuringInsertForTest(
      '/* createIndividualRewardsProgramStatus */',
      user.individual_id!,
      () => createIndividualRewardsProgramStatus(user, user, statusId),
    )

    expect(outcome).toMatchObject({
      error: { status: 422, message: 'Invalid rewards_program_status_topic_id' },
    })
  })

  it('rejects a malformed topic ID before creating a status and leaves owned statuses unchanged', async () => {
    const user = await createTestUser()
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    const existing = await createIndividualRewardsProgramStatus(user, user, statusId)

    await expect(
      createIndividualRewardsProgramStatus(user, user, 'not-a-uuid'),
    ).rejects.toMatchObject({ status: 422, message: 'Invalid UUID' })

    expect((await getIndividualRewardsProgramStatuses(user, user)).results).toEqual([existing])
  })

  it('preserves a malformed-ID database error when updating valid dates and leaves existing dates unchanged', async () => {
    const user = await createTestUser()
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    const created = await createIndividualRewardsProgramStatus(user, user, statusId)
    const existing = await updateIndividualRewardsProgramStatusById(user, user, created.id, {
      started_on: '2026-01-01',
      expires_on: '2026-12-31',
    })

    await expect(
      updateIndividualRewardsProgramStatusById(user, user, 'not-a-uuid', {
        started_on: '2026-02-01',
        expires_on: '2026-11-30',
      }),
    ).rejects.toMatchObject({ code: '22P02' })

    expect(
      (await getIndividualRewardsProgramStatuses(user, user, { limit: 100 })).results.find(
        status => status.id === created.id,
      ),
    ).toEqual(existing)
  })
})
