import { randomUUID } from 'node:crypto'
import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import {
  insertMembershipRowReferencingUser,
  membershipRetainedUserReferences,
  readMembershipRetainedUserForeignKeys,
} from '../../../test-helpers/data-stores/psql/membership-retained-user-references.mts'
import { readPostgresUuidv7 } from '../../../test-helpers/data-stores/psql/schema-catalog.mts'
import {
  hasTestRetainedIdentityRoot,
  insertTestRetainedIdentityRoot,
} from '../../../test-helpers/entities/retained-identities.mts'

describe('membership lineage retained user references', () => {
  afterAll(() => onGracefulShutdown('SIGTERM'))

  it('restricts every user and actor column to the retained root with an FK-usable index', async () => {
    const foreignKeys = await readMembershipRetainedUserForeignKeys()

    for (const [table, column] of membershipRetainedUserReferences) {
      expect(foreignKeys).toContainEqual({
        column,
        deleteAction: 'r',
        indexed: true,
        table,
        target: 'retained_user_identities',
      })
    }
    expect(foreignKeys).toHaveLength(membershipRetainedUserReferences.length)
  })

  it.each(
    membershipRetainedUserReferences.filter(
      ([table, column]) => table !== 'membership_changes' || column !== 'changed_by_id',
    ),
  )('rejects %s.%s when the id has no retained identity', async (table, column) => {
    const unretainedUserId = await readPostgresUuidv7()

    await expect(
      insertMembershipRowReferencingUser([table, column], unretainedUserId),
    ).rejects.toMatchObject({
      code: '23503',
      detail: expect.stringContaining('"retained_user_identities"'),
    })
  })

  it('ensures the membership-change actor identity before inserting the ledger row', async () => {
    const actorId = randomUUID()
    await expect(hasTestRetainedIdentityRoot('user', actorId)).resolves.toBe(false)
    await insertMembershipRowReferencingUser(['membership_changes', 'changed_by_id'], actorId)
    await expect(hasTestRetainedIdentityRoot('user', actorId)).resolves.toBe(true)
  })

  it.each(membershipRetainedUserReferences)(
    'accepts %s.%s for an id that only has a retained identity',
    async (table, column) => {
      const retainedOnlyId = randomUUID()
      await insertTestRetainedIdentityRoot('user', retainedOnlyId)

      await expect(
        insertMembershipRowReferencingUser([table, column], retainedOnlyId),
      ).resolves.toBeUndefined()
    },
  )
})
