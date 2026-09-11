import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUser,
  insertTestReportAbusePenalty,
  insertTestReportIntegrityFlag,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { getReportAbusePenalties, getReportAbusePenaltyByIdFromPrimary } from './get-penalties.mts'

describe('getReportAbusePenalties', () => {
  const randomUsername = () => `test-ri-list-${randomBytes(4).toString('hex')}`
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true, username: randomUsername() })
  }, 60_000)

  it('gets one penalty by ID and returns null for an unknown ID', async () => {
    const user = await createTestUser({ username: randomUsername() })
    const penaltyId = await insertTestReportAbusePenalty({
      userId: user.id,
      createdById: admin.id,
    })
    await expect(getReportAbusePenaltyByIdFromPrimary(penaltyId)).resolves.toMatchObject({
      id: penaltyId,
      user_id: user.id,
      reason: 'mass_report_campaign',
    })
    await expect(getReportAbusePenaltyByIdFromPrimary(uuidv7())).resolves.toBeNull()
  }, 60_000)

  it('returns active, revoked, and unfiltered penalty lists', async () => {
    const user = await createTestUser({ username: randomUsername() })
    const activeId = await insertTestReportAbusePenalty({ userId: user.id, createdById: admin.id })
    const revokedId = await insertTestReportAbusePenalty({
      userId: user.id,
      createdById: admin.id,
      revokedAt: new Date(),
      revokedById: admin.id,
    })

    await expect(getReportAbusePenalties({ userId: user.id })).resolves.toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ id: activeId, revoked_at: null }),
        expect.objectContaining({ id: revokedId, revoked_by_id: admin.id }),
      ]),
    })
    await expect(
      getReportAbusePenalties({ userId: user.id, status: 'active' }),
    ).resolves.toMatchObject({ results: [expect.objectContaining({ id: activeId })] })
    await expect(
      getReportAbusePenalties({ userId: user.id, status: 'revoked' }),
    ).resolves.toMatchObject({ results: [expect.objectContaining({ id: revokedId })] })
  }, 60_000)

  it('filters by user and source flag', async () => {
    const [user, otherUser] = await Promise.all([
      createTestUser({ username: randomUsername() }),
      createTestUser({ username: randomUsername() }),
    ])
    const [flagId, otherFlagId] = await Promise.all([
      insertTestReportIntegrityFlag({
        reportedUserId: otherUser!.id,
        reporterUserIds: [user!.id],
      }),
      insertTestReportIntegrityFlag({
        reportedUserId: user!.id,
        reporterUserIds: [otherUser!.id],
      }),
    ])
    const expectedId = await insertTestReportAbusePenalty({
      userId: user!.id,
      createdById: admin.id,
      sourceFlagId: flagId,
    })
    await insertTestReportAbusePenalty({
      userId: otherUser!.id,
      createdById: admin.id,
      sourceFlagId: otherFlagId,
    })

    const result = await getReportAbusePenalties({ userId: user!.id, sourceFlagId: flagId })
    expect(result.results).toEqual([expect.objectContaining({ id: expectedId })])
  }, 60_000)

  it('uses scoped opaque cursors with exact limit-plus-one pagination', async () => {
    const user = await createTestUser({ username: randomUsername() })
    const insertedIds = []
    for (let index = 0; index < 3; index += 1) {
      insertedIds.push(
        await insertTestReportAbusePenalty({ userId: user.id, createdById: admin.id }),
      )
    }

    const first = await getReportAbusePenalties({ userId: user.id, limit: 2 })
    const expectedIds = insertedIds.toSorted().toReversed()
    expect(first.results.map(penalty => penalty.id)).toEqual(expectedIds.slice(0, 2))
    expect(first.page_info.has_next_page).toBe(true)
    expect(first.page_info.end_cursor).not.toBeNull()

    const second = await getReportAbusePenalties({
      userId: user.id,
      limit: 2,
      after: first.page_info.end_cursor!,
    })
    expect(second.results.map(penalty => penalty.id)).toEqual(expectedIds.slice(2))
    expect(second.page_info.has_next_page).toBe(false)
    await expect(
      getReportAbusePenalties({ status: 'active', limit: 2, after: first.page_info.end_cursor! }),
    ).rejects.toMatchObject({ status: 400 })
  }, 60_000)

  it('accepts a legacy simple cursor but rejects a wrong-scope scoped cursor', async () => {
    const user = await createTestUser({ username: randomUsername() })
    const ids = await Promise.all([
      insertTestReportAbusePenalty({ userId: user.id, createdById: admin.id }),
      insertTestReportAbusePenalty({ userId: user.id, createdById: admin.id }),
    ])
    const sortedIds = ids.toSorted().toReversed()
    const legacy = await getReportAbusePenalties({
      userId: user.id,
      after: encodeCursor({ id: sortedIds[0] }),
    })
    expect(legacy.results.map(penalty => penalty.id)).toEqual(sortedIds.slice(1))
    await expect(
      getReportAbusePenalties({
        userId: user.id,
        after: encodeScopedUuidCursor(sortedIds[0]!, 'wrong-scope'),
      }),
    ).rejects.toMatchObject({ status: 400 })
  }, 60_000)

  it('returns terminal page info for empty, partial, and exact-limit pages', async () => {
    const [emptyUser, partialUser, exactUser] = await Promise.all([
      createTestUser({ username: randomUsername() }),
      createTestUser({ username: randomUsername() }),
      createTestUser({ username: randomUsername() }),
    ])
    const partialId = await insertTestReportAbusePenalty({
      userId: partialUser!.id,
      createdById: admin.id,
    })
    const exactIds = await Promise.all([
      insertTestReportAbusePenalty({ userId: exactUser!.id, createdById: admin.id }),
      insertTestReportAbusePenalty({ userId: exactUser!.id, createdById: admin.id }),
    ])

    await expect(getReportAbusePenalties({ userId: emptyUser!.id, limit: 2 })).resolves.toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    const partial = await getReportAbusePenalties({ userId: partialUser!.id, limit: 2 })
    expect(partial.results.map(penalty => penalty.id)).toEqual([partialId])
    expect(partial.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(partial.page_info.start_cursor).not.toBeNull()
    const exact = await getReportAbusePenalties({ userId: exactUser!.id, limit: 2 })
    expect(exact.results.map(penalty => penalty.id)).toEqual(exactIds.toSorted().toReversed())
    expect(exact.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(exact.page_info.start_cursor).not.toBeNull()
  }, 60_000)
})
