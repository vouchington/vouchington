import type { TransactionQuery } from '@data-stores/psql'
import { lockCommunityRestrictionWrites } from '../../communities/restrictions/lock.mts'
import { cleanupUserOwnedCommunities } from '../cleanup-user-communities.mts'
import { getCommunityMember } from '../../communities/members/get.mts'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { getTestPurgeCommunity } from '@voucha/test-helpers/user-purge-communities'

describe('community purge restriction lock order', () => {
  it('defers archive row locks until later-community successor fences finish', async () => {
    const owner = await createTestUserDirect()
    const successor = await createTestUserDirect()
    const communities = (
      await Promise.all([
        insertTestCommunity({ createdById: owner.id }),
        insertTestCommunity({ createdById: owner.id }),
      ])
    ).toSorted((left, right) => left.id.localeCompare(right.id))
    const archivedCommunity = communities[0]!
    const transferredCommunity = communities[1]!
    for (const community of communities) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
    }
    await insertTestCommunityMember({
      communityId: archivedCommunity.id,
      userId: successor.id,
      role: 'member',
    })
    await insertTestCommunityMember({
      communityId: transferredCommunity.id,
      userId: successor.id,
      role: 'moderator',
    })
    await using restrictionTransaction = await beginTransaction()
    await using purgeTransaction = await beginTransaction()
    const restrictionAtCommunity = Promise.withResolvers<void>()
    const allowRestrictionCommunityLock = Promise.withResolvers<void>()
    const purgeAtSuccessorFence = Promise.withResolvers<void>()
    const restrictionQuery = withQueryBarrier(
      restrictionTransaction,
      '/* lockCommunityRestrictionWrites */',
      async () => {
        restrictionAtCommunity.resolve()
        await allowRestrictionCommunityLock.promise
      },
    )
    const purgeQuery = withQueryBarrier(
      purgeTransaction,
      '/* lockUserSubjectMutationFences */',
      () => purgeAtSuccessorFence.resolve(),
    )
    const restriction = runRestriction()
    void restriction.catch(() => undefined)
    let purge: ReturnType<typeof runPurge> | undefined
    try {
      await Promise.race([
        restrictionAtCommunity.promise,
        restriction.then(err => {
          throw new Error('Restriction writer stopped before its community row lock', {
            cause: err,
          })
        }),
      ])
      purge = runPurge()
      void purge.catch(() => undefined)
      await Promise.race([
        purgeAtSuccessorFence.promise,
        purge.then(() => {
          throw new Error('Purge stopped before its successor fence')
        }),
      ])
      allowRestrictionCommunityLock.resolve()

      const [purgeResult, restrictionError] = await Promise.all([purge, restriction])
      expect(restrictionError).toMatchObject({ status: 403 })
      expect(purgeResult.afterCommit).toHaveLength(2)
      await expect(
        getCommunityMember(transferredCommunity.id, successor.id),
      ).resolves.toMatchObject({ role: 'owner' })
      await expect(getTestPurgeCommunity(archivedCommunity.id)).resolves.toMatchObject({
        archived_at: expect.any(Date),
      })
    } finally {
      allowRestrictionCommunityLock.resolve()
      await Promise.allSettled([restriction, ...(purge ? [purge] : [])])
    }

    async function runRestriction(): Promise<unknown> {
      try {
        await lockCommunityRestrictionWrites(restrictionQuery, archivedCommunity.id, successor.id)
        await restrictionTransaction.commit()
        throw new Error('Member unexpectedly received community moderation authority')
      } catch (err) {
        await restrictionTransaction.rollback()
        return err
      }
    }

    async function runPurge() {
      const result = await cleanupUserOwnedCommunities(purgeQuery, owner.id, 2)
      await purgeTransaction.commit()
      return result
    }
  })
})

function withQueryBarrier(
  query: TransactionQuery,
  marker: string,
  barrier: () => void | Promise<void>,
): TransactionQuery {
  return new Proxy(query, {
    async apply(target, thisArgument, argumentsList) {
      if (queryText(argumentsList[0]).includes(marker)) await barrier()
      return Reflect.apply(target, thisArgument, argumentsList)
    },
  })
}

function queryText(input: unknown): string {
  if (typeof input === 'string') return input
  if (typeof input === 'object' && input !== null && 'text' in input) {
    const text = input.text
    if (typeof text === 'string') return text
  }
  return ''
}
