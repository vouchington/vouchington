import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestPost,
  createTestUser,
  hardDeleteTestPost,
  hardDeleteTestUser,
  hasTestRetainedIdentityRoot,
} from '@voucha/test-helpers'
import {
  insertTestRetainedUserAuditRow,
  retainedUserAuditReferences,
} from '@voucha/test-helpers/entities/retained-user-audit-references'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'

// The OAuth server event log is append-only, so its rows cannot be removed to release a root.
const postOwnedAuditReferences = retainedUserAuditReferences.filter(
  ({ table }) => table !== 'oauth_authorization_server_events',
)

describe('retained user root cleanup with audit references', () => {
  it.each(postOwnedAuditReferences)(
    'keeps the user root while a $table row names it and reclaims it once the post is gone',
    async ({ table }) => {
      const actor = await createTestUser()
      const post = await createTestPost()
      await using query = await beginTransaction()
      await insertTestRetainedUserAuditRow(query, table, actor.id, post.id)
      await query.commit()
      await hardDeleteTestUser(actor.id)

      await cleanupRetainedIdentityRoots(1_000, { user: [actor.id] })
      expect(await hasTestRetainedIdentityRoot('user', actor.id)).toBe(true)

      await hardDeleteTestPost(post.id)
      await cleanupRetainedIdentityRoots(1_000, { user: [actor.id] })
      expect(await hasTestRetainedIdentityRoot('user', actor.id)).toBe(false)
    },
  )
})
