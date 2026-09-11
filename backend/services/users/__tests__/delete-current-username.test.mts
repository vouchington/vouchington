import { describe, expect, it, vi } from 'vitest'
import { v7 } from 'uuid'
import { createTestUser, updateUserUsername } from '@voucha/test-helpers'
import { getUserDeletionCompletionAuditForTest } from '../../user-deletions/lifecycle.test-support.mts'
import { deleteUser } from '../delete.mts'

describe('deleteUser durable cleanup identity', () => {
  it('uses the username captured under the deletion row lock for durable cleanup', async () => {
    const user = await createTestUser()
    const currentUsername = `deletion-current-${v7()}`
    await updateUserUsername(user.id, currentUsername)

    const attempt = await deleteUser(user, user)
    const audit = await getUserDeletionCompletionAuditForTest(attempt.requestId)

    expect(audit.priorUsername).toBe(currentUsername)
    expect(audit.externalWorks.map(work => work.workKey)).toEqual(
      expect.arrayContaining([`user:${user.id}`, `user:${currentUsername}`]),
    )
  })

  it('completes durable cache work after the immediate purge succeeds', async () => {
    const user = await createTestUser()
    const currentUsername = `deletion-purge-${v7()}`
    await updateUserUsername(user.id, currentUsername)
    const purgeCacheTags = vi.fn<(tags: readonly string[]) => Promise<void>>(async () => {})

    const attempt = await deleteUser(user, user, { purgeCacheTags })
    const audit = await getUserDeletionCompletionAuditForTest(attempt.requestId)

    expect(purgeCacheTags).toHaveBeenCalledWith([`user:${user.id}`, `user:${currentUsername}`])
    expect(audit.externalWorks).toHaveLength(2)
    expect(audit.externalWorks.every(work => work.completedAt instanceof Date)).toBe(true)
  })

  it('leaves durable cache work pending when the immediate purge fails', async () => {
    const user = await createTestUser()
    const purgeCacheTags = vi.fn<(tags: readonly string[]) => Promise<void>>(async () => {
      throw new Error('Cloudflare unavailable')
    })

    const attempt = await deleteUser(user, user, { purgeCacheTags })
    const audit = await getUserDeletionCompletionAuditForTest(attempt.requestId)

    expect(purgeCacheTags).toHaveBeenCalledWith([
      `user:${user.id}`,
      `user:${user.username?.toLowerCase()}`,
    ])
    expect(audit.externalWorks).toHaveLength(2)
    expect(audit.externalWorks.every(work => work.completedAt === null)).toBe(true)
  })
})
