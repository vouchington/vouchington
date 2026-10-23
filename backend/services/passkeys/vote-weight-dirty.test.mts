import { randomInt } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { runInsideTestWorkerProcessor } from '@vouchington/worker-runtime/testing'
import {
  countTestPasskeys,
  createTestUserDirect,
  getTestUserRaw,
  insertTestPasskey,
  safeUsername,
} from '@voucha/test-helpers'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { addVerifiedEmailForUser } from '@voucha/test-helpers/entities/email-addresses'
import {
  createTestAccountChangeActor,
  createTestAccountChangeProof,
} from '@voucha/test-helpers/account-change'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestPasskeyVoteWeightDirtyUser,
  createTestVerifiedPasskeyRegistration,
} from '@voucha/test-helpers/passkey-registration'
import { holdBackgroundDomain } from '../../../test-helpers/shared-background-worker.mts'
import { dispatchVoteWeightDirtyMarkers } from '../vote-weight/dispatch-dirty-markers.mts'
import { recalculateUserVoteWeight } from '../vote-weight/update.mts'
import { voteWeightWorkConfig } from '../vote-weight/work-limits.mts'
import { deletePasskeyWithMfaProtection } from '../mfa/protected-mfa-delete.mts'
import { createPasskey } from './create.mts'
import { deletePasskey } from './delete.mts'

describe('passkey vote-weight dirty markers', () => {
  it('marks create, standalone delete, and protected delete in their mutations', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, { dispatch_batch_size: 1 }),
    )
    const at = new Date(Date.UTC(2005, 0, 1) + randomInt(0, 30_000_000))
    const { userId, afterId } = await createTestPasskeyVoteWeightDirtyUser(at)
    await addVerifiedEmailForUser(userId, `tests+vote-weight-${userId}@voucha.ai`)
    const dirtyEvent = { userId, jobId: `voteWeight__${userId}__dirtyMarker` }
    await recalculateUserVoteWeight(userId)
    const release = holdBackgroundDomain('vote-aggregation')
    try {
      const created = await runInsideTestWorkerProcessor(() =>
        createPasskey(userId, createTestVerifiedPasskeyRegistration(), 'First'),
      )
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()
      expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(dirtyEvent)
      await recalculateUserVoteWeight(userId)

      await runInsideTestWorkerProcessor(() => deletePasskey(userId, created.id))
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()
      expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(dirtyEvent)
      await recalculateUserVoteWeight(userId)

      const protectedPasskey = await runInsideTestWorkerProcessor(() =>
        createPasskey(userId, createTestVerifiedPasskeyRegistration(), 'Protected'),
      )
      await runInsideTestWorkerProcessor(() =>
        createPasskey(userId, createTestVerifiedPasskeyRegistration(), 'Other'),
      )
      await recalculateUserVoteWeight(userId)
      const actor = await createTestAccountChangeActor(userId)
      await runInsideTestWorkerProcessor(async () =>
        deletePasskeyWithMfaProtection(
          userId,
          protectedPasskey.id,
          await createTestAccountChangeProof(userId, actor.session),
          actor.session,
        ),
      )
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()
      expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(dirtyEvent)
      await recalculateUserVoteWeight(userId)
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeInstanceOf(Date)
    } finally {
      await release()
    }
  })

  it.each([
    { action: 'create', outcome: 'success' },
    { action: 'create', outcome: 'failure' },
    { action: 'delete', outcome: 'success' },
    { action: 'delete', outcome: 'failure' },
    { action: 'protected-delete', outcome: 'success' },
    { action: 'protected-delete', outcome: 'failure' },
  ] as const)(
    '$action settles committed vote-weight admission ($outcome)',
    async ({ action, outcome }) => {
      const user = await createTestUserDirect({ username: safeUsername('passkey-admission') })
      const registration = createTestVerifiedPasskeyRegistration()
      const passkey =
        action === 'create' ? undefined : await insertTestPasskey(user.id, safeUsername('owned'))
      await addVerifiedEmailForUser(user.id, `tests+vote-weight-${user.id}@voucha.ai`)
      if (action === 'protected-delete') await insertTestPasskey(user.id, safeUsername('remaining'))
      const actor = action === 'protected-delete' ? await createTestAccountChangeActor(user.id) : undefined
      const proof = actor ? await createTestAccountChangeProof(user.id, actor.session) : undefined
      const entered = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const failure = new Error('Owned passkey vote-weight admission failure')
      const originalAdd = voteAggregation.add
      let admitted: Awaited<ReturnType<typeof voteAggregation.add>> | undefined
      let admission: ReturnType<typeof voteAggregation.add> | undefined
      let operation: Promise<unknown> | undefined
      const add = vi.spyOn(voteAggregation, 'add').mockImplementation((name, data, options) => {
        if (
          typeof data !== 'object' ||
          data === null ||
          !('userId' in data) ||
          data.userId !== user.id
        )
          return originalAdd.call(voteAggregation, name, data, options)
        entered.resolve()
        admission = release.promise.then(async () => {
          if (outcome === 'failure') throw failure
          admitted = await originalAdd.call(voteAggregation, name, data, options)
          return admitted
        })
        return admission
      })

      try {
        let completed = false
        operation = (
          action === 'create'
            ? createPasskey(user.id, registration, 'Admitted passkey')
            : action === 'delete'
              ? deletePasskey(user.id, passkey!.id)
              : deletePasskeyWithMfaProtection(user.id, passkey!.id, proof, actor!.session)
        ).then(result => {
          completed = true
          return result
        })
        await Promise.race([
          entered.promise,
          operation.then(() => {
            throw new Error('Passkey mutation settled before entering vote-weight admission')
          }),
        ])

        expect(await countTestPasskeys(user.id)).toBe(action === 'delete' ? 0 : 1)
        expect((await getTestUserRaw(user.id))?.vote_weight_recalculated_at).toBeNull()
        expect(completed).toBe(false)
        release.resolve()
        await operation
        const job = admitted ? await voteAggregation.getJob(admitted.id) : undefined
        expect(job?.data).toEqual(outcome === 'success' ? { userId: user.id } : undefined)
        expect(
          sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure),
        ).toHaveLength(outcome === 'failure' ? 1 : 0)
      } finally {
        release.resolve()
        try {
          await operation?.catch(() => undefined)
          await admission?.catch(() => undefined)
          await admitted?.remove()
        } finally {
          add.mockRestore()
        }
      }
    },
  )
})
