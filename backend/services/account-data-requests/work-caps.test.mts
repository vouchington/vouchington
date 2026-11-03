import { orphanTestDataRequest } from '@voucha/test-helpers/entities/account-data-requests'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  makeUserDataRequestRecoverableForTest,
  getUserDataRequestStatusAndS3KeyForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { dataRequestConfig } from './work-limits.mts'
import { createDataRequest } from './create.mts'
import { claimRecoverableDataRequests } from './recovery.mts'
import { recoverExportRequests } from '../../workers/account-lifecycle/processors/account-data-requests.mts'
import { accountLifecycle } from '../../queues/account-lifecycle/queues.mts'

describe('account export work caps', () => {
  it('commits one recovery page at the cap and the next run claims the remaining attempt', async () => {
    const users = await Promise.all([createTestUser(), createTestUser()])
    const requests = await Promise.all(users.map(user => createDataRequest(user.id, user.id)))
    await Promise.all(
      requests.map(request => makeUserDataRequestRecoverableForTest(request.id, 'unstarted')),
    )
    onTestFinished(
      overrideDynamicConfigFieldsForTest(dataRequestConfig, {
        batch_size: 1,
        max_batches_per_run: 1,
      }),
    )
    const dependencies = {
      claimRecoverableDataRequests: () =>
        claimRecoverableDataRequests(requests.map(request => request.id)),
    }
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })
    expect(await queuedRequestIds(requests)).toHaveLength(1)
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })
    expect(new Set(await queuedRequestIds(requests))).toEqual(
      new Set(requests.map(request => request.id)),
    )
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
    onTestFinished(
      overrideDynamicConfigFieldsForTest(dataRequestConfig, {
        batch_size: 1,
        max_batches_per_run: 1,
      }),
    )
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
    onTestFinished(
      overrideDynamicConfigFieldsForTest(dataRequestConfig, {
        batch_size: 1,
        max_batches_per_run: 1,
      }),
    )
    const dependencies = {
      claimRecoverableDataRequests: () => claimRecoverableDataRequests([orphan.id, active.id]),
    }
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 0,
      hasMore: true,
    })
    expect((await getUserDataRequestStatusAndS3KeyForTest(orphan.id))?.status).toBe('failed')
    expect(await queuedRequestIds([orphan, active])).toEqual([])
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })
    expect(await queuedRequestIds([orphan, active])).toEqual([active.id])
    await expect(recoverExportRequests(dependencies)).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
  })
})

/** The owned requests whose recovery attempt was enqueued, read back from the real queue. */
async function queuedRequestIds(
  requests: readonly { id: string; processing_attempt_id: string }[],
): Promise<string[]> {
  const jobs = await Promise.all(
    requests.map(request =>
      accountLifecycle.getJob(
        `account-data-export__${request.id}__${request.processing_attempt_id}`,
      ),
    ),
  )
  return jobs.flatMap((job, index) => (job ? [requests[index]!.id] : []))
}
