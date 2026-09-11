import { describe, expect, it } from 'vitest'
import { scrubRequestUrlFields } from './observability-scrubbing.mts'

describe('scrubRequestUrlFields multi-value URL headers', () => {
  it('strips query strings from every string value in a multi-value referer header', () => {
    const headers = {
      referer: [
        'https://example.com/unsubscribe?token=abc123',
        'https://example.com/verify#access_token=def456',
        42,
      ],
    }

    const result = scrubRequestUrlFields({ headers })

    expect(result?.headers).toEqual({
      referer: ['https://example.com/unsubscribe', 'https://example.com/verify', 42],
    })
    expect(headers.referer).toEqual([
      'https://example.com/unsubscribe?token=abc123',
      'https://example.com/verify#access_token=def456',
      42,
    ])
  })

  it('preserves a safe sibling URL-header array when another URL header is scrubbed', () => {
    const dirtyReferer = ['https://example.com/unsubscribe?token=abc123']
    const safeReferrer = ['https://example.com/verify']
    const headers = { referer: dirtyReferer, referrer: safeReferrer }

    const result = scrubRequestUrlFields({ headers })

    expect(result?.headers).not.toBe(headers)
    expect(result?.headers?.referer).toEqual(['https://example.com/unsubscribe'])
    expect(result?.headers?.referer).not.toBe(dirtyReferer)
    expect(result?.headers?.referrer).toBe(safeReferrer)
    expect(dirtyReferer).toEqual(['https://example.com/unsubscribe?token=abc123'])
    expect(safeReferrer).toEqual(['https://example.com/verify'])
  })
})
