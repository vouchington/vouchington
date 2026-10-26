import { beforeAll, describe, expect, it } from 'vitest'
import { exportJWK, generateKeyPair, type JWK } from 'jose'
import { parseDeviceBoundSessionBinding } from './dbsc-state-schema.mts'

const origin = 'https://binding.example'
const boundAt = '2026-01-02T03:04:05.000Z'
let publicKey: JWK
let privateKey: JWK

function binding() {
  return { publicKey, origin, boundAt }
}

const unavailable = expect.objectContaining({ status: 401, code: 'SESSION_RELOGIN_REQUIRED' })

describe('persisted device-bound session binding', () => {
  beforeAll(async () => {
    const pair = await generateKeyPair('ES256', { extractable: true })
    publicKey = await exportJWK(pair.publicKey)
    privateKey = await exportJWK(pair.privateKey)
  })
  it('rehydrates a canonical HTTPS binding with only the public P-256 key material', () => {
    const parsed = parseDeviceBoundSessionBinding({
      ...binding(),
      publicKey: { ...publicKey, kid: 'synthetic-device-key', alg: 'ES256' },
    })
    expect(parsed).toEqual({
      publicKey: { kty: 'EC', crv: 'P-256', x: publicKey.x, y: publicKey.y },
      origin,
      boundAt,
    })
  })

  it.each([null, [], 42, 'serialized binding'])(
    'rejects a binding that is not a persisted object: %j',
    value => {
      expect(() => parseDeviceBoundSessionBinding(value)).toThrow(unavailable)
    },
  )

  it.each([undefined, null, [], 42, 'serialized key'])(
    'rejects a key that is not a public JWK object: %j',
    value => {
      expect(() => parseDeviceBoundSessionBinding({ ...binding(), publicKey: value })).toThrow(
        unavailable,
      )
    },
  )

  it('rejects persisted private key material even when its public coordinates are valid', () => {
    expect(privateKey.d).toBeDefined()
    expect(() => parseDeviceBoundSessionBinding({ ...binding(), publicKey: privateKey })).toThrow(
      unavailable,
    )
  })

  it.each([
    { name: 'unsupported key type', override: { kty: 'RSA' } },
    { name: 'unsupported curve', override: { crv: 'P-384' } },
    { name: 'missing coordinate', override: { x: undefined } },
    { name: 'malformed coordinate', override: { y: 'invalid coordinate' } },
  ])('rejects $name in persisted key material', ({ override }) => {
    expect(() =>
      parseDeviceBoundSessionBinding({ ...binding(), publicKey: { ...publicKey, ...override } }),
    ).toThrow(unavailable)
  })

  it('rejects unknown binding fields rather than accepting a different persisted shape', () => {
    expect(() =>
      parseDeviceBoundSessionBinding({ ...binding(), alternateOrigin: 'https://other.example' }),
    ).toThrow(unavailable)
  })

  it.each([
    'not a URL',
    'http://binding.example',
    'https://BINDING.example',
    'https://binding.example:443',
    'https://binding.example/',
    'https://binding.example/path',
    'https://user@binding.example',
  ])('rejects an invalid or noncanonical persisted origin: %s', value => {
    expect(() => parseDeviceBoundSessionBinding({ ...binding(), origin: value })).toThrow(
      unavailable,
    )
  })

  it.each([undefined, null, 42, 'not a date'])('rejects an invalid persisted date: %j', value => {
    expect(() => parseDeviceBoundSessionBinding({ ...binding(), boundAt: value })).toThrow(
      unavailable,
    )
  })
})
