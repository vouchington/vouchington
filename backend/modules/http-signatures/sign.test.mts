import { describe, expect, it } from 'vitest'
import { withSignatureHeaders } from './sign.mts'

describe('withSignatureHeaders', () => {
  it('merges signature headers without mutating the input', () => {
    const signatureHeaders = {
      digest: 'SHA-256=body-digest',
      signature: 'signed-request',
      date: 'Sun, 25 Oct 2026 12:00:00 GMT',
    }
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
