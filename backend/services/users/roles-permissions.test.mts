import { randomInt } from 'node:crypto'
import { v7 } from 'uuid'
import { it, expect, describe, beforeAll, onTestFinished, vi } from 'vitest'
import { runInsideTestWorkerProcessor } from '@vouchington/worker-runtime/testing'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { clearJwtStaleIfCurrent, getJwtStaleKey, isJwtStale } from '@data-stores/valkey/jwt-stale'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { countUserRoleAssignments, createTestUser, getTestUserRaw } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { createVoteWeightDispatchUserAt } from '@voucha/test-helpers/vote-weight-dispatch'
import { createVoteWeightRecalculationRaceQuery } from '@voucha/test-helpers/vote-weight-recalculation-race'
import { holdBackgroundDomain } from '../../../test-helpers/shared-background-worker.mts'
import { dispatchVoteWeightDirtyMarkers } from '../vote-weight/dispatch-dirty-markers.mts'
import { recalculateUserVoteWeight } from '../vote-weight/update.mts'
import { voteWeightWorkConfig } from '../vote-weight/work-limits.mts'
import { addUserRole } from './roles-permissions.mts'
import type { PrivateUser } from '@services/users/types'

describe('roles-permissions', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('addUserRole', () => {
    const jobName = 'vote-aggregation.processRecalculateUserVoteWeight'

    it('returns after its committed grant and both owned admissions settle', async () => {
      const grantedUser = await createTestUser()
      const staleKey = getJwtStaleKey(grantedUser.id)
      const queueGate = holdQueueAdmission(
        voteAggregation,
        jobName,
        data =>
          typeof data === 'object' &&
          data !== null &&
          'userId' in data &&
          data.userId === grantedUser.id,
      )
      const markerEntered = Promise.withResolvers<string>()
      const markerRelease = Promise.withResolvers<void>()
      const originalSet = sessionValkeyClient.set
      let marker: string | undefined
      let jobId: string | undefined
      let settled = false
      let grant: Promise<void> | undefined
      const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
      const releaseWorker = holdBackgroundDomain('vote-aggregation')
      const setSpy = vi
        .spyOn(sessionValkeyClient, 'set')
        .mockImplementation((key, value, options) => {
          if (key === staleKey && typeof value === 'string') {
            markerEntered.resolve(value)
            return markerRelease.promise.then(() =>
              originalSet.call(sessionValkeyClient, key, value, options),
            )
          }
          return originalSet.call(sessionValkeyClient, key, value, options)
        })
      let cleanupPromise: Promise<void> | undefined
      const cleanup = () => {
        cleanupPromise ??= (async () => {
          queueGate.release()
          markerRelease.resolve()
          try {
            await grant?.catch(() => undefined)
            await releaseWorker()
            if (jobId) await (await voteAggregation.getJob(jobId))?.remove()
            if (marker) await clearJwtStaleIfCurrent(grantedUser.id, marker)
          } finally {
            queueGate.restore()
            setSpy.mockRestore()
          }
        })()
        return cleanupPromise
      }
      onTestFinished(cleanup)
      grant = addUserRole(grantedUser.id, 'administrator').finally(() => {
        settled = true
      })
      try {
        marker = await markerEntered.promise
        await queueGate.entered
        expect(await countUserRoleAssignments(grantedUser.id, 'administrator')).toBe(1)
        expect((await getTestUserRaw(grantedUser.id))?.vote_weight_recalculated_at).toBeNull()
        expect(settled).toBe(false)

        queueGate.release()
        markerRelease.resolve()
        const job = await queueGate.admitted
        jobId = job?.id
        await grant
        expect(jobId).toBeDefined()
        expect((await voteAggregation.getJob(jobId!))?.data).toEqual({ userId: grantedUser.id })
        expect(await isJwtStale(grantedUser.id)).toBe(true)
        expect(sentryCaptureExceptionMock.mock.calls.slice(reportsBefore)).toEqual([])
      } finally {
        await cleanup()
      }
    })

    it('keeps a committed role grant when vote-weight admission fails', async () => {
      const grantedUser = await createTestUser()
      const admissionError = new Error('Injected vote-weight queue admission failure')
      const originalAdd = voteAggregation.add
      const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
      let matchingAdmissions = 0
      const addSpy = vi.spyOn(voteAggregation, 'add').mockImplementation((name, data, options) => {
        if (
          name === jobName &&
          typeof data === 'object' &&
          data !== null &&
          'userId' in data &&
          data.userId === grantedUser.id
        ) {
          matchingAdmissions += 1
          return Promise.reject(admissionError)
        }
        return originalAdd.call(voteAggregation, name, data, options)
      })

      try {
        await expect(addUserRole(grantedUser.id, 'administrator')).resolves.toBeUndefined()

        expect(matchingAdmissions).toBe(1)
        expect(await countUserRoleAssignments(grantedUser.id, 'administrator')).toBe(1)
        expect((await getTestUserRaw(grantedUser.id))?.vote_weight_recalculated_at).toBeNull()
        expect(
          sentryCaptureExceptionMock.mock.calls
            .slice(reportsBefore)
            .filter(([error]) => error === admissionError),
        ).toHaveLength(1)
      } finally {
        addSpy.mockRestore()
      }
    })

    it('is idempotent for the same user and role', async () => {
      await addUserRole(user.id, 'administrator')
      await addUserRole(user.id, 'administrator')

      const count = await countUserRoleAssignments(user.id, 'administrator')
      expect(count).toBe(1)
    })

    it('keeps a role grant dirty when it races vote-weight factor gathering', async () => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, { dispatch_batch_size: 1 }),
      )
      const at = new Date(Date.UTC(2004, 0, 1) + randomInt(0, 30_000_000))
      const userId = await createVoteWeightDispatchUserAt(at)
      const afterId = v7({ msecs: at.getTime() - 1 })
      const baseline = await recalculateUserVoteWeight(userId)
      const release = holdBackgroundDomain('vote-aggregation')
      try {
        const query = createVoteWeightRecalculationRaceQuery(() =>
          runInsideTestWorkerProcessor(() => addUserRole(userId, 'administrator')),
        )
        await expect(recalculateUserVoteWeight(userId, { query })).rejects.toThrow(/raced/)
        expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()
        const dirtyEvent = { userId, jobId: `voteWeight__${userId}__dirtyMarker` }
        expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(
          dirtyEvent,
        )
        const repaired = await recalculateUserVoteWeight(userId)
        expect(repaired.weight).toBeGreaterThan(baseline.weight)
        expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeInstanceOf(Date)
      } finally {
        await release()
      }
    })
  })
})
