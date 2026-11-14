import { afterEach, describe, expect, it, vi } from 'vitest'
import * as anonymousCacheGeneration from '@services/entity-cache/anonymous-cache-generation'
import * as cachePurge from '@services/entity-cache/purge'
import { addUserDeletionExternalWorks, createUserDeletionRequest } from '@services/user-deletions'
import { createTestUser } from '@voucha/test-helpers'
import {
  getUserDeletionCompletionAuditForTest,
  markUserDeletionAttemptStartedForTest,
} from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import { processUserDeletionExternalWork } from './delete-phase-external-work.mts'

async function legalRemovalCompletedAt(requestId: string): Promise<Date | null | undefined> {
  const audit = await getUserDeletionCompletionAuditForTest(requestId)
  return audit.externalWorks.find(work => work.workKey === 'legal-removal')?.completedAt
}

describe('user deletion anonymous cache generation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps legal-removal work owed until the anonymous generation advances', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWorks(request.id, 'cloudflare-cache-tag', ['legal-removal'])
    await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)
    const advanceGeneration = vi
      .spyOn(anonymousCacheGeneration, 'advanceAnonymousCacheGeneration')
      .mockRejectedValueOnce(new Error('anonymous generation unavailable'))
    const purge = vi.spyOn(cachePurge, 'purgeCacheTags')
    const initialGeneration = await anonymousCacheGeneration.getAnonymousCacheGeneration()

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).rejects.toThrow('anonymous generation unavailable')
    expect(purge).not.toHaveBeenCalled()
    await expect(legalRemovalCompletedAt(request.id)).resolves.toBeNull()

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: true })
    expect(advanceGeneration).toHaveBeenCalledTimes(2)
    expect(purge).toHaveBeenCalledExactlyOnceWith(['legal-removal'])
    await expect(legalRemovalCompletedAt(request.id)).resolves.toBeInstanceOf(Date)
    await expect(anonymousCacheGeneration.getAnonymousCacheGeneration()).resolves.not.toBe(
      initialGeneration,
    )
  })

  it('does not advance the anonymous generation for precise user tags', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWorks(request.id, 'cloudflare-cache-tag', [`user:${user.id}`])
    await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)
    const advanceGeneration = vi.spyOn(anonymousCacheGeneration, 'advanceAnonymousCacheGeneration')

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: true })
    expect(advanceGeneration).not.toHaveBeenCalled()
  })
})
