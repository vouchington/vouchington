import { beginTransaction, createTestPost, createTestUser } from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'
import { lockPostPublication } from './lock.mts'
import { recordAuthorDeletionBeforePostReassignment } from './capture-deletions.mts'

describe('recordAuthorDeletionBeforePostReassignment', () => {
  it('takes post publication scopes before waiting on the deletion preimage', async () => {
    const author = await createTestUser()
    if (!author) throw new Error('Expected author')
    const post = await createTestPost({ user: author })
    const rowLocked = Promise.withResolvers<void>()
    const releaseRow = Promise.withResolvers<void>()
    const holder = holdPostRow(post.id, rowLocked, releaseRow)
    await rowLocked.promise

    const capture = captureAuthorDeletion(author.id)
    try {
      await vi.waitFor(async () => {
        await expect(probePostPublicationLock(post.id)).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseRow.resolve()
    }
    await holder
    await expect(capture).resolves.toBeUndefined()
  })
})

async function holdPostRow(
  postId: string,
  locked: PromiseWithResolvers<void>,
  release: PromiseWithResolvers<void>,
) {
  await using query = await beginTransaction()
  await query(`SELECT 1 FROM posts WHERE id = $1::uuid FOR UPDATE`, [postId])
  locked.resolve()
  await release.promise
  await query.commit()
}
async function captureAuthorDeletion(authorId: string) {
  await using query = await beginTransaction()
  await recordAuthorDeletionBeforePostReassignment(query, authorId)
  await query.commit()
}
async function probePostPublicationLock(postId: string) {
  await using query = await beginTransaction()
  await query(`SET LOCAL lock_timeout = '50ms'`)
  await lockPostPublication(query, postId)
  await query.commit()
}
