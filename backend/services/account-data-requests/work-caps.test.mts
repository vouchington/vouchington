import { orphanTestDataRequest } from '@voucha/test-helpers/entities/account-data-requests'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  makeUserDataRequestRecoverableForTest,
  expireUserDataRequestForTest,
  getUserDataRequestStatusAndS3KeyForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { dataRequestConfig } from './work-limits.mts'
import { createDataRequest } from './create.mts'
import { claimRecoverableDataRequests } from './recovery.mts'
import { expireDataRequests, markDataRequestProcessing, markDataRequestReady } from './update.mts'
import {
  recoverExportRequests,
  processCleanupExpiredExports,
} from '../../workers/account-data-requests/processors.mts'
import { enqueueBulkExportRequests } from '../../queues/account-data-requests/enqueues.mts'

describe('account export work caps', () => {
  it('commits one recovery page at the cap and the next run claims the remaining attempt', async () => {
    const users = await Promise.all([createTestUser(), createTestUser()])
    const requests = await Promise.all(users.map(user => createDataRequest(user.id, user.id)))
    await Promise.all(
      requests.map(request => makeUserDataRequestRecoverableForTest(request.id, 'unstarted')),
    )
    overrideDynamicConfigFieldsForTest(dataRequestConfig, { batch_size: 1, max_batches_per_run: 1 })
    const claimed: string[] = []
    const dependencies = {
      claimRecoverableDataRequests: () =>
        claimRecoverableDataRequests(requests.map(request => request.id)),
      enqueueBulkExportRequests: async (...args: Parameters<typeof enqueueBulkExportRequests>) => {
        claimed.push(...args[0].map(request => request.requestId))
        return enqueueBulkExportRequests(...args)
      },
    }
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })
    expect(claimed).toHaveLength(1)
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })
    expect(new Set(claimed)).toEqual(new Set(requests.map(request => request.id)))
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
  })

  it('fails only one orphaned export per page and resumes its deleted-owner work', async () => {
    const users = await Promise.all([createTestUser(), createTestUser()])
    const requests = await Promise.all(users.map(user => createDataRequest(user.id, user.id)))
    await Promise.all(requests.map(request => orphanTestDataRequest(request.id)))
    const ids = requests.map(request => request.id)
    overrideDynamicConfigFieldsForTest(dataRequestConfig, { batch_size: 1, max_batches_per_run: 1 })
    await expect(claimRecoverableDataRequests(ids)).resolves.toEqual({
      requests: [],
      hasMore: true,
    })
    const states = await Promise.all(ids.map(id => getUserDataRequestStatusAndS3KeyForTest(id)))
    expect(states.filter(row => row?.status === 'failed')).toHaveLength(1)
    await expect(claimRecoverableDataRequests(ids)).resolves.toEqual({
      requests: [],
      hasMore: true,
    })
    await expect(claimRecoverableDataRequests(ids)).resolves.toEqual({
      requests: [],
      hasMore: false,
    })
  })

  it('shares a single candidate allowance between deleted-owner and active recovery work', async () => {
    const orphanOwner = await createTestUser()
    const activeOwner = await createTestUser()
    const orphan = await createDataRequest(orphanOwner.id, orphanOwner.id)
    const active = await createDataRequest(activeOwner.id, activeOwner.id)
    await orphanTestDataRequest(orphan.id)
    await makeUserDataRequestRecoverableForTest(active.id, 'unstarted')
    overrideDynamicConfigFieldsForTest(dataRequestConfig, { batch_size: 1, max_batches_per_run: 1 })
    const queued: string[] = []
    const dependencies = {
      claimRecoverableDataRequests: () => claimRecoverableDataRequests([orphan.id, active.id]),
      enqueueBulkExportRequests: async (...args: Parameters<typeof enqueueBulkExportRequests>) => {
        queued.push(...args[0].map(request => request.requestId))
        return enqueueBulkExportRequests(...args)
      },
    }
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 0,
      hasMore: true,
    })
    expect((await getUserDataRequestStatusAndS3KeyForTest(orphan.id))?.status).toBe('failed')
    expect(queued).toEqual([])
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })
    expect(queued).toEqual([active.id])
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
  })

  it('expires one bounded page per run and resumes after clearing the first page', async () => {
    const users = await Promise.all([createTestUser(), createTestUser()])
    const requests = await Promise.all(users.map(user => createDataRequest(user.id, user.id)))
    await Promise.all(
      requests.map(async request => {
        await markDataRequestProcessing(request.id)
        await markDataRequestReady(
          request.id,
          `test/${request.id}.zip`,
          new Date(Date.now() + 60_000),
        )
        await expireUserDataRequestForTest(request.id)
      }),
    )
    overrideDynamicConfigFieldsForTest(dataRequestConfig, { batch_size: 1, max_batches_per_run: 1 })
    const reclaimed: string[] = []
    const dependencies = {
      expireDataRequests: (batchSize?: number) =>
        expireDataRequests(
          batchSize,
          requests.map(request => request.id),
        ),
      deleteExportsFromS3: async (keys: string[]) => {
        reclaimed.push(...keys)
      },
    }
    await expect(processCleanupExpiredExports(dependencies)).resolves.toEqual({ hasMore: true })
    expect(reclaimed).toHaveLength(1)
    const remaining = await Promise.all(
      requests.map(request => getUserDataRequestStatusAndS3KeyForTest(request.id)),
    )
    expect(remaining.filter(row => row?.s3_key !== null)).toHaveLength(1)
    await expect(processCleanupExpiredExports(dependencies)).resolves.toEqual({ hasMore: true })
    expect(reclaimed).toHaveLength(2)
    await expect(processCleanupExpiredExports(dependencies)).resolves.toEqual({ hasMore: false })
  })
})
