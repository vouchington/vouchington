import { describe, expect, it } from 'vitest'
import { computeDigest } from './digest.mts'
import { generateRsaSha256KeyPair } from './keys.mts'
import { extractSignatureKeyId, verifySignature } from './verify.mts'
import {
  BODY,
  buildManualSignature,
  FULL_HEADERS,
  HOST,
  KEY_ID,
  METHOD,
  PATH,
} from './verify-test-helpers.mts'

describe('verifySignature additionalHeaders', () => {
  it('verifies a signature that also covers content-type via additionalHeaders', () => {
    const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
    const dateHeader = new Date().toUTCString()
    const digestHeader = computeDigest(BODY)
    const contentType = 'application/activity+json'
    const signatureHeader = buildManualSignature({
      privateKeyPem,
      dateHeader,
      digestHeader,
      headerNames: [...FULL_HEADERS, 'content-type'],
      additionalHeaders: { 'content-type': contentType },
    })

    const result = verifySignature(
      METHOD,
      PATH,
      HOST,
      BODY,
      signatureHeader,
      digestHeader,
      dateHeader,
      publicKeyPem,
      { additionalHeaders: { 'content-type': contentType } },
    )

    expect(result.valid).toBe(true)
  })

  it('rejects a signed header not present in additionalHeaders', () => {
    const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
    const dateHeader = new Date().toUTCString()
    const digestHeader = computeDigest(BODY)
    const signatureHeader = buildManualSignature({
      privateKeyPem,
      dateHeader,
      digestHeader,
      headerNames: [...FULL_HEADERS, 'x-custom-header'],
      additionalHeaders: { 'x-custom-header': 'anything' },
    })

    const result = verifySignature(
      METHOD,
      PATH,
      HOST,
      BODY,
      signatureHeader,
      digestHeader,
      dateHeader,
      publicKeyPem,
    )

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Unknown signed header: x-custom-header')
  })
})

describe('verifySignature malformed input handling', () => {
  it('rejects a corrupted public key PEM', () => {
    const dateHeader = new Date().toUTCString()
    const digestHeader = computeDigest(BODY)

    const result = verifySignature(
      METHOD,
      PATH,
      HOST,
      BODY,
      'Signature keyId="x",headers="(request-target) host date digest",signature="abc"',
      digestHeader,
      dateHeader,
      'not a public key pem',
    )

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Signature verification exception: Invalid public key PEM format')
  })

  it('rejects a completely malformed signature header', () => {
    const { publicKeyPem } = generateRsaSha256KeyPair()
    const dateHeader = new Date().toUTCString()
    const digestHeader = computeDigest(BODY)

    const result = verifySignature(
      METHOD,
      PATH,
      HOST,
      BODY,
      'not a signature header at all',
      digestHeader,
      dateHeader,
      publicKeyPem,
    )

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid signature header format')
  })

  it('rejects an empty signature header', () => {
    const { publicKeyPem } = generateRsaSha256KeyPair()
    const dateHeader = new Date().toUTCString()
    const digestHeader = computeDigest(BODY)

    const result = verifySignature(
      METHOD,
      PATH,
      HOST,
      BODY,
      '',
      digestHeader,
      dateHeader,
      publicKeyPem,
    )

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid signature header format')
  })

  it('rejects a signature header missing the headers= parameter', () => {
    const { publicKeyPem } = generateRsaSha256KeyPair()
    const dateHeader = new Date().toUTCString()
    const digestHeader = computeDigest(BODY)

    const result = verifySignature(
      METHOD,
      PATH,
      HOST,
      BODY,
      'Signature keyId="x",algorithm="rsa-sha256",signature="abc"',
      digestHeader,
      dateHeader,
      publicKeyPem,
    )

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid signature header format')
  })

  it('rejects a missing/empty digest header', () => {
    const { publicKeyPem } = generateRsaSha256KeyPair()
    const dateHeader = new Date().toUTCString()

    const result = verifySignature(
      METHOD,
      PATH,
      HOST,
      BODY,
      'Signature keyId="x",headers="(request-target) host date digest",signature="abc"',
      '',
      dateHeader,
      publicKeyPem,
    )

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Digest verification failed')
  })

  it('defaults a missing algorithm when keyId contains a comma', () => {
    const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
    const dateHeader = new Date().toUTCString()
    const digestHeader = computeDigest(BODY)
    const signatureHeader = buildManualSignature({
      privateKeyPem,
      dateHeader,
      digestHeader,
      headerNames: FULL_HEADERS,
      algorithm: null,
      keyId: 'https://alice.example.com/ap/users/a,b#main-key',
    })

    const result = verifySignature(
      METHOD,
      PATH,
      HOST,
      BODY,
      signatureHeader,
      digestHeader,
      dateHeader,
      publicKeyPem,
    )

    expect(result.valid).toBe(true)
  })
})

describe('extractSignatureKeyId', () => {
  it('extracts the keyId from a well-formed Signature header', () => {
    expect(
      extractSignatureKeyId(
        `Signature keyId="${KEY_ID}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="abc"`,
      ),
    ).toBe(KEY_ID)
  })

  it('returns undefined when the keyId parameter is absent', () => {
    expect(
      extractSignatureKeyId(
        'Signature headers="(request-target) host date digest",signature="abc"',
      ),
    ).toBeUndefined()
  })

  it('returns undefined for an empty header', () => {
    expect(extractSignatureKeyId('')).toBeUndefined()
  })
})
