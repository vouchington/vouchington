import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { clearTotpReAuthAttempts, countTotpReAuthAttempt } from './re-auth-failures.mts'

describe('TOTP reauthentication attempt budget', () => {
  it('charges concurrent attempts before verification and clears only the successful user', async () => {
    const userId = randomUUID()
    const otherUserId = randomUUID()
    const attempts = await Promise.allSettled(
      Array.from({ length: 7 }, () => countTotpReAuthAttempt(userId)),
    )
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(6)
    const blocked = attempts.find(result => result.status === 'rejected')
    expect(blocked).toMatchObject({ status: 'rejected', reason: { status: 429 } })
    for (let i = 0; i < 6; i++) await countTotpReAuthAttempt(otherUserId)
    await clearTotpReAuthAttempts(userId)
    await expect(countTotpReAuthAttempt(userId)).resolves.toBeUndefined()
    await expect(countTotpReAuthAttempt(otherUserId)).rejects.toMatchObject({ status: 429 })
  })
})
