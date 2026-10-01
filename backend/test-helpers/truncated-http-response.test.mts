import { describe, expect, it } from 'vitest'
import { withTruncatedHttpResponseForTest } from './truncated-http-response.mts'

describe('owned truncated HTTP response', () => {
  it('returns real response headers and rejects body consumption with an actual socket error', async () => {
    const url = 'https://owned-truncated.example.com/robots.txt'
    await withTruncatedHttpResponseForTest(url, async (transport, requestCount) => {
      const response = await transport(url)
      expect(response.status).toBe(200)
      const failure = await response.text().catch((err: unknown) => err)
      expect(failure).toBeInstanceOf(TypeError)
      expect(failure).toMatchObject({ cause: { code: 'UND_ERR_SOCKET' } })
      expect(requestCount()).toBe(1)
    })
  })
})
