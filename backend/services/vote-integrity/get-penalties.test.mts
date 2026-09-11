import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUser,
  insertTestPost,
  insertTestVoteIntegrityFlag,
  insertTestVoteWeightPenaltyRecord,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { getVoteWeightPenalties, getVoteWeightPenaltyByIdFromPrimary } from './get-penalties.mts'

describe('getVoteWeightPenalties', () => {
  const randomUsername = () => `test-vi-list-${randomBytes(4).toString('hex')}`
  const randomSlug = () => `test-vi-list-${randomBytes(6).toString('hex')}`
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true, username: randomUsername() })
  }, 60_000)

  it('gets one penalty by ID and returns null for an unknown ID', async () => {
    const user = await createTestUser({ username: randomUsername() })
    const penaltyId = await insertTestVoteWeightPenaltyRecord({
      userId: user.id,
      createdById: admin.id,
    })
    await expect(getVoteWeightPenaltyByIdFromPrimary(penaltyId)).resolves.toMatchObject({
      id: penaltyId,
      user_id: user.id,
      reason: 'voting_ring',
    })
    await expect(getVoteWeightPenaltyByIdFromPrimary(uuidv7())).resolves.toBeNull()
  }, 60_000)

  it('preserves all-source behavior when source is omitted', async () => {
    const user = await createTestUser({ username: randomUsername() })
    const ringId = await insertTestVoteWeightPenaltyRecord({
      userId: user.id,
      createdById: admin.id,
    })
    const referralId = await insertTestVoteWeightPenaltyRecord({
      userId: user.id,
      createdById: admin.id,
      reason: 'referral_link_in_post',
    })

    const result = await getVoteWeightPenalties({ userId: user.id })
    expect(result.results.map(penalty => penalty.id)).toEqual(
      expect.arrayContaining([ringId, referralId]),
    )
  }, 60_000)

  it('defines source=flag by voting_ring reason and supports source flag filtering', async () => {
    const user = await createTestUser({ username: randomUsername() })
    const postId = await insertTestPost({
      title: `Vote penalty ${randomSlug()}`,
      slug: randomSlug(),
      createdById: user.id,
      markdown: 'test',
    })
    const flagId = await insertTestVoteIntegrityFlag({ postId })
    const expectedId = await insertTestVoteWeightPenaltyRecord({
      userId: user.id,
      createdById: admin.id,
      sourceFlagId: flagId,
    })
    const sourceDeletedAuditId = await insertTestVoteWeightPenaltyRecord({
      userId: user.id,
      createdById: admin.id,
    })
    await insertTestVoteWeightPenaltyRecord({
      userId: user.id,
      createdById: admin.id,
      reason: 'referral_link_in_post',
    })

    const flagRows = await getVoteWeightPenalties({ userId: user.id, source: 'flag' })
    expect(flagRows.results.map(penalty => penalty.id)).toEqual(
      expect.arrayContaining([expectedId, sourceDeletedAuditId]),
    )
    expect(flagRows.results.every(penalty => penalty.reason === 'voting_ring')).toBe(true)

    const oneFlag = await getVoteWeightPenalties({
      userId: user.id,
      source: 'flag',
      sourceFlagId: flagId,
    })
    expect(oneFlag.results).toEqual([expect.objectContaining({ id: expectedId })])
  }, 60_000)

  it('uses scoped opaque cursors with exact limit-plus-one pagination', async () => {
    const user = await createTestUser({ username: randomUsername() })
    const insertedIds = []
    for (let index = 0; index < 3; index += 1) {
      insertedIds.push(
        await insertTestVoteWeightPenaltyRecord({ userId: user.id, createdById: admin.id }),
      )
    }

    const first = await getVoteWeightPenalties({ userId: user.id, source: 'flag', limit: 2 })
    const expectedIds = insertedIds.toSorted().toReversed()
    expect(first.results.map(penalty => penalty.id)).toEqual(expectedIds.slice(0, 2))
    expect(first.page_info.has_next_page).toBe(true)

    const second = await getVoteWeightPenalties({
      userId: user.id,
      source: 'flag',
      limit: 2,
      after: first.page_info.end_cursor!,
    })
    expect(second.results.map(penalty => penalty.id)).toEqual(expectedIds.slice(2))
    expect(second.page_info.has_next_page).toBe(false)
    await expect(
      getVoteWeightPenalties({ userId: user.id, limit: 2, after: first.page_info.end_cursor! }),
    ).rejects.toMatchObject({ status: 400 })
  }, 60_000)

  it('accepts a legacy simple cursor but rejects a wrong-scope scoped cursor', async () => {
    const user = await createTestUser({ username: randomUsername() })
    const ids = await Promise.all([
      insertTestVoteWeightPenaltyRecord({ userId: user.id, createdById: admin.id }),
      insertTestVoteWeightPenaltyRecord({ userId: user.id, createdById: admin.id }),
    ])
    const sortedIds = ids.toSorted().toReversed()
    const legacy = await getVoteWeightPenalties({
      userId: user.id,
      source: 'flag',
      after: encodeCursor({ id: sortedIds[0] }),
    })
    expect(legacy.results.map(penalty => penalty.id)).toEqual(sortedIds.slice(1))
    await expect(
      getVoteWeightPenalties({
        userId: user.id,
        source: 'flag',
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
    const partialId = await insertTestVoteWeightPenaltyRecord({
      userId: partialUser!.id,
      createdById: admin.id,
    })
    const exactIds = await Promise.all([
      insertTestVoteWeightPenaltyRecord({ userId: exactUser!.id, createdById: admin.id }),
      insertTestVoteWeightPenaltyRecord({ userId: exactUser!.id, createdById: admin.id }),
    ])

    const empty = await getVoteWeightPenalties({
      userId: emptyUser!.id,
      source: 'flag',
      limit: 2,
    })
    expect(empty).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      filter_scope: { source: 'flag', source_flag_id: null },
    })
    const partial = await getVoteWeightPenalties({
      userId: partialUser!.id,
      source: 'flag',
      limit: 2,
    })
    expect(partial.results.map(penalty => penalty.id)).toEqual([partialId])
    expect(partial.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(partial.page_info.start_cursor).not.toBeNull()
    const exact = await getVoteWeightPenalties({
      userId: exactUser!.id,
      source: 'flag',
      limit: 2,
    })
    expect(exact.results.map(penalty => penalty.id)).toEqual(exactIds.toSorted().toReversed())
    expect(exact.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(exact.page_info.start_cursor).not.toBeNull()
  }, 60_000)

  it('adds exact flag filter scope only for source=flag responses', async () => {
    const user = await createTestUser({ username: randomUsername() })
    await insertTestVoteWeightPenaltyRecord({ userId: user.id, createdById: admin.id })
    const filtered = await getVoteWeightPenalties({ userId: user.id, source: 'flag' })
    expect(filtered.filter_scope).toEqual({ source: 'flag', source_flag_id: null })
    const allSources = await getVoteWeightPenalties({ userId: user.id })
    expect(allSources).not.toHaveProperty('filter_scope')
  }, 60_000)
})
