import { sendRequestClientInfo as send } from '@voucha/test-helpers/request-client-info-listener'
import { describe, expect, it } from 'vitest'

describe('browser-managed device session ingress', () => {
  it.each(['/api/v1/auth/device-bound-sessions', '/api/v1/auth/device-bound-sessions/refreshes'])(
    'admits browser-managed POST %s without custom client metadata',
    async path => {
      const response = await send({
        method: 'POST',
        path,
        headers: { cookie: 'dt=route-verifies-this' },
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toBeNull()
    },
  )

  it.each([
    ['PATCH', '/api/v1/auth/device-bound-sessions'],
    ['GET', '/api/v1/auth/device-bound-sessions/refreshes'],
    ['POST', '/api/v1/auth/device-bound-sessions/refreshes/extra'],
    ['POST', '/api/v1/auth/device-bound-sessions-extra'],
  ])('keeps metadata enforcement for %s %s', async (method, path) => {
    const response = await send({ method, path, headers: {} })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_CLIENT_INFO' })
  })
})
