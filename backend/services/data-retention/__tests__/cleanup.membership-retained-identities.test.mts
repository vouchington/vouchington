import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'

import { hasTestRetainedIdentityRoot, insertTestRetainedIdentityRoot } from '@voucha/test-helpers'
import {
  insertMembershipRowReferencingUser,
  membershipRetainedUserReferences,
} from '@voucha/test-helpers/data-stores/psql/membership-retained-user-references'

import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'

describe('retained user identity cleanup for membership lineage', () => {
  it.each(membershipRetainedUserReferences)(
    'keeps a root referenced only by %s.%s',
    async (table, column) => {
      const id = v7()
      await insertTestRetainedIdentityRoot('user', id)
      await insertMembershipRowReferencingUser([table, column], id)

      await cleanupRetainedIdentityRoots(1_000, { user: [id] })
      expect(await hasTestRetainedIdentityRoot('user', id)).toBe(true)
    },
  )
})
