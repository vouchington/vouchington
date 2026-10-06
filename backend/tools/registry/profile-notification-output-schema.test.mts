import { describe, expect, it } from 'vitest'
import deleteMyProfileLinkTool from '../delete-my-profile-link.mts'
import deleteNotificationTool from '../delete-notification.mts'
import markAllNotificationsReadTool from '../mark-all-notifications-read.mts'
import markNotificationReadTool from '../mark-notification-read.mts'
type JsonSchema = Record<string, unknown>

const properties = (schema: unknown): Record<string, unknown> =>
  (schema as JsonSchema)['properties'] as Record<string, unknown>

describe('profile and notification mutation output schemas', () => {
  it.each([
    [deleteMyProfileLinkTool, []],
    [markNotificationReadTool, []],
    [deleteNotificationTool, []],
    [markAllNotificationsReadTool, ['marked_read']],
  ])('%# reports only success and what changed', (tool, extra) => {
    expect(Object.keys(properties(tool.meta?.outputSchema)).toSorted()).toEqual(
      ['success', ...extra].toSorted(),
    )
  })
})
