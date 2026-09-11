import { createTestUser, insertTestRewardsProgramStatus } from '@voucha/test-helpers'
import { it, expect, beforeAll, describe } from 'vitest'
import {
  getIndividualRewardsProgramStatuses,
  getIndividualRewardsProgramStatusById,
  createIndividualRewardsProgramStatus,
  updateIndividualRewardsProgramStatusById,
  deleteIndividualRewardsProgramStatusById,
} from './rewards-program-statuses.mts'
import type { PrivateUser } from '@services/users/types'
import { encodeCursor } from '@modules/pagination'

describe('rewards-program-statuses.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('createIndividualRewardsProgramStatus - creates a status', async () => {
    const statusId = await insertTestRewardsProgramStatus({
      createdById: user.id,
    })
    const status = await createIndividualRewardsProgramStatus(user, user, statusId)

    expect(status).toBeDefined()
    expect(status.rewards_program_status).toBeDefined()
    expect(status.rewards_program_status.id).toBe(statusId)
  })

  it('createIndividualRewardsProgramStatus - requires authentication', async () => {
    const statusId = await insertTestRewardsProgramStatus({
      createdById: user.id,
    })
    await expect(createIndividualRewardsProgramStatus(null, user, statusId)).rejects.toThrow(Error)
  })

  it('getIndividualRewardsProgramStatuses - returns all statuses', async () => {
    const statusId = await insertTestRewardsProgramStatus({
      createdById: user.id,
    })
    const created = await createIndividualRewardsProgramStatus(user, user, statusId)
    const statuses = await getIndividualRewardsProgramStatuses(user, user)

    expect(statuses).toBeDefined()
    expect(statuses.results.length).toBeGreaterThan(0)
    expect(statuses.results.some(s => s.id === created.id)).toBe(true)
  })

  it('paginates in ascending ID order without gaps and rejects scoped cursors', async () => {
    const paginationUser = await createTestUser()
    const topicId = await insertTestRewardsProgramStatus({ createdById: paginationUser.id })
    await createIndividualRewardsProgramStatus(paginationUser, paginationUser, topicId)
    await createIndividualRewardsProgramStatus(paginationUser, paginationUser, topicId)
    const first = await getIndividualRewardsProgramStatuses(paginationUser, paginationUser, {
      limit: 1,
    })
    expect(first.results).toHaveLength(1)
    expect(first.page_info.has_next_page).toBe(true)
    const second = await getIndividualRewardsProgramStatuses(paginationUser, paginationUser, {
      limit: 1,
      after: first.page_info.end_cursor!,
    })
    expect(second.results).toHaveLength(1)
    expect(second.results[0]?.id.localeCompare(first.results[0]?.id ?? '')).toBeGreaterThan(0)
    await expect(
      getIndividualRewardsProgramStatuses(paginationUser, paginationUser, {
        after: 'not-a-cursor',
      }),
    ).rejects.toThrow('Invalid rewards program status cursor')
    const otherUser = await createTestUser()
    await expect(
      getIndividualRewardsProgramStatuses(otherUser, otherUser, {
        after: first.page_info.end_cursor!,
      }),
    ).rejects.toThrow('Invalid rewards program status cursor')
    await expect(
      getIndividualRewardsProgramStatuses(paginationUser, paginationUser, {
        after: encodeCursor({
          id: first.results[0]!.id,
          scope: `my-point-valuations:wrong:id-asc`,
        }),
      }),
    ).rejects.toThrow('Invalid rewards program status cursor')
  })

  it('getIndividualRewardsProgramStatusById - returns specific status', async () => {
    const statusId = await insertTestRewardsProgramStatus({
      createdById: user.id,
    })
    const created = await createIndividualRewardsProgramStatus(user, user, statusId)
    const retrieved = await getIndividualRewardsProgramStatusById(user, user, created.id)

    expect(retrieved).toBeDefined()
    expect(retrieved?.id).toBe(created.id)
    expect(retrieved?.rewards_program_status.id).toBe(statusId)
  })

  it('updateIndividualRewardsProgramStatusById - updates status dates', async () => {
    const statusId = await insertTestRewardsProgramStatus({
      createdById: user.id,
    })
    const created = await createIndividualRewardsProgramStatus(user, user, statusId)
    const since = '2024-01-01'
    const until = '2024-12-31'

    const updated = await updateIndividualRewardsProgramStatusById(user, user, created.id, {
      since,
      until,
    })

    expect(updated).toBeDefined()
    expect(updated.since).toBe(since)
    expect(updated.until).toBe(until)
    expect(updated.rewards_program_status).toBeDefined()
    expect(updated.rewards_program_status.id).toBe(statusId)
  })

  it('updateIndividualRewardsProgramStatusById - throws 404 for unknown id', async () => {
    await expect(
      updateIndividualRewardsProgramStatusById(user, user, '00000000-0000-7000-8000-000000000000', {
        since: '2024-01-01',
      }),
    ).rejects.toThrow(Error)
  })

  it('deleteIndividualRewardsProgramStatusById - throws 404 for unknown id', async () => {
    await expect(
      deleteIndividualRewardsProgramStatusById(user, user, '00000000-0000-7000-8000-000000000000'),
    ).rejects.toThrow(Error)
  })

  it('createIndividualRewardsProgramStatus - throws 422 for invalid rewards_program_status_id', async () => {
    await expect(
      createIndividualRewardsProgramStatus(user, user, '00000000-0000-7000-8000-000000000001'),
    ).rejects.toThrow(Error)
  })

  it('updateIndividualRewardsProgramStatusById - throws 422 when since > until', async () => {
    const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
    const created = await createIndividualRewardsProgramStatus(user, user, statusId)
    await expect(
      updateIndividualRewardsProgramStatusById(user, user, created.id, {
        since: '2024-12-31',
        until: '2024-01-01',
      }),
    ).rejects.toThrow(Error)
  })

  it.each(['since', 'until'] as const)(
    'updateIndividualRewardsProgramStatusById - rejects impossible %s calendar dates',
    async field => {
      const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
      const created = await createIndividualRewardsProgramStatus(user, user, statusId)

      await expect(
        updateIndividualRewardsProgramStatusById(
          user,
          user,
          created.id,
          field === 'since' ? { since: '2026-02-31' } : { until: '2026-02-31' },
        ),
      ).rejects.toMatchObject({ status: 422 })
    },
  )

  it('deleteIndividualRewardsProgramStatusById - deletes status', async () => {
    const statusId = await insertTestRewardsProgramStatus({
      createdById: user.id,
    })
    const created = await createIndividualRewardsProgramStatus(user, user, statusId)
    const deleted = await deleteIndividualRewardsProgramStatusById(user, user, created.id)

    expect(deleted).toBeDefined()
    expect(deleted.id).toBe(created.id)

    const retrieved = await getIndividualRewardsProgramStatusById(user, user, created.id)
    expect(retrieved).toBeUndefined()
  })
})
