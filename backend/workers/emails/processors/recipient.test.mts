import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { addVerifiedEmailForUser } from '@voucha/test-helpers/entities/email-addresses'
import { getDirectEmailAddress, resolveEmailRecipient } from './recipient.mts'

describe('resolveEmailRecipient', () => {
  it('returns explicit addresses without a user lookup', async () => {
    await expect(
      resolveEmailRecipient({ emailAddress: 'tests+direct@voucha.ai' }),
    ).resolves.toEqual({
      status: 'resolved',
      emailAddress: 'tests+direct@voucha.ai',
      userId: null,
    })
  })

  it('resolves a user address at processing time', async () => {
    const user = await createTestUserDirect()
    const emailAddress = `worker-${crypto.randomUUID()}@voucha.ai`
    await addVerifiedEmailForUser(user.id, emailAddress)
    await expect(resolveEmailRecipient({ userId: user.id })).resolves.toEqual({
      status: 'resolved',
      emailAddress,
      userId: user.id,
    })
  })

  it('revalidates legacy jobs that contain both a user and stale address', async () => {
    const user = await createTestUserDirect()
    const emailAddress = `worker-${crypto.randomUUID()}@voucha.ai`
    await addVerifiedEmailForUser(user.id, emailAddress)
    await expect(
      resolveEmailRecipient({ userId: user.id, emailAddress: 'tests+stale@voucha.ai' }),
    ).resolves.toEqual({
      status: 'resolved',
      emailAddress,
      userId: user.id,
    })
  })

  it('returns a typed no-address skip', async () => {
    const user = await createTestUserDirect()
    await expect(resolveEmailRecipient({ userId: user.id })).resolves.toEqual({
      status: 'skipped',
      reason: 'no_verified_email',
      userId: user.id,
    })
  })

  it('rejects missing recipients for generic and direct-only jobs', async () => {
    await expect(resolveEmailRecipient({} as never)).rejects.toThrow('requires a recipient')
    expect(() => getDirectEmailAddress({} as never)).toThrow('requires emailAddress')
  })
})
