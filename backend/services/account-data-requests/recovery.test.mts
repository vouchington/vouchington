import { createTestDataRequestSweepNeighbor } from '@voucha/test-helpers/account-data-request-sweep-neighbor'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  makeUserDataRequestRecoverableForTest,
  restoreUser,
  softDeleteUser,
} from '@voucha/test-helpers'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { createDataRequest } from './create.mts'
import { claimRecoverableDataRequests } from './recovery.mts'
import { dataRequestConfig } from './work-limits.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  markDataRequestProcessing,
  markDataRequestReady,
  markDataRequestFailed,
} from './update.mts'

describe('account data request recovery', () => {
  it('uses updated dispatch and processing recovery windows in the actual claim predicates', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor('stale')
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)
    await makeUserDataRequestRecoverableForTest(request.id, 'unstarted', 3)
    expect((await claimRecoverableDataRequests([request.id])).requests).toEqual([])
    const restore = overrideDynamicConfigFieldsForTest(dataRequestConfig, {
      dispatch_timeout_minutes: 2,
      processing_timeout_minutes: 5,
    })
    try {
      const dispatched = await claimRecoverableDataRequests([request.id])
      expect(dispatched.requests.map(row => row.requestId)).toEqual([request.id])
      expect(dispatched.requests[0]!.processingAttemptId).toBe(request.processing_attempt_id)
      await makeUserDataRequestRecoverableForTest(request.id, 'stale', 10)
      const processing = await claimRecoverableDataRequests([request.id])
      expect(processing.requests.map(row => row.requestId)).toEqual([request.id])
      expect(processing.requests[0]!.processingAttemptId).not.toBe(request.processing_attempt_id)
      expect(await neighbor.readState()).toEqual(neighbor.state)
    } finally {
      restore()
    }
  })

  it('reuses the token for an unstarted attempt and rotates stale attempts', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor('stale')
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)
    await makeUserDataRequestRecoverableForTest(request.id, 'unstarted')
    const unstarted = (await claimRecoverableDataRequests([request.id])).requests.find(
      candidate => candidate.requestId === request.id,
    )
    expect(unstarted?.processingAttemptId).toBe(request.processing_attempt_id)

    await makeUserDataRequestRecoverableForTest(request.id, 'stale')
    const stale = (await claimRecoverableDataRequests([request.id])).requests.find(
      candidate => candidate.requestId === request.id,
    )
    expect(stale?.processingAttemptId).not.toBe(request.processing_attempt_id)
    expect(await neighbor.readState()).toEqual(neighbor.state)
  })

  it('fences stale completion and failure writes by processing attempt id', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)
    const staleAttemptId = request.id
    expect(await markDataRequestProcessing(request.id, staleAttemptId)).toBe(false)
    expect(await markDataRequestProcessing(request.id, request.processing_attempt_id)).toBe(true)
    expect(
      await markDataRequestReady(
        request.id,
        'stale.zip',
        new Date(Date.now() + 60_000),
        staleAttemptId,
      ),
    ).toBe(false)
    expect(await markDataRequestFailed(request.id, staleAttemptId, 'stale failure', true)).toBe(
      false,
    )
  })

  it('locks a deleted owner before failing the export', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)
    await makeUserDataRequestRecoverableForTest(request.id, 'unstarted')
    await softDeleteUser(user.id)
    let heldBeforeFail = false
    onTestFinished(
      runBeforePostgresStatementForTest(
        'claimRecoverableDataRequests:deletedUsers',
        async query => {
          const { rows } = await query<{ held: boolean }>(
            `/* recoveryLockOrder */ SELECT EXISTS (
              SELECT 1 FROM pg_locks
              WHERE locktype = 'advisory' AND granted AND pid = pg_backend_pid() AND objsubid = 1
            ) AS held`,
          )
          if (rows[0]?.held) heldBeforeFail = true
        },
      ),
    )
    try {
      expect((await claimRecoverableDataRequests([request.id])).requests).toEqual([])
      expect(heldBeforeFail).toBe(true)
    } finally {
      await restoreUser(user.id)
    }
  })

  it('does not recover an export after its owner is deleted', async () => {
    const neighbor = await createTestDataRequestSweepNeighbor()
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)
    await makeUserDataRequestRecoverableForTest(request.id, 'unstarted')
    try {
      await softDeleteUser(user.id)
      const { requests: recovered } = await claimRecoverableDataRequests([request.id])
      expect(recovered).toEqual([])
      expect(await neighbor.readState()).toEqual(neighbor.state)
    } finally {
      await restoreUser(user.id)
    }
  })
})
