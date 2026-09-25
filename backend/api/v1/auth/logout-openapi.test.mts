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
    const schema = openApi.components.schemas.LogoutRequest as { required?: string[] }
    // Both fields are optional at the schema level -- JSON Schema `required` can't express "both
    // or neither" from a plain TS type, so the route enforces that pairing with a manual assert
    // (see logout.mts) instead of a `required` array here.
    expect(schema.required).toBeUndefined()
    expect(openApi.components.schemas.LogoutRequest).toMatchObject({
      additionalProperties: false,
      properties: {
        web_push_endpoint: { type: 'string' },
        web_push_subscription_id: { type: 'string' },
      },
    })
  })
})
