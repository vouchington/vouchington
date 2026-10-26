import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, backdateImageUploadStagedAt } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withRejectedPostgresQueryForTest } from '@voucha/test-helpers/injected-failures'
import {
  insertOwnedUploadCleanupCluster,
  makeOwnedUploadCleanupSweep,
} from '@voucha/test-helpers/image-upload-cleanup'
import { installOwnedUploadCleanupStorage } from '@voucha/test-helpers/image-upload-cleanup-storage'
import type { AbandonedUploadSweep } from '@queues/content-analysis/types'
import { cleanupAbandonedUploads } from '../cleanup-abandoned-uploads.mts'
import { getImageByIdFromPrimary } from '../get.mts'
import { imagesWorkConfig } from '../work-limits.mts'

const HOUR = 60 * 60 * 1000

describe('upload cleanup effect checkpoints', () => {
  afterEach(() => vi.restoreAllMocks())

  it('advances past known storage failure and retries that dirty source in a fresh sweep', async context => {
    const user = await createTestUser()
    const now = new Date()
    const stagedAt = new Date(now.getTime() - 25 * HOUR)
    const ids = await insertOwnedUploadCleanupCluster(user.id, 2, stagedAt)
    const [first, later] = ids
    if (!first || !later) throw new Error('Missing owned staged sources')
    await Promise.all(ids.map(id => backdateImageUploadStagedAt(id, stagedAt, 'complete')))
    const sweep = await makeOwnedUploadCleanupSweep(ids, now)
    sweep.windows.recovery.done = true
    sweep.windows.abandonment.done = true
    let fail = true
    const storage = installOwnedUploadCleanupStorage(ids, async input => {
      if (input.Key === first && fail) throw new Error('owned provider failure')
    })
    context.onTestFinished(
      overrideDynamicConfigFieldsForTest(imagesWorkConfig, { cleanup_batch_size: 1 }),
    )
    const saved: AbandonedUploadSweep[] = []
    expect(
      await cleanupAbandonedUploads(sweep, async next => {
        saved.push(next)
      }),
    ).toMatchObject({
      stagedSourcesDeleted: 0,
      hasMore: true,
    })
    const next = saved[0]
    if (!next) throw new Error('Known provider failure did not advance the page')
    expect(next.windows.staged).toMatchObject({ after: { id: first }, done: false })
    expect((await getImageByIdFromPrimary(first))?.upload_source_deleted_at).toBeNull()
    expect(await cleanupAbandonedUploads(next, async () => {})).toMatchObject({
      stagedSourcesDeleted: 1,
      hasMore: false,
    })
    expect((await getImageByIdFromPrimary(later))?.upload_source_deleted_at).toBeInstanceOf(Date)
    fail = false
    const fresh = await makeOwnedUploadCleanupSweep(ids, now)
    fresh.windows.recovery.done = true
    fresh.windows.abandonment.done = true
    expect(await cleanupAbandonedUploads(fresh, async () => {})).toMatchObject({
      stagedSourcesDeleted: 1,
      hasMore: false,
    })
    expect((await getImageByIdFromPrimary(first))?.upload_source_deleted_at).toBeInstanceOf(Date)
    expect(storage.calls.map(call => call.Key)).toEqual([first, later, first])
  })

  it('replays an unsaved staged page without repeating its acknowledged provider deletion', async () => {
    const user = await createTestUser()
    const now = new Date()
    const stagedAt = new Date(now.getTime() - 25 * HOUR)
    const ids = await insertOwnedUploadCleanupCluster(user.id, 1, stagedAt)
    const id = ids[0]
    if (!id) throw new Error('Missing owned checkpoint fixture')
    await backdateImageUploadStagedAt(id, stagedAt, 'complete')
    const sweep = await makeOwnedUploadCleanupSweep(ids, now)
    sweep.windows.recovery.done = true
    sweep.windows.abandonment.done = true
    const storage = installOwnedUploadCleanupStorage(ids)
    await expect(
      cleanupAbandonedUploads(sweep, async () => {
        throw new Error('owned checkpoint failure')
      }),
    ).rejects.toThrow('owned checkpoint failure')
    expect((await getImageByIdFromPrimary(id))?.upload_source_deleted_at).toBeInstanceOf(Date)
    expect(await cleanupAbandonedUploads(sweep, async () => {})).toMatchObject({
      stagedSourcesDeleted: 0,
      hasMore: false,
    })
    expect(storage.calls.map(call => call.Key)).toEqual(ids)
  })

  it.each(['staged', 'abandonment'] as const)(
    'does not checkpoint %s when its actual SQL acknowledgement rejects',
    async phase => {
      const user = await createTestUser()
      const now = new Date()
      const stagedAt = new Date(now.getTime() - 25 * HOUR)
      const ids = await insertOwnedUploadCleanupCluster(user.id, 1, stagedAt)
      const id = ids[0]
      if (!id) throw new Error('Missing owned acknowledgement fixture')
      if (phase === 'staged') await backdateImageUploadStagedAt(id, stagedAt, 'complete')
      const sweep = await makeOwnedUploadCleanupSweep(ids, now)
      for (const name of ['staged', 'recovery', 'abandonment'] as const)
        sweep.windows[name].done = name !== phase
      const storage = installOwnedUploadCleanupStorage(ids)
      const saved: AbandonedUploadSweep[] = []
      let rejectedMark = false
      const message = `owned ${phase} acknowledgement failure`
      const operation = withRejectedPostgresQueryForTest(
        statement => {
          const match = statement.includes(
            phase === 'staged'
              ? '/* cleanupStagedUploadSource:mark */'
              : '/* markImageUploadSourcesDeleted:update */',
          )
          rejectedMark ||= match
          return match
        },
        message,
        acknowledgementQuery =>
          cleanupAbandonedUploads(
            sweep,
            async next => {
              saved.push(next)
            },
            { acknowledgementQuery },
          ),
      )
      const failure = await operation.then(
        () => null,
        err => err as Error,
      )
      const expectedError = expect.objectContaining({ message })
      expect(failure).toMatchObject(phase === 'staged' ? { errors: [expectedError] } : { message })
      expect(rejectedMark).toBe(true)
      expect(saved).toEqual([])
      expect(storage.calls.map(call => call.Key)).toEqual([id])
      expect((await getImageByIdFromPrimary(id, true))?.upload_source_deleted_at).toBeNull()
      // The saved page remains replayable after an uncertain acknowledgement.
      expect(
        await cleanupAbandonedUploads(sweep, async next => {
          saved.push(next)
        }),
      ).toMatchObject({
        hasMore: false,
      })
      expect(saved).toHaveLength(1)
      if (phase === 'abandonment') {
        // The committed soft delete routes unfinished storage into the next sweep's staged phase.
        const fresh = await makeOwnedUploadCleanupSweep(ids, now)
        await cleanupAbandonedUploads(fresh, async () => {})
      }
      expect((await getImageByIdFromPrimary(id, true))?.upload_source_deleted_at).toBeInstanceOf(
        Date,
      )
    },
  )
})
