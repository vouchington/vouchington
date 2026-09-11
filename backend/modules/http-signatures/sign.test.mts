import { describe, expect, it } from 'vitest'
import { generateRsaSha256KeyPair } from './keys.mts'
import { buildSignatureHeaders, withSignatureHeaders } from './sign.mts'
import { verifySignature } from './verify.mts'
import { computeDigest, verifyDigest } from './digest.mts'

const KEY_ID = 'https://alice.example.com/ap/users/alice#main-key'

function verifyUrl(
  method: string,
  url: string,
  body: string | Buffer,
  publicKeyPem: string,
  signatureHeaders: { signature: string; digest: string; date: string },
) {
  const urlObj = new URL(url)
  return verifySignature(
    method,
    urlObj.pathname + urlObj.search,
    urlObj.host,
    body,
    signatureHeaders.signature,
    signatureHeaders.digest,
    signatureHeaders.date,
    publicKeyPem,
  )
}

describe('HTTP Signature round-trip', () => {
  it('signs and verifies a request with an RSA-2048 keypair', () => {
    const keypair = generateRsaSha256KeyPair()
    const method = 'POST'
    const url = 'https://mastodon.social/inbox'
    const body = JSON.stringify({ type: 'Follow', object: 'https://alice.example.com' })

    const signatureHeaders = buildSignatureHeaders(method, url, body, KEY_ID, keypair.privateKeyPem)
    const result = verifyUrl(method, url, body, keypair.publicKeyPem, signatureHeaders)

    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('detects a tampered body via digest mismatch', () => {
    const keypair = generateRsaSha256KeyPair()
    const method = 'POST'
    const url = 'https://mastodon.social/inbox'
    const originalBody = JSON.stringify({ type: 'Follow', object: 'https://alice.example.com' })
    const tamperedBody = JSON.stringify({ type: 'Follow', object: 'https://malicious.example.com' })

    const signatureHeaders = buildSignatureHeaders(
      method,
      url,
      originalBody,
      KEY_ID,
      keypair.privateKeyPem,
    )
    const result = verifyUrl(method, url, tamperedBody, keypair.publicKeyPem, signatureHeaders)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Digest verification failed')
  })

  it('handles a GET request with an empty body', () => {
    const keypair = generateRsaSha256KeyPair()
    const method = 'GET'
    const url = 'https://mastodon.social/ap/users/alice'
    const body = ''

    const signatureHeaders = buildSignatureHeaders(method, url, body, KEY_ID, keypair.privateKeyPem)
    const result = verifyUrl(method, url, body, keypair.publicKeyPem, signatureHeaders)

    expect(result.valid).toBe(true)
  })

  it('rejects verification against the wrong public key', () => {
    const keypair1 = generateRsaSha256KeyPair()
    const keypair2 = generateRsaSha256KeyPair()
    const method = 'POST'
    const url = 'https://mastodon.social/inbox'
    const body = JSON.stringify({ type: 'Follow', object: 'https://alice.example.com' })

    const signatureHeaders = buildSignatureHeaders(
      method,
      url,
      body,
      KEY_ID,
      keypair1.privateKeyPem,
    )
    const result = verifyUrl(method, url, body, keypair2.publicKeyPem, signatureHeaders)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Signature verification failed')
  })

  it('signs and verifies a request whose URL has a query string', () => {
    const keypair = generateRsaSha256KeyPair()
    const method = 'GET'
    const url = 'https://mastodon.social/ap/users/alice/outbox?page=1&limit=10'
    const body = ''

    const signatureHeaders = buildSignatureHeaders(method, url, body, KEY_ID, keypair.privateKeyPem)
    const result = verifyUrl(method, url, body, keypair.publicKeyPem, signatureHeaders)

    expect(result.valid).toBe(true)
  })

  it('handles a Buffer body identically to its string equivalent', () => {
    const keypair = generateRsaSha256KeyPair()
    const method = 'POST'
    const url = 'https://mastodon.social/inbox'
    const bodyString = JSON.stringify({ type: 'Follow', object: 'https://alice.example.com' })
    const bodyBuffer = Buffer.from(bodyString, 'utf-8')

    const signatureHeaders = buildSignatureHeaders(
      method,
      url,
      bodyBuffer,
      KEY_ID,
      keypair.privateKeyPem,
    )
    const result = verifyUrl(method, url, bodyString, keypair.publicKeyPem, signatureHeaders)

    expect(result.valid).toBe(true)
  })

  it('handles large JSON bodies', () => {
    const keypair = generateRsaSha256KeyPair()
    const method = 'POST'
    const url = 'https://mastodon.social/inbox'
    const largeBody = JSON.stringify({
      type: 'Create',
      object: {
        type: 'Note',
        content: 'A'.repeat(10_000),
        attributedTo: 'https://alice.example.com',
      },
    })

    const signatureHeaders = buildSignatureHeaders(
      method,
      url,
      largeBody,
      KEY_ID,
      keypair.privateKeyPem,
    )
    const result = verifyUrl(method, url, largeBody, keypair.publicKeyPem, signatureHeaders)

    expect(result.valid).toBe(true)
  })

  it('signs and verifies across HTTP methods', () => {
    const keypair = generateRsaSha256KeyPair()
    const url = 'https://mastodon.social/inbox'
    const body = ''

    for (const method of ['GET', 'POST', 'DELETE', 'PUT']) {
      const signatureHeaders = buildSignatureHeaders(
        method,
        url,
        body,
        KEY_ID,
        keypair.privateKeyPem,
      )
      const result = verifyUrl(method, url, body, keypair.publicKeyPem, signatureHeaders)
      expect(result.valid).toBe(true)
    }
  })

  it('rejects signing with a malformed private key PEM', () => {
    expect(() =>
      buildSignatureHeaders('POST', 'https://mastodon.social/inbox', '{}', KEY_ID, 'not a pem'),
    ).toThrow('Invalid private key PEM format')
  })

  it('computeDigest/verifyDigest stay consistent with the signed digest', () => {
    const body = JSON.stringify({ type: 'Follow', object: 'https://alice.example.com' })
    const digest = computeDigest(body)

    expect(computeDigest(body)).toBe(digest)
    expect(verifyDigest(body, digest)).toBe(true)
    expect(verifyDigest('different body', digest)).toBe(false)
  })

  it('withSignatureHeaders merges signature headers without mutating the input', () => {
    const keypair = generateRsaSha256KeyPair()
    const method = 'POST'
    const url = 'https://mastodon.social/inbox'
    const body = JSON.stringify({ type: 'Follow', object: 'https://alice.example.com' })

    const signatureHeaders = buildSignatureHeaders(method, url, body, KEY_ID, keypair.privateKeyPem)
    const baseHeaders = { 'content-type': 'application/activity+json' }
    const merged = withSignatureHeaders(baseHeaders, signatureHeaders)

    expect(baseHeaders).toEqual({ 'content-type': 'application/activity+json' })
    expect(merged).toEqual({
      'content-type': 'application/activity+json',
      digest: signatureHeaders.digest,
      signature: signatureHeaders.signature,
      date: signatureHeaders.date,
    })
  })
})
