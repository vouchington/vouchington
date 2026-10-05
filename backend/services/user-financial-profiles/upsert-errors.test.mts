import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { getUserFinancialProfile } from './get.mts'
import { upsertUserFinancialProfile } from './upsert.mts'

describe('financial profile storage failures', () => {
  it('accepts an empty patch while preserving the existing financial fields', async () => {
    const user = await createTestUser()
    const baseline = await upsertUserFinancialProfile(user.id, { hard_inquiries_12m: 2 })
    expect(await upsertUserFinancialProfile(user.id, {})).toMatchObject({
      hard_inquiries_12m: baseline.hard_inquiries_12m,
      currency: baseline.currency,
    })
    expect(await getUserFinancialProfile(user.id)).toMatchObject({ hard_inquiries_12m: 2 })
  })

  it('propagates the actual failed statement and preserves the previous profile', async () => {
    const user = await createTestUser()
    const baseline = await upsertUserFinancialProfile(user.id, { hard_inquiries_12m: 2 })

    const failure = await withPostgresQueryFailureForTest(
      '/* upsertUserFinancialProfile */',
      async () => {
        try {
          await upsertUserFinancialProfile(user.id, { hard_inquiries_12m: 7 })
          throw new Error('Profile update unexpectedly succeeded')
        } catch (err) {
          return err
        }
      },
      { command: 'INSERT' },
    )

    expect(failure.result).toMatchObject({ code: '25P02' })
    expect(failure.result).toBe(failure.error)
    expect(await getUserFinancialProfile(user.id)).toEqual(baseline)
    await expect(
      upsertUserFinancialProfile(user.id, { hard_inquiries_12m: 3 }),
    ).resolves.toMatchObject({ hard_inquiries_12m: 3 })
  })

  it('leaves the same SQL in another async context healthy while the fault is installed', async () => {
    const [targetUser, otherUser] = await Promise.all([createTestUser(), createTestUser()])
    const installed = Promise.withResolvers<void>()
    const outsideCompleted = Promise.withResolvers<void>()
    const outside = (async () => {
      await installed.promise
      try {
        return await upsertUserFinancialProfile(otherUser.id, { hard_inquiries_12m: 4 })
      } finally {
        outsideCompleted.resolve()
      }
    })()

    const failure = await withPostgresQueryFailureForTest(
      '/* upsertUserFinancialProfile */',
      async () => {
        installed.resolve()
        await outsideCompleted.promise
        try {
          await upsertUserFinancialProfile(targetUser.id, { hard_inquiries_12m: 8 })
          throw new Error('Profile creation unexpectedly succeeded')
        } catch (err) {
          return err
        }
      },
      { command: 'INSERT' },
    )

    expect(failure.result).toMatchObject({ code: '25P02' })
    expect(failure.result).toBe(failure.error)
    expect(await outside).toMatchObject({ hard_inquiries_12m: 4 })
    expect(await getUserFinancialProfile(targetUser.id)).toBeNull()
    await expect(
      upsertUserFinancialProfile(targetUser.id, { hard_inquiries_12m: 1 }),
    ).resolves.toMatchObject({ hard_inquiries_12m: 1 })
  })
})
