import { afterEach, describe, expect, it, vi } from 'vitest'
import * as rssSnapshotGeneration from '@services/entity-cache/rss-snapshot-generation'
import { addUserDeletionExternalWorks, createUserDeletionRequest } from '@services/user-deletions'
import { createTestUser, isTestUserDeletionExternalWorkCompleted } from '@voucha/test-helpers'
import { markUserDeletionAttemptStartedForTest } from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'
import { processUserDeletionExternalWork } from './delete-phase-external-work.mts'

describe('user deletion legal-removal work', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the legal-removal row owed until the RSS snapshot generation advances', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await addUserDeletionExternalWorks(request.id, 'cloudflare-cache-tag', ['legal-removal'])
    await markUserDeletionAttemptStartedForTest(request.id, request.processingAttemptId)
    const generation = await rssSnapshotGeneration.getRssSnapshotLegalGeneration()
    vi.spyOn(rssSnapshotGeneration, 'invalidateRssSnapshotsForLegalRemoval').mockRejectedValueOnce(
      new Error('generation outage'),
    )

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).rejects.toThrow('generation outage')
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(false)
    expect(await rssSnapshotGeneration.getRssSnapshotLegalGeneration()).toBe(generation)

    await expect(
      processUserDeletionExternalWork(request.id, request.processingAttemptId),
    ).resolves.toEqual({ hasMore: true })
    await expect(isTestUserDeletionExternalWorkCompleted(request.id)).resolves.toBe(true)
    expect(await rssSnapshotGeneration.getRssSnapshotLegalGeneration()).not.toBe(generation)
  })
})
