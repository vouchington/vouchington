// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildBreadcrumbs } from '../breadcrumbs'
import type { NavIntent } from '../intents/types'
import type { MessageKey } from '@ts-shared/ui-messages'
import {
  HOME,
  LEAF,
  makeAuthOnlyIntent,
  makeIntent,
} from '../test-helpers/breadcrumbs-test-helpers'

describe('buildBreadcrumbs', () => {
  describe('plain-Home mode (no intent)', () => {
    it('anon with no intent: returns [Home, leaf]', () => {
      expect(buildBreadcrumbs({ isAuthenticated: false, tail: [LEAF] })).toEqual([HOME, LEAF])
    })

    it('authed with no intent: returns [Home, leaf]', () => {
      expect(buildBreadcrumbs({ isAuthenticated: true, tail: [LEAF] })).toEqual([HOME, LEAF])
    })

    it('explicit null intent: same as no intent for authed', () => {
      expect(buildBreadcrumbs({ intent: null, isAuthenticated: true, tail: [LEAF] })).toEqual([
        HOME,
        LEAF,
      ])
    })
  })

  describe('intent-rooted, anonymous', () => {
    it('anon gets [Home, intentCrumb, leaf]', () => {
      const result = buildBreadcrumbs({
        intent: makeIntent(),
        isAuthenticated: false,
        tail: [LEAF],
      })
      expect(result).toEqual([
        HOME,
        { nameKey: 'Web Search' as MessageKey, path: '/web-search' },
        LEAF,
      ])
    })

    it('anon: auth-required items are skipped; first public item is used', () => {
      const intent = makeIntent({
        groups: [
          {
            label: 'Browse' as MessageKey,
            dataPw: 'sidebar-group-browse',
            items: [
              {
                label: 'URLs' as MessageKey,
                href: '/urls',
                dataPw: 'sidebar-nav-urls',
                requiresAuth: true,
              },
              { label: 'Search' as MessageKey, href: '/web-search', dataPw: 'sidebar-nav-search' },
            ],
          },
        ],
      })
      const result = buildBreadcrumbs({ intent, isAuthenticated: false, tail: [LEAF] })
      expect(result).toEqual([
        HOME,
        { nameKey: 'Web Search' as MessageKey, path: '/web-search' },
        LEAF,
      ])
    })

    it('anon: comingSoon items are skipped; first non-comingSoon item is used', () => {
      const intent = makeIntent({
        groups: [
          {
            label: 'Browse' as MessageKey,
            dataPw: 'g',
            items: [
              { label: 'Soon' as MessageKey, href: '/soon', dataPw: 'a', comingSoon: true },
              { label: 'Search' as MessageKey, href: '/web-search', dataPw: 'b' },
            ],
          },
        ],
      })
      const result = buildBreadcrumbs({ intent, isAuthenticated: false, tail: [LEAF] })
      expect(result).toEqual([
        HOME,
        { nameKey: 'Web Search' as MessageKey, path: '/web-search' },
        LEAF,
      ])
    })
  })

  describe('intent-rooted, authenticated', () => {
    it('authed gets [intentCrumb, leaf] — no Home', () => {
      const result = buildBreadcrumbs({ intent: makeIntent(), isAuthenticated: true, tail: [LEAF] })
      expect(result).toEqual([{ nameKey: 'Web Search' as MessageKey, path: '/web-search' }, LEAF])
    })

    it('authed: first auth-required item is used', () => {
      const intent = makeIntent({
        groups: [
          {
            label: 'Browse' as MessageKey,
            dataPw: 'sidebar-group-browse',
            items: [
              {
                label: 'URLs' as MessageKey,
                href: '/urls',
                dataPw: 'sidebar-nav-urls',
                requiresAuth: true,
              },
              { label: 'Search' as MessageKey, href: '/web-search', dataPw: 'sidebar-nav-search' },
            ],
          },
        ],
      })
      const result = buildBreadcrumbs({ intent, isAuthenticated: true, tail: [LEAF] })
      expect(result).toEqual([{ nameKey: 'Web Search' as MessageKey, path: '/urls' }, LEAF])
    })
  })

  describe('collapse: authed on the intent landing page', () => {
    it('authed on /web-search: intent === leaf path → returns []', () => {
      const result = buildBreadcrumbs({
        intent: makeIntent(),
        isAuthenticated: true,
        tail: [{ name: 'Web Search', path: '/web-search' }],
      })
      expect(result).toEqual([])
    })

    it('anon on /web-search: [Home, Web Search] → 2 crumbs → kept', () => {
      const result = buildBreadcrumbs({
        intent: makeIntent(),
        isAuthenticated: false,
        tail: [{ name: 'Web Search', path: '/web-search' }],
      })
      expect(result).toEqual([HOME, { name: 'Web Search', path: '/web-search' }])
    })
  })

  it('anon with auth-only intent: no accessible href → falls back to [Home, leaf]', () => {
    expect(
      buildBreadcrumbs({ intent: makeAuthOnlyIntent(), isAuthenticated: false, tail: [LEAF] }),
    ).toEqual([HOME, LEAF])
  })

  describe('role-gated intent', () => {
    const adminIntent: NavIntent = {
      id: 'moderation',
      label: 'Moderation' as MessageKey,
      icon: (() => null) as NavIntent['icon'],
      roles: ['administrator'] as const,
      groups: [
        {
          label: 'g' as MessageKey,
          dataPw: 'g',
          items: [{ label: 'Reports' as MessageKey, href: '/reports', dataPw: 'a' }],
        },
      ],
    }
    it('non-admin authed: intent.roles gate blocks → [Home, leaf]', () => {
      expect(
        buildBreadcrumbs({
          intent: adminIntent,
          isAuthenticated: true,
          userRoles: [],
          tail: [LEAF],
        }),
      ).toEqual([HOME, LEAF])
    })
    it('admin: intent.roles gate passes → [Moderation, leaf]', () => {
      expect(
        buildBreadcrumbs({
          intent: adminIntent,
          isAuthenticated: true,
          userRoles: ['administrator'],
          tail: [LEAF],
        }),
      ).toEqual([{ nameKey: 'Moderation' as MessageKey, path: '/reports' }, LEAF])
    })
  })

  describe('intentCrumbOverride', () => {
    const override = { name: 'Channels', path: '/channels' }

    it('override replaces auto-derived crumb for anon: [Home, override, leaf]', () => {
      const result = buildBreadcrumbs({
        intent: makeIntent(),
        isAuthenticated: false,
        tail: [LEAF],
        intentCrumbOverride: override,
      })
      expect(result).toEqual([HOME, override, LEAF])
    })

    it('override replaces auto-derived crumb for authed: [override, leaf]', () => {
      const result = buildBreadcrumbs({
        intent: makeIntent(),
        isAuthenticated: true,
        tail: [LEAF],
        intentCrumbOverride: override,
      })
      expect(result).toEqual([override, LEAF])
    })

    it('override with no intent prop still applies Home logic for anon', () => {
      const result = buildBreadcrumbs({
        isAuthenticated: false,
        tail: [LEAF],
        intentCrumbOverride: { name: 'Topics', path: '/topics' },
      })
      expect(result).toEqual([HOME, { name: 'Topics', path: '/topics' }, LEAF])
    })
  })

  describe('getIntentById lookup path', () => {
    it('passing a NavIntentId string resolves via registry and produces a crumb', () => {
      const result = buildBreadcrumbs({
        intent: 'web-search',
        isAuthenticated: false,
        tail: [LEAF],
      })
      // Only assert shape — not exact href — to survive intent data shifts
      expect(result.length).toBeGreaterThanOrEqual(2)
      expect(result[0]).toEqual(HOME)
      expect(result.at(-1)).toEqual(LEAF)
    })

    it('unknown intent id returns undefined → plain-Home mode', () => {
      const result = buildBreadcrumbs({
        intent: 'does-not-exist' as unknown as 'web-search',
        isAuthenticated: true,
        tail: [LEAF],
      })
      expect(result).toEqual([HOME, LEAF])
    })
  })

  describe('edge cases', () => {
    it('empty tail with intent: authed → [] (single intentCrumb → suppressed)', () => {
      expect(buildBreadcrumbs({ intent: makeIntent(), isAuthenticated: true, tail: [] })).toEqual(
        [],
      )
    })

    it('empty tail with no intent: anon → [] (single Home crumb → suppressed)', () => {
      expect(buildBreadcrumbs({ isAuthenticated: false, tail: [] })).toEqual([])
    })

    it('multiple tail crumbs are all included', () => {
      const result = buildBreadcrumbs({
        intent: makeIntent(),
        isAuthenticated: true,
        tail: [
          { name: 'Section', path: '/section' },
          { name: 'Sub', path: '/section/sub' },
        ],
      })
      expect(result).toEqual([
        { nameKey: 'Web Search' as MessageKey, path: '/web-search' },
        { name: 'Section', path: '/section' },
        { name: 'Sub', path: '/section/sub' },
      ])
    })

    it('adjacent dedup: tail[0].path === intentCrumb.path — deduplicated, last label wins', () => {
      const result = buildBreadcrumbs({
        intent: makeIntent(),
        isAuthenticated: true,
        tail: [{ name: 'Web Search (dup)', path: '/web-search' }, LEAF],
      })
      expect(result).toEqual([{ name: 'Web Search (dup)', path: '/web-search' }, LEAF])
    })
  })
})
