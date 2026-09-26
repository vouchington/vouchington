import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  isTestAuthorPublicationLifecycleLockWaiting,
  restoreUser,
  softDeleteTestUserAndWaitBeforeCommit,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { createPost } from '../create.mts'

describe('createPost deleted author lifecycle', () => {
  it('rejects creation after a concurrent author deletion commits', async () => {
    const author = await createTestUser()
    const releaseDeletion = Promise.withResolvers<void>()
    const deletionHoldsAuthorLifecycle = Promise.withResolvers<void>()
    let deleting: Promise<void> | undefined
    let creationOutcome: Promise<unknown> | undefined

    try {
      deleting = softDeleteTestUserAndWaitBeforeCommit(
        author.id,
        releaseDeletion.promise,
        deletionHoldsAuthorLifecycle.resolve,
        async query => {
          await lockAuthorPublicationLifecycle(query, author.id)
        },
      )
      await deletionHoldsAuthorLifecycle.promise

      creationOutcome = createPost(WEB_PROVENANCE, author, {
        title: 'Creation blocked by concurrent author deletion',
        markdown: 'This post must not be created after the author is deleted.',
        post_type: 'discussion',
      }).catch((error: unknown) => error)
      await vi.waitFor(async () => {
        await expect(isTestAuthorPublicationLifecycleLockWaiting(author.id)).resolves.toBe(true)
      })
      releaseDeletion.resolve()

      await expect(deleting).resolves.toBeUndefined()
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
