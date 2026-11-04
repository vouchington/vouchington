import { describe, expect, it, vi } from 'vitest'
import { takeRecordedServerErrorResponses } from '@voucha/test-helpers/api/server-error-responses'

const resetPath = '/api/v1/__tests__/server-error-responses-reset-boom'

// Re-evaluating the whole API app is cold work that can exceed the 5 s hook budget on a loaded
// shard, so it runs in the file body. The reset repoints the shared server, which is why this case
// owns its file.
vi.resetModules()
const fresh = await import('@voucha/test-helpers/api/server')
const { default: freshApp } = await import('@voucha/api/app')
freshApp.route(resetPath).get(() => {
  throw new Error('thrown after module reset')
})

describe('API test server 5xx capture after the server helper is re-evaluated', () => {
  it('shares one buffer with a server helper re-evaluated by vi.resetModules()', async () => {
    await fresh.createRequest().get(resetPath).expect(500)

    expect(takeRecordedServerErrorResponses()).toEqual([
      expect.objectContaining({
        url: expect.stringContaining(resetPath),
        body: expect.objectContaining({ message: 'thrown after module reset' }),
      }),
    ])
  })
})
