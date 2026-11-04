import { createTestDataRequestSweepNeighbor } from '@voucha/test-helpers/account-data-request-sweep-neighbor'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { S3Buckets } from '@modules/aws'
import {
  createDataRequest,
  markDataRequestProcessing,
  markDataRequestReady,
} from '@services/account-data-requests'
import { dataRequestConfig } from '@services/account-data-requests/work-limits'
import {
  createTestUser,
  expireUserDataRequestForTest,
  getUserDataRequestStatusAndS3KeyForTest,
} from '@voucha/test-helpers'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { dataRequestPubSub } from '@data-stores/valkey-pubsub'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { publishTerminalStatus } from './account-data-request-publish-terminal-status.mts'
import { ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB } from '@queues/background/enqueues/account-lifecycle-jobs'
import type { Job } from 'glide-mq'
import { processAccountDataRequestJob } from './account-data-request-job.mts'
import { processCleanupExpiredExports } from './account-data-request-recovery-cleanup.mts'

// Only the external S3 provider call is replaced; the database and the cleanup flow are real.
const mockS3Send = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())
vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  S3ImagesClient: { send: mockS3Send } as unknown as typeof import('@modules/aws').S3ImagesClient,
}))

type DeleteCommand = {
  constructor: { name: string }
  input: { Bucket?: string; Delete?: { Objects?: { Key?: string }[] } }
}

describe('processCleanupExpiredExports', () => {
  beforeEach(() => {
    mockS3Send.mockReset()
    mockS3Send.mockResolvedValue({})
  })

  it('expires database records and deletes their S3 objects', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor('expired')
    const requests = await createExpiredRequests(2)

    await expect(cleanup(requests)).resolves.toEqual({ hasMore: false })

    expect(deletedKeys(requests)).toEqual(requests.map(request => keyOf(request)).toSorted())
    expect(mockS3Send.mock.calls.map(([command]) => deleteCommand(command).input.Bucket)).toEqual([
      S3Buckets.userExports,
    ])
    expect(await statuses(requests)).toEqual([
      { status: 'expired', s3_key: null },
      { status: 'expired', s3_key: null },
    ])
    expect(await neighbor.readState()).toEqual(neighbor.state)
  })

  it('does not call S3 for an empty batch', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor('expired')
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)

    await expect(cleanup([request])).resolves.toEqual({ hasMore: false })

    expect(mockS3Send).not.toHaveBeenCalled()
    expect(await neighbor.readState()).toEqual(neighbor.state)
  })

  it('treats a bulk S3 deletion failure as non-fatal', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor('expired')
    const requests = await createExpiredRequests(1)
    mockS3Send.mockRejectedValue(new Error('S3 error'))

    await expect(cleanup(requests)).resolves.toEqual({ hasMore: false })

    expect(mockS3Send).toHaveBeenCalledOnce()
    expect(await statuses(requests)).toEqual([{ status: 'expired', s3_key: null }])
    expect(await neighbor.readState()).toEqual(neighbor.state)
  })

  it('expires one bounded page per run and resumes after clearing the first page', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor('expired')
    const requests = await createExpiredRequests(2)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(dataRequestConfig, {
        batch_size: 1,
        max_batches_per_run: 1,
      }),
    )

    await expect(cleanup(requests)).resolves.toEqual({ hasMore: true })
    expect(deletedKeys(requests)).toHaveLength(1)
    const remaining = await statuses(requests)
    expect(remaining.filter(row => row.s3_key !== null)).toHaveLength(1)

    await expect(cleanup(requests)).resolves.toEqual({ hasMore: true })
    expect(deletedKeys(requests)).toEqual(requests.map(request => keyOf(request)).toSorted())

    await expect(cleanup(requests)).resolves.toEqual({ hasMore: false })
    expect(mockS3Send).toHaveBeenCalledTimes(2)
    expect(await neighbor.readState()).toEqual(neighbor.state)
  })
})

describe('processAccountDataRequestJob cleanup', () => {
  it('routes a cleanup job to the expiry sweep', async () => {
    onTestFinished(
      rejectPostgresWriteForTest('expireDataRequests', new Error('expiry sweep reached')),
    )

    await expect(
      processAccountDataRequestJob({
        name: ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB.name,
        data: {},
        attemptsMade: 0,
        opts: {},
      } as Job),
    ).rejects.toThrow('expiry sweep reached')
  })
})

describe('publishTerminalStatus', () => {
  it('retries the pub/sub publish and reports the terminal failure', async () => {
    const publish = vi
      .spyOn(dataRequestPubSub, 'publish')
      .mockRejectedValue('publish failed' as never)
    onTestFinished(() => publish.mockRestore())

    await publishTerminalStatus('request-terminal', 'failed')

    expect(publish).toHaveBeenCalledTimes(3)
    expect(publish).toHaveBeenCalledWith('request-terminal', { status: 'failed' })
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
    expect(sentryCaptureExceptionMock.mock.calls[0]?.[0]).toEqual(new Error('publish failed'))
  })
})

type OwnedRequest = { id: string }

// A scoped expiry keeps the sweep on rows this test owns in the shared database.
function cleanup(requests: readonly OwnedRequest[]) {
  return processCleanupExpiredExports(requests.map(request => request.id))
}

function keyOf(request: OwnedRequest): string {
  return `test/${request.id}.zip`
}

async function createExpiredRequests(count: number): Promise<OwnedRequest[]> {
  const users = await Promise.all(Array.from({ length: count }, () => createTestUser()))
  const requests = await Promise.all(users.map(user => createDataRequest(user.id, user.id)))
  await Promise.all(
    requests.map(async request => {
      await markDataRequestProcessing(request.id)
      await markDataRequestReady(request.id, keyOf(request), new Date(Date.now() + 60_000))
      await expireUserDataRequestForTest(request.id)
    }),
  )
  return requests
}

function deleteCommand(command: unknown): DeleteCommand {
  return command as DeleteCommand
}

function deletedKeys(requests: readonly OwnedRequest[]): string[] {
  const owned = new Set(requests.map(request => keyOf(request)))
  return mockS3Send.mock.calls
    .flatMap(([command]) => deleteCommand(command).input.Delete?.Objects ?? [])
    .flatMap(object => (object.Key && owned.has(object.Key) ? [object.Key] : []))
    .toSorted()
}

function statuses(requests: readonly OwnedRequest[]) {
  return Promise.all(
    requests.map(async request => {
      const row = await getUserDataRequestStatusAndS3KeyForTest(request.id)
      if (!row) throw new Error('Expected the data request row')
      return row
    }),
  )
}
