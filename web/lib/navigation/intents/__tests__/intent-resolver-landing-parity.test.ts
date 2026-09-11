// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { NAV_INTENTS } from '../nav-intents'
import { findIntentLandingHref } from '../intent-landing'
import { getActiveIntent } from '../resolver'

const ADMIN_ROLES = ['administrator']

describe('intent landing href round-trip: getActiveIntent(landingHref) === intent.id', () => {
  for (const intent of NAV_INTENTS) {
    it(`intent "${intent.id}"`, () => {
      // Test with admin so role-gated intents also get a landing href
      const href = findIntentLandingHref(intent, true, ADMIN_ROLES)
      if (href === undefined) {
        // Acceptable: intent has no items accessible even for admin (e.g. all comingSoon)
        return
      }
      expect(getActiveIntent(href)).toBe(intent.id)
    })
  }
})
