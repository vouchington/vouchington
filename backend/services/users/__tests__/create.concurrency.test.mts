import { createRandomEmailAddress, createRandomPhoneNumber } from '@voucha/test-helpers'
import { it, expect, describe } from 'vitest'
import { verifyPhoneNumber } from '@modules/utils'
import { upsertUser } from '../create.mts'
import { v7 } from 'uuid'

describe('create.concurrency', () => {
  it('concurrent upsertUser with same email converges to one user with no errors', async () => {
    const emailAddress = createRandomEmailAddress()
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        upsertUser({ emailAddress, sessionId: v7(), deviceId: v7() }),
      ),
    )

    const rejected = results.filter(r => r.status === 'rejected')
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof upsertUser>>
    >[]

    expect(rejected).toHaveLength(0)
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)

    const ids = new Set(fulfilled.map(r => r.value.id))
    expect(ids.size).toBe(1)

    for (const result of fulfilled) {
      expect(result.value.email_address).toBe(emailAddress)
    }
  })

  it('concurrent upsertUser with same phone number converges to one user with no errors', async () => {
    // Normalize to E.164 so DB inserts and lookups match (createRandomPhoneNumber returns raw format)
    const phoneNumber = verifyPhoneNumber(createRandomPhoneNumber())
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => upsertUser({ phoneNumber, sessionId: v7(), deviceId: v7() })),
    )

    const rejected = results.filter(r => r.status === 'rejected')
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof upsertUser>>
    >[]

    expect(rejected).toHaveLength(0)
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)

    const ids = new Set(fulfilled.map(r => r.value.id))
    expect(ids.size).toBe(1)

    for (const result of fulfilled) {
      expect(result.value.phone_number).toBe(phoneNumber)
    }
  })
})
