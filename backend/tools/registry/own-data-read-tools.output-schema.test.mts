import { documentedResponseProperty } from '@voucha/test-helpers/openapi-documented-response'
import { describe, expect, it } from 'vitest'
import getMyBioTool from '../get-my-bio.mts'
import getMyEmailPreferencesTool from '../get-my-email-preferences.mts'
import getMyNotificationsTool from '../get-my-notifications.mts'
import getMyPreferencesTool from '../get-my-preferences.mts'
import getMyProfileLinksTool from '../get-my-profile-links.mts'
import getMyUnreadNotificationsTool from '../get-my-unread-notifications.mts'
import updateMyPreferencesTool from '../update-my-preferences.mts'

type Shape = { properties?: Record<string, unknown>; oneOf?: Shape[] }

// A tool that can answer "not found" or "invalid cursor" lists its success body first.
const properties = (schema: unknown): Record<string, unknown> => {
  const shape = schema as Shape
  return (shape.oneOf?.[0] ?? shape).properties!
}

// Each tool returns the body of its REST twin, so every property it keeps must keep the documented
// schema. The notification list and unread routes document the same three records inline.
describe('own-data read tool output schemas stay pinned to the documented REST twins', () => {
  it.each([
    [getMyNotificationsTool, 'get', '/api/v1/my/notifications', 'results'],
    [getMyNotificationsTool, 'get', '/api/v1/my/notifications', 'notifications'],
    [getMyNotificationsTool, 'get', '/api/v1/my/notifications', 'communities'],
    [getMyUnreadNotificationsTool, 'get', '/api/v1/my/notifications/unread', 'unread_count'],
    [getMyUnreadNotificationsTool, 'get', '/api/v1/my/notifications/unread', 'results'],
    [getMyUnreadNotificationsTool, 'get', '/api/v1/my/notifications/unread', 'notifications'],
    [getMyUnreadNotificationsTool, 'get', '/api/v1/my/notifications/unread', 'communities'],
    [getMyBioTool, 'get', '/api/v1/my/profile', 'profile'],
    [getMyProfileLinksTool, 'get', '/api/v1/my/profile/links', 'results'],
    [getMyEmailPreferencesTool, 'get', '/api/v1/my/email-preferences', 'email_preferences'],
  ] as const)('takes %# property %s from the documented 200 body', (tool, method, path, key) => {
    expect(properties(tool.meta?.outputSchema)[key]).toEqual(
      documentedResponseProperty(method, path, '200', key),
    )
  })

  it('pages notifications with the page_info the list route documents', () => {
    const sorted = (schema: unknown) => {
      const shape = schema as { required: string[] }
      return { ...shape, required: shape.required.toSorted() }
    }

    expect(sorted(properties(getMyNotificationsTool.meta?.outputSchema)['page_info'])).toEqual(
      sorted(documentedResponseProperty('get', '/api/v1/my/notifications', '200', 'page_info')),
    )
  })

  it('returns a page of notifications with the same fields as the unread summary', () => {
    const page = properties(getMyNotificationsTool.meta?.outputSchema)
    const unread = properties(getMyUnreadNotificationsTool.meta?.outputSchema)

    for (const key of ['results', 'notifications', 'communities']) {
      expect(page[key]).toEqual(unread[key])
    }
  })

  it('returns the settings update_my_preferences returns, from the private user schema', () => {
    const settings = properties(properties(getMyPreferencesTool.meta?.outputSchema)['settings'])
    const documented = properties(
      documentedResponseProperty('patch', '/api/v1/users/{idOrSlug}', '200', 'user'),
    )

    expect(getMyPreferencesTool.meta?.outputSchema).toEqual(
      updateMyPreferencesTool.meta?.outputSchema,
    )
    for (const [field, schema] of Object.entries(settings)) {
      expect(schema).toEqual(documented[field])
    }
  })
})
