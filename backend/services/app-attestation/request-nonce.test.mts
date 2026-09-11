import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { checkAndStoreRequestNonce } from './request-nonce.mts'

describe('checkAndStoreRequestNonce', () => {
  it('returns true for a fresh keyId+nonce pair', async () => {
    const keyId = randomBytes(32).toString('base64')
    const nonce = randomBytes(16).toString('hex')
    const result = await checkAndStoreRequestNonce(keyId, nonce)
    expect(result).toBe(true)
  })

  it('returns false when the same keyId+nonce pair is reused', async () => {
    const keyId = randomBytes(32).toString('base64')
    const nonce = randomBytes(16).toString('hex')

    const first = await checkAndStoreRequestNonce(keyId, nonce)
    expect(first).toBe(true)

    const second = await checkAndStoreRequestNonce(keyId, nonce)
    expect(second).toBe(false)
  })

  it('returns true for the same nonce under a different keyId', async () => {
    const nonce = randomBytes(16).toString('hex')
    const keyId1 = randomBytes(32).toString('base64')
    const keyId2 = randomBytes(32).toString('base64')

    await checkAndStoreRequestNonce(keyId1, nonce)
    const result = await checkAndStoreRequestNonce(keyId2, nonce)
    expect(result).toBe(true)
  })

  it('returns true for a different nonce under the same keyId', async () => {
    const keyId = randomBytes(32).toString('base64')
    const nonce1 = randomBytes(16).toString('hex')
    const nonce2 = randomBytes(16).toString('hex')

    await checkAndStoreRequestNonce(keyId, nonce1)
    const result = await checkAndStoreRequestNonce(keyId, nonce2)
    expect(result).toBe(true)
  })

  it('treats concurrent calls for the same pair atomically — only one wins', async () => {
    const keyId = randomUUID()
    const nonce = randomBytes(16).toString('hex')

    const [a, b] = await Promise.all([
      checkAndStoreRequestNonce(keyId, nonce),
      checkAndStoreRequestNonce(keyId, nonce),
    ])
    const trueCount = [a, b].filter(Boolean).length
    expect(trueCount).toBe(1)
  })
})
