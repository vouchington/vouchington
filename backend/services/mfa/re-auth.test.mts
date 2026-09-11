import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createReAuthToken, verifyAndDeleteReAuthToken } from './re-auth.mts'

describe('re-auth', () => {
  it('consumes re-auth tokens exactly once', async () => {
    const userId = randomUUID()
    const token = await createReAuthToken(userId)

    await expect(verifyAndDeleteReAuthToken(userId, token)).resolves.toBe(true)
    await expect(verifyAndDeleteReAuthToken(userId, token)).resolves.toBe(false)
  })

  it('rejects non-UUID re-auth tokens before lookup', async () => {
    const userId = randomUUID()
    const token = await createReAuthToken(userId)

    await expect(verifyAndDeleteReAuthToken(userId, 'not-a-uuid')).resolves.toBe(false)
    await expect(verifyAndDeleteReAuthToken(userId, token)).resolves.toBe(true)
  })
})
