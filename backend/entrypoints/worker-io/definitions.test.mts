import { describe, expect, it } from 'vitest'
import { upsertSchedules as upsertBloomFilterSchedules } from '@queues/bloom-filters/enqueues/schedules'
import { upsertSchedules as upsertMembershipSchedules } from '@queues/memberships/enqueues/schedules'
import { upsertSchedules as upsertPsqlSchedules } from '@queues/psql/enqueues/schedules'
import { SCHEDULE_DEFINITIONS } from './definitions.mts'

describe('worker-io SCHEDULE_DEFINITIONS load functions', () => {
  it('each schedule definition load resolves to the expected export', async () => {
    const byQueue = (name: string) => SCHEDULE_DEFINITIONS.find(d => d.queueName === name)!

    expect(SCHEDULE_DEFINITIONS.some(d => d.queueName === 'emails')).toBe(false)
    await expect(byQueue('psql').load()).resolves.toBe(upsertPsqlSchedules)
    await expect(byQueue('bloom-filters').load()).resolves.toBe(upsertBloomFilterSchedules)
    await expect(byQueue('memberships').load()).resolves.toBe(upsertMembershipSchedules)
    await expect(byQueue('background').load()).resolves.toBeTypeOf('function')
  })

  it('registers the background (including account recovery) and Stripe recovery schedules', async () => {
    const upsertBackgroundSchedules = await SCHEDULE_DEFINITIONS.find(
      d => d.queueName === 'background',
    )!.load()
    await expect(
      Promise.all([upsertBackgroundSchedules(), upsertMembershipSchedules()]),
    ).resolves.toHaveLength(2)
  })
})
