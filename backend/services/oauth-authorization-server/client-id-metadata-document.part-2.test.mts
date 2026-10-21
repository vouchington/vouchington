import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  CLIENT_ID_METADATA_REQUEST_TIMEOUT_MS,
  resolveClientIdMetadataDocument,
} from './client-id-metadata-document.mts'

describe('Client ID Metadata Documents', () => {
  it('aborts a metadata request that exceeds the request timeout', async () => {
    const clientId = `https://client.example/${randomBytes(12).toString('hex')}/metadata.json`
    const requested = Promise.withResolvers<AbortSignal>()
    const cause = new Error('aborted')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const result = resolveClientIdMetadataDocument(clientId, {
        safeFetch: (_url, options) =>
          new Promise((_resolve, reject) => {
            const signal = options?.signal
            if (!signal) {
              const failure = new Error('Metadata request did not supply its abort signal')
              requested.reject(failure)
              reject(failure)
              return
            }
            signal.addEventListener('abort', () => reject(cause), { once: true })
            requested.resolve(signal)
          }),
      }).catch((err: unknown) => err)
      const signal = await requested.promise
      await vi.advanceTimersByTimeAsync(CLIENT_ID_METADATA_REQUEST_TIMEOUT_MS - 1)
      expect(signal.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await expect(result).resolves.toMatchObject({ cause, code: 'unauthorized_client' })
      expect(signal.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
