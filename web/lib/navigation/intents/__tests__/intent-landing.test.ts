// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { findIntentLandingHref } from '../intent-landing'
import { ADMIN_INTENTS } from '../admin'
import { PRODUCT_COMMUNICATION_INTENTS } from '../product-communication'
import type { NavIntent } from '../types'
import type { MessageKey } from '@ts-shared/ui-messages'

function makeIntent(overrides?: Partial<NavIntent>): NavIntent {
  return {
    id: 'web-search',
    label: 'Web Search' as MessageKey,
    icon: (() => null) as NavIntent['icon'],
    groups: [
      {
        label: 'Browse' as MessageKey,
        dataPw: 'g',
        items: [{ label: 'Search' as MessageKey, href: '/web-search', dataPw: 'a' }],
      },
    ],
    ...overrides,
  }
}

describe('findIntentLandingHref', () => {
  it('returns first accessible public item href', () => {
    expect(findIntentLandingHref(makeIntent(), false, [])).toBe('/web-search')
  })

  it('returns undefined when intent requires auth and user is anonymous', () => {
    const intent = makeIntent({ requiresAuth: true })
    expect(findIntentLandingHref(intent, false, [])).toBeUndefined()
  })

  it('returns undefined when intent requires role user does not have', () => {
    const intent = makeIntent({ roles: ['administrator'] as const })
    expect(findIntentLandingHref(intent, true, [])).toBeUndefined()
  })

  it('skips auth-required group when user is anonymous', () => {
    const intent = makeIntent({
      groups: [
        {
          label: 'Auth Group' as MessageKey,
          dataPw: 'auth-g',
          requiresAuth: true,
          items: [{ label: 'Private' as MessageKey, href: '/private', dataPw: 'a' }],
        },
        {
          label: 'Public Group' as MessageKey,
          dataPw: 'pub-g',
          items: [{ label: 'Public' as MessageKey, href: '/public', dataPw: 'b' }],
        },
      ],
    })
    expect(findIntentLandingHref(intent, false, [])).toBe('/public')
  })

  it('skips role-gated group and falls through to next group', () => {
    const intent = makeIntent({
      requiresAuth: true,
      groups: [
        {
          label: 'Admin Group' as MessageKey,
          dataPw: 'admin-g',
          roles: ['administrator'] as const,
          items: [{ label: 'Reports' as MessageKey, href: '/reports', dataPw: 'a' }],
        },
        {
          label: 'User Group' as MessageKey,
          dataPw: 'user-g',
          requiresAuth: true,
          items: [
            {
              label: 'My Cases' as MessageKey,
              href: '/my/appeals',
              dataPw: 'b',
              requiresAuth: true,
            },
          ],
        },
      ],
    })
    // Non-admin authed user: skips admin group, lands on /my/appeals
    expect(findIntentLandingHref(intent, true, [])).toBe('/my/appeals')
    // Admin: picks first from admin group
    expect(findIntentLandingHref(intent, true, ['administrator'])).toBe('/reports')
    // Anonymous: intent requires auth → blocked
    expect(findIntentLandingHref(intent, false, [])).toBeUndefined()
  })

  it('returns undefined when all items are auth-only or comingSoon and user is anonymous', () => {
    const intent = makeIntent({
      groups: [
        {
          label: 'All Blocked' as MessageKey,
          dataPw: 'g',
          items: [
            { label: 'A' as MessageKey, href: '/a', dataPw: 'a', requiresAuth: true },
            { label: 'B' as MessageKey, href: '/b', dataPw: 'b', comingSoon: true },
          ],
        },
      ],
    })
    expect(findIntentLandingHref(intent, false, [])).toBeUndefined()
  })
})

describe('WS2 moderation intent landing (real intent def)', () => {
  const moderationIntent = ADMIN_INTENTS.find(i => i.id === 'moderation')!

  it('admin lands on /reports (first item of Moderation group)', () => {
    expect(findIntentLandingHref(moderationIntent, true, ['administrator'])).toBe('/reports')
  })

  it('authed non-admin lands on /my/appeals (first item of My Cases group)', () => {
    expect(findIntentLandingHref(moderationIntent, true, [])).toBe('/my/appeals')
  })

  it('anonymous gets undefined (intent requiresAuth: true)', () => {
    expect(findIntentLandingHref(moderationIntent, false, [])).toBeUndefined()
  })
})

describe('WS3 messages intent landing (real intent def)', () => {
  const messagesIntent = PRODUCT_COMMUNICATION_INTENTS.find(i => i.id === 'messages')!

  it('authed user lands on /my/notifications (first item of Notifications group)', () => {
    expect(findIntentLandingHref(messagesIntent, true, [])).toBe('/my/notifications')
  })

  it('anonymous gets undefined (intent requiresAuth: true)', () => {
    expect(findIntentLandingHref(messagesIntent, false, [])).toBeUndefined()
  })
})
