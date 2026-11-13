import { afterEach, describe, expect, it, vi } from 'vitest'
import { v7 } from 'uuid'
import { createTestUser, updateUserUsername } from '@voucha/test-helpers'
import { getUserDeletionCompletionAuditForTest } from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import * as cachePurge from '@services/entity-cache/purge'
import { deleteUser } from '../delete.mts'

describe('deleteUser durable cleanup identity', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the username captured under the deletion row lock for durable cleanup', async () => {
    const user = await createTestUser()
    const currentUsername = `deletion-current-${v7()}`
    await updateUserUsername(user.id, currentUsername)

    const attempt = await deleteUser(user, user)
    const audit = await getUserDeletionCompletionAuditForTest(attempt.requestId)

    expect(audit.priorUsername).toBe(currentUsername)
    expect(audit.externalWorks.map(work => work.workKey)).toEqual(
      expect.arrayContaining(['legal-removal', `user:${user.id}`, `user:${currentUsername}`]),
    )
  })

  it('leaves the legal purge owed after the immediate purge succeeds', async () => {
    const user = await createTestUser()
    const currentUsername = `deletion-purge-${v7()}`
    await updateUserUsername(user.id, currentUsername)
    const purge = vi.spyOn(cachePurge, 'purgeCacheTags')

    const attempt = await deleteUser(user, user)
    const audit = await getUserDeletionCompletionAuditForTest(attempt.requestId)

    expect(purge).toHaveBeenCalledExactlyOnceWith([
      'legal-removal',
      `user:${user.id}`,
      `user:${currentUsername}`,
    ])
    expect(
      audit.externalWorks
        .map(work => work.workKey)
        .toSorted((a, b) => Number(String(a) > String(b)) - Number(String(a) < String(b))),
    ).toEqual(['legal-removal', `user:${user.id}`, `user:${currentUsername}`].toSorted())
    expect(
      audit.externalWorks.find(work => work.workKey === 'legal-removal')?.completedAt,
    ).toBeNull()
    expect(
      audit.externalWorks
        .filter(work => work.workKey !== 'legal-removal')
        .every(work => work.completedAt instanceof Date),
    ).toBe(true)
  })

  it('leaves durable cache work pending when the immediate purge fails', async () => {
    vi.stubEnv('CF_WORKER_ROUTE', 'https://127.0.0.1:9')
    vi.stubEnv('CF_WORKER_SECRET', 'test-secret')
    vi.stubEnv('SKIP_CACHE_PURGE', 'false')
    try {
      const user = await createTestUser()
      const purge = vi.spyOn(cachePurge, 'purgeCacheTags')

      const attempt = await deleteUser(user, user)
      const audit = await getUserDeletionCompletionAuditForTest(attempt.requestId)

      expect(purge).toHaveBeenCalledExactlyOnceWith([
        'legal-removal',
        `user:${user.id}`,
        `user:${user.username?.toLowerCase()}`,
      ])
      expect(
        audit.externalWorks
          .map(work => work.workKey)
          .toSorted((a, b) => Number(String(a) > String(b)) - Number(String(a) < String(b))),
      ).toEqual(
        ['legal-removal', `user:${user.id}`, `user:${user.username?.toLowerCase()}`].toSorted(),
      )
      expect(audit.externalWorks.every(work => work.completedAt === null)).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
