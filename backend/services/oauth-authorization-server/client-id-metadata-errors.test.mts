import { describe, expect, it, vi } from 'vitest'
import { unavailableClientIdMetadata } from './client-id-metadata-errors.mts'

describe('Client ID Metadata Document errors', () => {
  it('reports transport failures while keeping the protocol error generic', () => {
    const cause = new Error('TLS handshake failed')
    const reportError = vi.fn<(error: Error) => void>()

    const error = unavailableClientIdMetadata(cause, reportError)

    expect(error).toMatchObject({
      cause,
      code: 'unauthorized_client',
      message: 'client metadata document is unavailable',
    })
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ cause, message: 'OAuth client metadata fetch failed' }),
    )
  })
})
