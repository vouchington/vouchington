import { beforeAll, describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { insertTestUserWarning } from '@voucha/test-helpers/entities/user-warnings'
import { listReceivedUserWarnings, listIssuedUserWarnings } from '../get.mts'
import type { PrivateUser } from '@services/users/types'

describe('listReceivedUserWarnings', () => {
  let issuer: PrivateUser
  let userWithWarnings: PrivateUser
  let userWithoutWarnings: PrivateUser

  beforeAll(async () => {
    ;[issuer, userWithWarnings, userWithoutWarnings] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])

    await Promise.all([
      insertTestUserWarning({
        userId: userWithWarnings.id,
        issuedById: issuer.id,
        reason: 'List test warning A',
      }),
      insertTestUserWarning({
        userId: userWithWarnings.id,
        issuedById: issuer.id,
        reason: 'List test warning B',
        publicMessage: 'Please read the rules.',
      }),
    ])
  })

  it('returns warnings for a user', async () => {
    const { warnings, hasNextPage } = await listReceivedUserWarnings(userWithWarnings.id)
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ public_message: 'Please read the rules.' }),
      ]),
    )
    expect(hasNextPage).toBe(false)
  })

  it('returns empty list for user with no warnings', async () => {
    const { warnings, hasNextPage } = await listReceivedUserWarnings(userWithoutWarnings.id)
    expect(warnings).toHaveLength(0)
    expect(hasNextPage).toBe(false)
  })

  it('does not include warnings belonging to other users', async () => {
    const { warnings } = await listReceivedUserWarnings(userWithoutWarnings.id)
    const userIds = warnings.map(w => w.user_id)
    for (const uid of userIds) {
      expect(uid).toBe(userWithoutWarnings.id)
    }
  })

  it('supports cursor-based pagination', async () => {
    const paginationUser = await createTestUser()
    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        insertTestUserWarning({
          userId: paginationUser.id,
          issuedById: issuer.id,
          reason: `Pagination warning ${i}`,
        }),
      ),
    )

    const firstPage = await listReceivedUserWarnings(paginationUser.id, { limit: 2 })
    expect(firstPage.warnings).toHaveLength(2)
    expect(firstPage.hasNextPage).toBe(true)
    expect(firstPage.endCursor).toBeTruthy()

    const secondPage = await listReceivedUserWarnings(paginationUser.id, {
      limit: 2,
      after: firstPage.endCursor!,
    })
    expect(secondPage.warnings).toHaveLength(1)
    expect(secondPage.hasNextPage).toBe(false)
  })

  it('accepts legacy simple cursors from previous warning pages', async () => {
    const paginationUser = await createTestUser()
    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        insertTestUserWarning({
          userId: paginationUser.id,
          issuedById: issuer.id,
          reason: `Legacy pagination warning ${i}`,
        }),
      ),
    )

    const firstPage = await listReceivedUserWarnings(paginationUser.id, { limit: 2 })
    const secondPage = await listReceivedUserWarnings(paginationUser.id, {
      limit: 2,
      after: encodeCursor({ id: firstPage.warnings.at(-1)!.id }),
    })

    expect(secondPage.warnings).toHaveLength(1)
    expect(secondPage.hasNextPage).toBe(false)
  })

  it('returns warnings ordered by created_at desc', async () => {
    const { warnings } = await listReceivedUserWarnings(userWithWarnings.id)
    for (let i = 1; i < warnings.length; i++) {
      expect(warnings[i - 1]!.created_at.getTime()).toBeGreaterThanOrEqual(
        warnings[i]!.created_at.getTime(),
      )
    }
  })

  it('rejects an invalid cursor', async () => {
    await expect(
      listReceivedUserWarnings(userWithWarnings.id, {
        after: 'invalid-cursor-value',
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a cursor scoped to another received warning list', async () => {
    await expect(
      listReceivedUserWarnings(userWithWarnings.id, {
        after: encodeCursor({
          id: crypto.randomUUID(),
          scope: `user-warnings:received:user:${userWithoutWarnings.id}:id-desc`,
        }),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe('listIssuedUserWarnings', () => {
  let issuer: PrivateUser
  let targetA: PrivateUser
  let targetB: PrivateUser

  beforeAll(async () => {
    ;[issuer, targetA, targetB] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])

    await Promise.all([
      insertTestUserWarning({
        userId: targetA.id,
        issuedById: issuer.id,
        reason: 'Issued list warning A',
      }),
      insertTestUserWarning({
        userId: targetB.id,
        issuedById: issuer.id,
        reason: 'Issued list warning B',
      }),
    ])
  })

  it('returns all warnings when no filters given', async () => {
    const { warnings } = await listIssuedUserWarnings()
    expect(warnings.length).toBeGreaterThanOrEqual(2)
  })

  it('filters warnings by userId', async () => {
    const { warnings } = await listIssuedUserWarnings({ userId: targetA.id })
    const userIds = warnings.map(w => w.user_id)
    for (const uid of userIds) {
      expect(uid).toBe(targetA.id)
    }
    expect(warnings.some(w => w.reason === 'Issued list warning A')).toBe(true)
  })

  it('does not return warnings for other users when userId filter is set', async () => {
    const { warnings } = await listIssuedUserWarnings({ userId: targetA.id })
    const ids = warnings.map(w => w.user_id)
    expect(ids).not.toContain(targetB.id)
  })

  it('includes joined community_slug and issued_by_username', async () => {
    const { warnings } = await listIssuedUserWarnings({ userId: targetA.id })
    expect(warnings[0]).toHaveProperty('community_slug')
    expect(warnings[0]).toHaveProperty('issued_by_username')
  })

  it('filters warnings by communityId', async () => {
    const communityTarget = await createTestUser()
    const communityIssuer = await createTestUser()
    const community = await insertTestCommunity({ createdById: communityIssuer.id })

    const communityWarning = await insertTestUserWarning({
      userId: communityTarget.id,
      issuedById: communityIssuer.id,
      reason: `community-filter-${crypto.randomUUID()}`,
      communityId: community.id,
    })
    const globalWarning = await insertTestUserWarning({
      userId: communityTarget.id,
      issuedById: communityIssuer.id,
      reason: `no-community-${crypto.randomUUID()}`,
      communityId: null,
    })

    const { warnings } = await listIssuedUserWarnings({
      userId: communityTarget.id,
      communityId: community.id,
    })
    const ids = warnings.map(w => w.id)
    expect(ids).toContain(communityWarning.id)
    expect(ids).not.toContain(globalWarning.id)
  })

  it('supports cursor-based pagination', async () => {
    const paginationTarget = await createTestUser()
    const paginationIssuer = await createTestUser()
    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        insertTestUserWarning({
          userId: paginationTarget.id,
          issuedById: paginationIssuer.id,
          reason: `Issued pagination warning ${i}`,
        }),
      ),
    )

    const firstPage = await listIssuedUserWarnings({ userId: paginationTarget.id, limit: 2 })
    expect(firstPage.warnings).toHaveLength(2)
    expect(firstPage.hasNextPage).toBe(true)
    expect(firstPage.endCursor).toBeTruthy()

    const secondPage = await listIssuedUserWarnings({
      userId: paginationTarget.id,
      limit: 2,
      after: firstPage.endCursor!,
    })
    expect(secondPage.warnings).toHaveLength(1)
    expect(secondPage.hasNextPage).toBe(false)
  })

  it('accepts legacy simple cursors from previous issued warning pages', async () => {
    const paginationTarget = await createTestUser()
    const paginationIssuer = await createTestUser()
    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        insertTestUserWarning({
          userId: paginationTarget.id,
          issuedById: paginationIssuer.id,
          reason: `Issued legacy pagination warning ${i}`,
        }),
      ),
    )

    const firstPage = await listIssuedUserWarnings({ userId: paginationTarget.id, limit: 2 })
    const secondPage = await listIssuedUserWarnings({
      userId: paginationTarget.id,
      limit: 2,
      after: encodeCursor({ id: firstPage.warnings.at(-1)!.id }),
    })

    expect(secondPage.warnings).toHaveLength(1)
    expect(secondPage.hasNextPage).toBe(false)
  })

  it('rejects a cursor scoped to another issued warning filter', async () => {
    await expect(
      listIssuedUserWarnings({
        userId: targetA.id,
        after: encodeCursor({
          id: crypto.randomUUID(),
          scope: `user-warnings:issued:id-desc:user:${targetB.id}:community:*`,
        }),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
