import { describe, expect, it } from 'vitest'
import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce'

describe('pkce', () => {
  it('generates a 32-byte code verifier encoded as base64url', () => {
    const verifier = generateCodeVerifier()
    expect(verifier).toBeTypeOf('string')
    // 32 bytes in base64 is 44 characters, base64url removes padding
    expect(verifier.length).toBe(43)
    expect(verifier).toMatch(/^[a-zA-Z0-9\-_]+$/)
  })

  it('generates a 16-byte state hex string', () => {
    const state = generateState()
    expect(state).toBeTypeOf('string')
    expect(state.length).toBe(32) // 16 bytes = 32 hex chars
    expect(state).toMatch(/^[a-f0-9]+$/)
  })

  it('generates a SHA-256 code challenge encoded as base64url', async () => {
    const challenge = await generateCodeChallenge('test-verifier')
    // echo -n "test-verifier" | openssl dgst -binary -sha256 | base64 | tr '+/' '-_' | tr -d '='
    expect(challenge).toBe('JBbiqONGWPaAmwXk_8bT6UnlPfrn65D32eZlJS-zGG0')
  })
})
