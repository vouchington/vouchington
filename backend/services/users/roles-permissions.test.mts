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

    it.each(['queue', 'jwt'] as const)(
      'returns after the committed grant when %s admission settles last',
      async lastAdmission => {
        const grantedUser = await createTestUser()
        const staleKey = getJwtStaleKey(grantedUser.id)
        const queueEntered = Promise.withResolvers<void>()
        const queueAdmitted = Promise.withResolvers<void>()
        const queueRelease = Promise.withResolvers<void>()
        const markerEntered = Promise.withResolvers<string>()
        const markerWritten = Promise.withResolvers<void>()
        const markerRelease = Promise.withResolvers<void>()
        const originalAdd = voteAggregation.add
        const originalSet = sessionValkeyClient.set
        let jobId: string | undefined
        let marker: string | undefined
        let settled = false
        const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
        const releaseWorker = holdBackgroundDomain('vote-aggregation')
        const addSpy = vi
          .spyOn(voteAggregation, 'add')
          .mockImplementation((name, data, options) => {
            if (
              name === jobName &&
              typeof data === 'object' &&
              data !== null &&
              'userId' in data &&
              data.userId === grantedUser.id
            ) {
              queueEntered.resolve()
              return queueRelease.promise.then(async () => {
                const job = await runInsideTestWorkerProcessor(() =>
                  originalAdd.call(voteAggregation, name, data, options),
                )
                jobId = job?.id
                queueAdmitted.resolve()
                return job
              })
            }
            return originalAdd.call(voteAggregation, name, data, options)
          })
        const setSpy = vi
          .spyOn(sessionValkeyClient, 'set')
          .mockImplementation((key, value, options) => {
            if (key === staleKey && typeof value === 'string') {
              markerEntered.resolve(value)
              return markerRelease.promise.then(async () => {
                const result = await originalSet.call(sessionValkeyClient, key, value, options)
                markerWritten.resolve()
                return result
              })
            }
            return originalSet.call(sessionValkeyClient, key, value, options)
          })
        const grant = addUserRole(grantedUser.id, 'administrator').finally(() => {
          settled = true
        })
        try {
          marker = await markerEntered.promise
          await queueEntered.promise
          expect(await countUserRoleAssignments(grantedUser.id, 'administrator')).toBe(1)
          expect((await getTestUserRaw(grantedUser.id))?.vote_weight_recalculated_at).toBeNull()
          expect(settled).toBe(false)

          let firstJobData: unknown
          if (lastAdmission === 'jwt') {
            queueRelease.resolve()
            await queueAdmitted.promise
            firstJobData = jobId ? (await voteAggregation.getJob(jobId))?.data : undefined
          } else {
            markerRelease.resolve()
            await markerWritten.promise
          }
          expect(firstJobData).toEqual(
            lastAdmission === 'jwt' ? { userId: grantedUser.id } : undefined,
          )
          expect(await isJwtStale(grantedUser.id)).toBe(lastAdmission === 'queue')
          expect(settled).toBe(false)

          queueRelease.resolve()
          markerRelease.resolve()
          await grant
          await queueAdmitted.promise
          expect(jobId).toBeDefined()
          expect((await voteAggregation.getJob(jobId!))?.data).toEqual({ userId: grantedUser.id })
          expect(await isJwtStale(grantedUser.id)).toBe(true)
          expect(sentryCaptureExceptionMock.mock.calls.slice(reportsBefore)).toEqual([])
        } finally {
          queueRelease.resolve()
          markerRelease.resolve()
          try {
            await grant.catch(() => undefined)
            await releaseWorker()
            if (jobId) await (await voteAggregation.getJob(jobId))?.remove()
            if (marker) await clearJwtStaleIfCurrent(grantedUser.id, marker)
          } finally {
            addSpy.mockRestore()
            setSpy.mockRestore()
          }
        }
      },
    )

    it('is idempotent for the same user and role', async () => {
      await addUserRole(user.id, 'administrator')
      await addUserRole(user.id, 'administrator')

      const count = await countUserRoleAssignments(user.id, 'administrator')
      expect(count).toBe(1)
    })

    it('preserves the committed grant when queue admission and JWT invalidation fail', async () => {
      const grantedUser = await createTestUser()
      const staleKey = getJwtStaleKey(grantedUser.id)
      const queueFailure = new Error('Owned role vote-weight admission failure')
      const markerFailure = new Error('Owned role JWT invalidation failure')
      const originalAdd = voteAggregation.add
      const originalSet = sessionValkeyClient.set
      const addSpy = vi.spyOn(voteAggregation, 'add').mockImplementation((name, data, options) => {
        if (
          name === jobName &&
          typeof data === 'object' &&
          data !== null &&
          'userId' in data &&
          data.userId === grantedUser.id
        )
          return Promise.reject(queueFailure)
        return originalAdd.call(voteAggregation, name, data, options)
      })
      const setSpy = vi
        .spyOn(sessionValkeyClient, 'set')
        .mockImplementation((key, value, options) =>
          key === staleKey
            ? Promise.reject(markerFailure)
            : originalSet.call(sessionValkeyClient, key, value, options),
        )
      try {
        await expect(addUserRole(grantedUser.id, 'administrator')).resolves.toBeUndefined()
        expect(await countUserRoleAssignments(grantedUser.id, 'administrator')).toBe(1)
        expect((await getTestUserRaw(grantedUser.id))?.vote_weight_recalculated_at).toBeNull()
        for (const failure of [queueFailure, markerFailure]) {
          expect(
            sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure),
          ).toHaveLength(1)
        }
      } finally {
        addSpy.mockRestore()
        setSpy.mockRestore()
      }
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
