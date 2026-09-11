import { describe, expect, it } from 'vitest'
import { resolveNotificationTarget } from '../utils'

describe('resolveNotificationTarget', () => {
  it('prefers a hydrated community target over intent and legacy path', () => {
    expect(
      resolveNotificationTarget(
        {
          target_entity: { __entity_type: 'community', id: 'community-1' },
          target_intent: 'notifications_inbox',
          target_path: '/legacy',
        },
        { 'community-1': { id: 'community-1', slug: 'makers' } as never },
      ),
    ).toBe('/communities/makers')
  })

  it('falls back from a missing entity to inbox intent, then a safe legacy path', () => {
    expect(
      resolveNotificationTarget({
        target_entity: { __entity_type: 'community', id: 'missing' },
        target_intent: 'notifications_inbox',
        target_path: '/legacy',
      }),
    ).toBe('/my/notifications')
    expect(
      resolveNotificationTarget({
        target_entity: null,
        target_intent: null,
        target_path: '/legacy?from=notification',
      }),
    ).toBe('/legacy?from=notification')
  })

  it('rejects an unsafe legacy target', () => {
    expect(
      resolveNotificationTarget({
        target_entity: null,
        target_intent: null,
        target_path: 'https://example.invalid/steal',
      }),
    ).toBeNull()
  })

  it('routes reporter review inbox intent without a content path', () => {
    expect(
      resolveNotificationTarget({
        target_entity: null,
        target_intent: 'notifications_inbox',
        target_path: null,
      }),
    ).toBe('/my/notifications')
  })

  it('falls back to the inbox when a structured community is inaccessible', () => {
    expect(
      resolveNotificationTarget({
        target_entity: { __entity_type: 'community', id: 'private-community' },
        target_intent: null,
        target_path: null,
      }),
    ).toBe('/my/notifications')
  })
})
