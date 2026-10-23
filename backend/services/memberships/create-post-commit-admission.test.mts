import { describe, expect, it, vi } from 'vitest'
import { GlideClient } from '@glidemq/speedkey'
import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import {
  beginTransaction,
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { memberships } from '@queues/memberships/queues'
import { QUEUE_NAME } from '@queues/memberships/config'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { createMembership } from './create.mts'
import { getMembershipByUserId } from './get.mts'
import { updateMembershipFromEvent } from './update.mts'

describe('createMembership post-commit entitlement admission', () => {
  it('waits for owned admission after the membership is durable', async () => {
    const admission = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<'entered'>()
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const enqueue = vi.fn<() => Promise<void>>(() => {
      entered.resolve('entered')
      return admission.promise
    })
    let creation: ReturnType<typeof createMembership> | undefined
    let settled = false
    try {
      creation = createMembership(
        { userId: member.id, plan: 'plus', skuId: sku.id, durationDays: 30 },
        { enqueueDeliverMembershipEntitlementEffects: enqueue },
      ).then(result => {
        settled = true
        return result
      })
      await expect(Promise.race([entered.promise, creation])).resolves.toBe('entered')

      await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
        id: expect.any(String),
        plan: 'plus',
      })
      expect(settled).toBe(false)
      admission.resolve()
      await expect(creation).resolves.toMatchObject({ projected: true })
    } finally {
      admission.resolve()
      await creation?.catch(() => undefined)
    }
  })

  it('holds borrowed actions until the transaction owner commits and awaits admission', async () => {
    const admission = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<'entered'>()
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const enqueue = vi.fn<() => Promise<void>>(() => {
      entered.resolve('entered')
      return admission.promise
    })
    await using transaction = await beginTransaction()
    let commit: Promise<void> | undefined
    try {
      const created = await createMembership(
        { userId: member.id, plan: 'plus', skuId: sku.id, durationDays: 30 },
        { query: transaction, enqueueDeliverMembershipEntitlementEffects: enqueue },
      )
      expect(created.projected).toBe(true)
      expect(enqueue).not.toHaveBeenCalled()

      let settled = false
      commit = transaction.commit().then(() => {
        settled = true
        return undefined
      })
      await expect(Promise.race([entered.promise, commit])).resolves.toBe('entered')
      await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
        id: created.id,
        plan: 'plus',
      })
      expect(settled).toBe(false)
      admission.resolve()
      await commit
    } finally {
      admission.resolve()
      await commit?.catch(() => undefined)
    }
  })

  it('keeps a committed membership successful after the queue factory reports a rejected admission', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const failure = new Error('Owned membership entitlement admission rejection')
    const original = memberships.add
    const spy = vi.spyOn(memberships, 'add').mockImplementation((name, ...args) => {
      if (name === 'deliverMembershipEntitlementEffects') return Promise.reject(failure)
      return original.call(memberships, name, ...args)
    })
    try {
      await expect(
        createMembership({ userId: member.id, plan: 'plus', skuId: sku.id, durationDays: 30 }),
      ).resolves.toMatchObject({ projected: true })

      await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
        id: expect.any(String),
        plan: 'plus',
      })
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure),
      ).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('awaits a started queue admission when enqueue metrics throw after the factory starts it', async () => {
    const admission = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    const admitted = Promise.withResolvers<void>()
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const trackingFailure = new Error('Owned enqueue metric failure')
    const enqueueJob = createEnqueueFunction<
      Record<string, never>,
      'deliverMembershipEntitlementEffects'
    >({
      queue: memberships,
      queueName: QUEUE_NAME,
      jobName: 'deliverMembershipEntitlementEffects',
      trackJobEnqueue() {
        throw trackingFailure
      },
    })
    const enqueue = async () => {
      await enqueueJob({})
    }
    const original = memberships.add
    let startedQueueAdmission: ReturnType<typeof memberships.add> | undefined
    const spy = vi.spyOn(memberships, 'add').mockImplementation((name, ...args) => {
      const started = original.call(memberships, name, ...args)
      if (name !== 'deliverMembershipEntitlementEffects') return started
      startedQueueAdmission = started
      entered.resolve()
      return started.then(
        async job => {
          admitted.resolve()
          await admission.promise
          return job
        },
        err => {
          admitted.reject(err)
          throw err
        },
      )
    })
    let creation: ReturnType<typeof createMembership> | undefined
    let settled = false
    try {
      creation = createMembership(
        { userId: member.id, plan: 'plus', skuId: sku.id, durationDays: 30 },
        { enqueueDeliverMembershipEntitlementEffects: enqueue },
      ).then(result => {
        settled = true
        return result
      })
      await expect(
        Promise.race([
          entered.promise.then(() => 'started' as const),
          creation.then(() => 'settled' as const),
        ]),
      ).resolves.toBe('started')
      await expect(
        Promise.race([
          admitted.promise.then(() => 'admitted' as const),
          creation.then(() => 'settled' as const),
        ]),
      ).resolves.toBe('admitted')
      await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
        id: expect.any(String),
        plan: 'plus',
      })
      expect(settled).toBe(false)
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === trackingFailure),
      ).toHaveLength(1)

      admission.resolve()
      await expect(creation).resolves.toMatchObject({ projected: true })
    } finally {
      admission.resolve()
      await creation?.catch(() => undefined)
      const job = await startedQueueAdmission?.catch(() => null)
      if (job) await job.remove()
      spy.mockRestore()
    }
  })

  it.each(['factory rejection', 'raw reactivation failure'] as const)(
    'keeps a committed membership update successful after a vote-weight %s',
    async failureMode => {
      const member = await createTestUser()
      const membership = await createTestMembership({ user_id: member.id })
      const jobId = `voteWeight__${member.id}__force`
      const failure = new Error(`Owned vote-weight ${failureMode}`)
      const originalAddBulk = voteAggregation.addBulk
      const addBulk = vi.spyOn(voteAggregation, 'addBulk').mockImplementation(jobs => {
        if (!jobs.some(job => job.opts?.jobId === jobId))
          return originalAddBulk.call(voteAggregation, jobs)
        return failureMode === 'factory rejection' ? Promise.reject(failure) : Promise.resolve([])
      })
      const originalWatch = GlideClient.prototype.watch
      const watch = vi.spyOn(GlideClient.prototype, 'watch').mockImplementation(function (
        this: GlideClient,
        keys,
      ) {
        if (
          keys.some(key =>
            (typeof key === 'string' ? key : Buffer.from(key).toString()).endsWith(`:job:${jobId}`),
          )
        )
          return Promise.reject(failure)
        return originalWatch.call(this, keys)
      })
      try {
        const result = await updateMembershipFromEvent(
          { membershipId: membership.id, status: 'past_due' },
          async () => {},
        )

        expect(result?.current.status).toBe('past_due')
        await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
          status: 'past_due',
        })
        expect(
          sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure),
        ).toHaveLength(1)
        expect(
          watch.mock.calls.some(([keys]) =>
            keys.some(key =>
              (typeof key === 'string' ? key : Buffer.from(key).toString()).endsWith(
                `:job:${jobId}`,
              ),
            ),
          ),
        ).toBe(failureMode === 'raw reactivation failure')
      } finally {
        watch.mockRestore()
        addBulk.mockRestore()
      }
    },
  )
})
