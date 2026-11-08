import { describe, expect, it } from 'vitest'
import getMyNotificationsTool from '../get-my-notifications.mts'
import getMyPreferencesTool from '../get-my-preferences.mts'
import getMyUnreadNotificationsTool from '../get-my-unread-notifications.mts'
import updateMyPreferencesTool from '../update-my-preferences.mts'
type Shape = { properties?: Record<string, unknown>; oneOf?: Shape[] }

// A tool that can answer "not found" or "invalid cursor" lists its success body first.
const properties = (schema: unknown): Record<string, unknown> => {
  const shape = schema as Shape
  return (shape.oneOf?.[0] ?? shape).properties!
}

describe('own data tool output schemas', () => {
  it('returns a page of notifications with the same fields as the unread summary', () => {
    const page = properties(getMyNotificationsTool.meta?.outputSchema)
    const unread = properties(getMyUnreadNotificationsTool.meta?.outputSchema)

    for (const key of ['results', 'notifications', 'communities']) {
      expect(page[key]).toEqual(unread[key])
    }
  })

  it('keeps the read and updated preference schemas equal', () => {
    expect(getMyPreferencesTool.meta?.outputSchema).toEqual(
      updateMyPreferencesTool.meta?.outputSchema,
    )
  })
})
