import { documentedResponseProperty } from '@voucha/test-helpers/openapi-documented-response'
import { describe, expect, it } from 'vitest'
import addMyProfileLinkTool from '../add-my-profile-link.mts'
import deleteMyProfileLinkTool from '../delete-my-profile-link.mts'
import deleteNotificationTool from '../delete-notification.mts'
import markAllNotificationsReadTool from '../mark-all-notifications-read.mts'
import markNotificationReadTool from '../mark-notification-read.mts'
import { SETTING_FIELDS } from '../preference-tool-support.mts'
import reorderMyProfileLinksTool from '../reorder-my-profile-links.mts'
import updateMyBioTool from '../update-my-bio.mts'
import updateMyDisplayIdentityTool from '../update-my-display-identity.mts'
import updateMyEmailPreferencesTool from '../update-my-email-preferences.mts'
import updateMyPreferencesTool from '../update-my-preferences.mts'
import updateMyProfileLinkTool from '../update-my-profile-link.mts'

type JsonSchema = Record<string, unknown>

const properties = (schema: unknown): Record<string, unknown> =>
  (schema as JsonSchema)['properties'] as Record<string, unknown>

// The profile, link and email-preference routes document their bodies from named components, so
// the tools reuse those schemas. Where a tool narrows a body (the bio is never null, the identity
// and settings are a subset of the user), each field it keeps must keep the documented schema.
describe('profile, notification and preference tool output schemas stay pinned to the documented REST twins', () => {
  it.each([
    [addMyProfileLinkTool, 'post', '/api/v1/my/profile/links', '201', 'profile_link'],
    [updateMyProfileLinkTool, 'patch', '/api/v1/my/profile/links/{id}', '200', 'profile_link'],
    [reorderMyProfileLinksTool, 'put', '/api/v1/my/profile/links/order', '200', 'results'],
    [
      updateMyEmailPreferencesTool,
      'patch',
      '/api/v1/my/email-preferences',
      '200',
      'email_preferences',
    ],
  ] as const)(
    'takes %# result entity from the documented REST body',
    (tool, method, path, status, key) => {
      expect(properties(tool.meta?.outputSchema)[key]).toEqual(
        documentedResponseProperty(method, path, status, key),
      )
    },
  )

  it('returns the bio profile the PATCH route documents, without its null branch', () => {
    const documented = documentedResponseProperty('patch', '/api/v1/my/profile', '200', 'profile')

    expect((documented as { anyOf: unknown[] }).anyOf).toContainEqual({ type: 'null' })
    expect((documented as { anyOf: unknown[] }).anyOf).toContainEqual(
      properties(updateMyBioTool.meta?.outputSchema)['profile'],
    )
  })

  it('takes the identity fields from the private user the identity route returns', () => {
    const identity = properties(
      properties(updateMyDisplayIdentityTool.meta?.outputSchema)['identity'],
    )
    const documented = properties(
      documentedResponseProperty('patch', '/api/v1/my/identity', '200', 'identity'),
    )

    expect(Object.keys(identity).toSorted()).toEqual(['profile_image_id', 'use_display_name_from'])
    for (const [field, schema] of Object.entries(identity)) {
      expect(schema).toEqual(documented[field])
    }
  })

  it('takes every setting from the private user the users route returns', () => {
    const settings = properties(properties(updateMyPreferencesTool.meta?.outputSchema)['settings'])
    const documented = properties(
      documentedResponseProperty('patch', '/api/v1/users/{idOrSlug}', '200', 'user'),
    )

    expect(Object.keys(settings).toSorted()).toEqual([...SETTING_FIELDS].toSorted())
    for (const [field, schema] of Object.entries(settings)) {
      expect(schema).toEqual(documented[field])
    }
  })

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
