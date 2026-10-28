import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestPostgresBackendProcessId,
  lockTestUserMutation,
  restoreUser,
  softDeleteTestUserAndWaitBeforeCommit,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { createPost } from '../create.mts'

describe('createPost deleted author lifecycle', () => {
  it('rejects creation after a concurrent author deletion commits', async () => {
    const author = await createTestUser()
    const releaseDeletion = Promise.withResolvers<void>()
    const deletionHoldsAuthorLifecycle = Promise.withResolvers<void>()
    let deleting: Promise<void> | undefined
    let creationOutcome: Promise<unknown> | undefined
    let deletionBackendId = 0

    try {
      deleting = softDeleteTestUserAndWaitBeforeCommit(
        author.id,
        releaseDeletion.promise,
        deletionHoldsAuthorLifecycle.resolve,
        async query => {
          deletionBackendId = await getTestPostgresBackendProcessId(query)
          await lockTestUserMutation(query, author.id)
          await lockAuthorPublicationLifecycle(query, author.id)
        },
      )
      await deletionHoldsAuthorLifecycle.promise

      creationOutcome = withTestOwnedPostgresWait(
        {
          holderProcessId: deletionBackendId,
          pool: 'write',
          lock: { kind: 'advisory', key: author.id },
          queryMarker: 'lockActiveUserSubjectsForMutation',
          releaseHolder: async () => {
            releaseDeletion.resolve()
            await deleting
          },
        },
        async waitForLock => {
          const creating = createPost(author, WEB_PROVENANCE, {
            title: 'Creation blocked by concurrent author deletion',
            markdown: 'This post must not be created after the author is deleted.',
            post_type: 'discussion',
          })
          await waitForLock(creating)
          releaseDeletion.resolve()
          await deleting
          return creating.catch((err: unknown) => err)
        },
      )

      await expect(creationOutcome).resolves.toMatchObject({
        status: 409,
        message: 'Author is not active',
      })
    } finally {
      releaseDeletion.resolve()
      await deleting?.catch(() => undefined)
      await creationOutcome
      await restoreUser(author.id)
    }
  })
})
