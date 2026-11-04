import { createTestDataRequestSweepNeighbor } from '@voucha/test-helpers/account-data-request-sweep-neighbor'
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
  it('claims one owned active attempt per page without changing an eligible neighbor', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor()
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const first = await createDataRequest(firstUser.id, firstUser.id)
    const second = await createDataRequest(secondUser.id, secondUser.id)
    await makeUserDataRequestRecoverableForTest(first.id, 'unstarted')
    await makeUserDataRequestRecoverableForTest(second.id, 'unstarted')
    const ids = [first.id, second.id]

    await expect(claimRecoverableDataRequests(ids, 1)).resolves.toEqual({
      requests: [
        {
          requestId: first.id,
          userId: firstUser.id,
          processingAttemptId: first.processing_attempt_id,
        },
      ],
      hasMore: true,
    })
    await expect(claimRecoverableDataRequests(ids, 1)).resolves.toEqual({
      requests: [
        {
          requestId: second.id,
          userId: secondUser.id,
          processingAttemptId: second.processing_attempt_id,
        },
      ],
      hasMore: true,
    })
    await expect(claimRecoverableDataRequests(ids, 1)).resolves.toEqual({
      requests: [],
      hasMore: false,
    })
    expect(await neighbor.readState()).toEqual(neighbor.state)
  })

  it('commits one recovery page at the cap and the next run claims the remaining attempt', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor()
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
    const requestIds = requests.map(request => request.id)
    await expect(recoverExportRequests(requestIds, 1)).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })
    expect(await queuedRequestIds(requests)).toHaveLength(1)
    await expect(recoverExportRequests(requestIds, 1)).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })
    expect(new Set(await queuedRequestIds(requests))).toEqual(
      new Set(requests.map(request => request.id)),
    )
    await expect(recoverExportRequests(requestIds, 1)).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
    expect(await neighbor.readState()).toEqual(neighbor.state)
  })

  it('fails only one orphaned export per page and resumes its deleted-owner work', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor('orphan')
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
    expect(await neighbor.readState()).toEqual(neighbor.state)
  })

  it('shares a single candidate allowance between deleted-owner and active recovery work', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor()
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
    const requestIds = [orphan.id, active.id]
    await expect(recoverExportRequests(requestIds, 1)).resolves.toEqual({
      enqueued: 0,
      hasMore: true,
    })
    expect((await getUserDataRequestStatusAndS3KeyForTest(orphan.id))?.status).toBe('failed')
    expect(await queuedRequestIds([orphan, active])).toEqual([])
    await expect(recoverExportRequests(requestIds, 1)).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })
    expect(await queuedRequestIds([orphan, active])).toEqual([active.id])
    await expect(recoverExportRequests(requestIds, 1)).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
    expect(await neighbor.readState()).toEqual(neighbor.state)
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
