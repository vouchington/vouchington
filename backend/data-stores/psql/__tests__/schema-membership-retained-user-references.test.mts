import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  insertMembershipRowReferencingUser,
  membershipRetainedUserReferences,
  readMembershipRetainedUserForeignKeys,
} from '../../../test-helpers/data-stores/psql/membership-retained-user-references.mts'
import { insertTestRetainedIdentityRoot } from '../../../test-helpers/entities/retained-identities.mts'
import { onGracefulShutdown, read } from '../index.mts'

describe('membership lineage retained user references', () => {
  afterAll(onGracefulShutdown)

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

  it.each(membershipRetainedUserReferences)(
    'rejects %s.%s when the id has no retained identity',
    async (table, column) => {
      const { rows } = await read<{ id: string }>(
        '/* readUnretainedUserId */ SELECT uuidv7() AS id',
      )

      await expect(
        insertMembershipRowReferencingUser([table, column], rows[0]!.id),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining('"retained_user_identities"'),
      })
    },
  )

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
