import { describe, expect, it, vi } from 'vitest'

// Re-evaluating the whole API app is cold work that can exceed the 5 s test budget on a loaded
// shard, so both evaluations run in the file body, which has no test or hook budget. The reset
// repoints the shared server, which is why this file owns that one reset.
const resetRoutePath = '/api/v1/__tests__/server-helper-reset-route'

const first = await import('@voucha/test-helpers/api/server')
const firstPort = first.apiTestServerPort

vi.resetModules()
const second = await import('@voucha/test-helpers/api/server')
const { default: app } = await import('@voucha/api/app')
app.route(resetRoutePath).get(ctx => ctx.json({ ok: true }))

describe('API test server helper', () => {
  it('reuses the same server across module cache resets in one fork', () => {
    expect(second.apiTestServerPort).toBe(firstPort)
  })

  it('routes requests to the app registered by the most recent module evaluation', async () => {
    const response = await second.createRequest().get(resetRoutePath)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })
})
