import { describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { v7 } from 'uuid'
import { decodeDeviceJwt } from '../jwt.mts'

const key = new TextEncoder().encode('synthetic-device-decode-key')

async function encode(payload: Record<string, unknown>) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(key)
}

describe('device cookie classification', () => {
  it('decodes a well-shaped device payload without treating it as verified', async () => {
    const payload = { did: v7(), client: 'web', ua_hash: 'a'.repeat(64) }
    expect(decodeDeviceJwt(await encode(payload))).toMatchObject(payload)
  })

  it('rejects malformed device fields and invalid tokens', async () => {
    expect(decodeDeviceJwt(await encode({ did: 'invalid-device-id' }))).toBeNull()
    expect(decodeDeviceJwt('invalid-token')).toBeNull()
  })
})
