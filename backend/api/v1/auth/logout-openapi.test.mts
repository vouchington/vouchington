import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const openApi = JSON.parse(
  readFileSync(new URL('../../../../api-fixtures/v1/openapi.json', import.meta.url), 'utf8'),
) as {
  components: { schemas: Record<string, unknown> }
  'x-unavailable-request-routes': string[]
}

describe('logout OpenAPI contract', () => {
  it('keeps the optional body available as an all-or-nothing push binding pair', () => {
    expect(openApi['x-unavailable-request-routes']).not.toContain('POST:/api/v1/auth/logout')
    expect(openApi.components.schemas.LogoutRequest).toMatchObject({
      required: ['web_push_endpoint', 'web_push_subscription_id'],
      properties: {
        web_push_endpoint: { type: 'string' },
        web_push_subscription_id: { type: 'string' },
      },
    })
  })
})
