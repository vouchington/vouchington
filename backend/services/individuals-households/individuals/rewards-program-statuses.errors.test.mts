import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestRewardsProgramStatus } from '@voucha/test-helpers'
import {
  createIndividualRewardsProgramStatus,
  getIndividualRewardsProgramStatusById,
  getIndividualRewardsProgramStatuses,
  updateIndividualRewardsProgramStatusById,
} from './rewards-program-statuses.mts'

describe('rewards program status database failures', () => {
  it('preserves a malformed-ID database error when creating a status and leaves owned statuses unchanged', async () => {
    const user = await createTestUser()
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    const existing = await createIndividualRewardsProgramStatus(user, user, statusId)

    await expect(
      createIndividualRewardsProgramStatus(user, user, 'not-a-uuid'),
    ).rejects.toMatchObject({ code: '22P02' })

    expect((await getIndividualRewardsProgramStatuses(user, user)).results).toEqual([existing])
  })

  it('preserves a malformed-ID database error when updating valid dates and leaves existing dates unchanged', async () => {
    const user = await createTestUser()
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    const created = await createIndividualRewardsProgramStatus(user, user, statusId)
    const existing = await updateIndividualRewardsProgramStatusById(user, user, created.id, {
      since: '2026-01-01',
      until: '2026-12-31',
    })

    await expect(
      updateIndividualRewardsProgramStatusById(user, user, 'not-a-uuid', {
        since: '2026-02-01',
        until: '2026-11-30',
      }),
    ).rejects.toMatchObject({ code: '22P02' })

    expect(
      await getIndividualRewardsProgramStatusById(user, user, created.id, { readOnly: false }),
    ).toEqual(existing)
  })
})
