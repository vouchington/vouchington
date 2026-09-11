import { describe, expect, it, vi } from 'vitest'

describe('API test server helper', () => {
  it('reuses the same server across module cache resets in one fork', async () => {
    const first = await import('@voucha/api/test-helpers/server')
    const firstPort = first.apiTestServerPort

    vi.resetModules()
    const second = await import('@voucha/api/test-helpers/server')

    expect(second.apiTestServerPort).toBe(firstPort)
  })

  it('routes requests to the app registered by the most recent module evaluation', async () => {
    await import('@voucha/api/test-helpers/server')

    vi.resetModules()
    const { createRequest } = await import('@voucha/api/test-helpers/server')
    const { default: app } = await import('@voucha/api/app')

    app.route('/api/v1/__tests__/server-helper-reset-route').get(ctx => ctx.json({ ok: true }))

    const response = await createRequest().get('/api/v1/__tests__/server-helper-reset-route')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })
})
