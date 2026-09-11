import { describe, it, expect } from 'vitest'
import { getOrCreateActorKeyPair, getActorPrivateKeyPem } from './get-or-create.mts'
import { getActorKeyId } from '@modules/activitypub-uris'
import { createTestUserDirect } from '@voucha/test-helpers'

describe('getOrCreateActorKeyPair', () => {
  it('generates and persists a keypair on first call', async () => {
    const user = await createTestUserDirect()

    const row = await getOrCreateActorKeyPair(user.id)

    expect(row.user_id).toBe(user.id)
    expect(row.key_id).toBe(getActorKeyId(user.id))
    expect(row.public_key_pem).toContain('BEGIN PUBLIC KEY')
    // The ciphertext must never be a plaintext PEM.
    expect(row.private_key_ciphertext).not.toContain('BEGIN PRIVATE KEY')
  })

  it('returns the same keypair on a second call instead of rotating it', async () => {
    const user = await createTestUserDirect()

    const first = await getOrCreateActorKeyPair(user.id)
    const second = await getOrCreateActorKeyPair(user.id)

    expect(second.public_key_pem).toBe(first.public_key_pem)
    expect(second.private_key_ciphertext).toBe(first.private_key_ciphertext)
  })

  it('resolves a concurrent first-call race to a single stored keypair', async () => {
    const user = await createTestUserDirect()

    const [a, b] = await Promise.all([
      getOrCreateActorKeyPair(user.id),
      getOrCreateActorKeyPair(user.id),
    ])

    expect(a.public_key_pem).toBe(b.public_key_pem)
  })
})

describe('getActorPrivateKeyPem', () => {
  it('returns null when the user has no actor keypair yet', async () => {
    const user = await createTestUserDirect()
    expect(await getActorPrivateKeyPem(user.id)).toBeNull()
  })

  it('decrypts back to a valid PEM-encoded private key', async () => {
    const user = await createTestUserDirect()
    await getOrCreateActorKeyPair(user.id)

    const privateKeyPem = await getActorPrivateKeyPem(user.id)

    expect(privateKeyPem).toContain('BEGIN PRIVATE KEY')
  })
})
