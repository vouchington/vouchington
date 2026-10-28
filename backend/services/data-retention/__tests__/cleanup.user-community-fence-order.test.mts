import type { TransactionQuery } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { cleanupUserOwnedCommunities } from '../cleanup-user-communities.mts'

describe('community purge fence order', () => {
  it('fences every successor in ascending user order before locking any community row', async () => {
    const owner = await createTestUserDirect()
    const successors = (
      await Promise.all([createTestUserDirect(), createTestUserDirect()])
    ).toSorted((left, right) => left.id.localeCompare(right.id))
    const communities = (
      await Promise.all([1, 2, 3].map(() => insertTestCommunity({ createdById: owner.id })))
    ).toSorted((left, right) => left.id.localeCompare(right.id))
    for (const community of communities) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
    }
    // The lowest community id gets the highest successor id, so community order is the wrong fence order.
    await insertTestCommunityMember({
      communityId: communities[0]!.id,
      userId: successors[1]!.id,
      role: 'moderator',
    })
    await insertTestCommunityMember({
      communityId: communities[1]!.id,
      userId: successors[0]!.id,
      role: 'moderator',
    })

    await using transaction = await beginTransaction()
    const statements: { text: string; values: unknown[] }[] = []
    const recording = new Proxy(transaction, {
      apply(target, thisArgument, argumentsList: unknown[]) {
        const input = argumentsList[0]
        if (typeof input === 'string') statements.push({ text: input, values: [] })
        else if (typeof input === 'object' && input !== null && 'text' in input)
          statements.push({
            text: String(input.text),
            values: 'values' in input && Array.isArray(input.values) ? input.values : [],
          })
        return Reflect.apply(target, thisArgument, argumentsList)
      },
    }) as TransactionQuery
    const page = await cleanupUserOwnedCommunities(recording, owner.id, 3)
    await transaction.commit()

    const index = (marker: string) => statements.findIndex(({ text }) => text.includes(marker))
    const sortedIds = successors.map(user => user.id)
    expect(statements[index('/* lockUserSubjectMutationFences */')]!.values).toEqual([sortedIds])
    expect(statements[index('/* lockActiveUserSubjectsForMutation */')]!.values).toEqual([
      sortedIds,
    ])
    const archiveLock = index('/* cleanupUserOwnedCommunities:lockForArchive */')
    expect(archiveLock).toBeGreaterThan(-1)
    const fences = [
      '/* lockUserSubjectMutationFences */',
      '/* lockActiveUserSubjectsForMutation */',
      '/* lockCommunityMembershipRoles */',
      '/* lockCommunityUserPairs */',
    ].map(index)
    expect(fences).toEqual(fences.toSorted((left, right) => left - right))
    const transfer = index('/* transferCommunityOwnership */')
    expect(transfer).toBeGreaterThan(-1)
    expect(Math.max(...fences)).toBeLessThan(Math.min(transfer, archiveLock))
    expect(Math.min(...fences)).toBeGreaterThan(-1)
    expect(page.processed).toBe(3)
  })
})
