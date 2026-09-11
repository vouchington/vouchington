import { NAV_INTENTS } from './nav-intents'
import type { NavIntent, NavIntentId } from './types'

// Respect intent-level and group-level auth/role gates (mirroring the sidebar visibility
// rules) before scanning items, so an admin-only intent or group is never consulted for
// users who lack the required role.
export function findIntentLandingHref(
  intent: NavIntent,
  isAuthenticated: boolean,
  userRoles: readonly string[],
): string | undefined {
  // Intent-level gates: requiresAuth blocks anonymous users;
  // roles blocks authenticated users lacking the required role.
  if (intent.requiresAuth && !isAuthenticated) return undefined
  if (intent.roles && intent.roles.length > 0 && !intent.roles.some(r => userRoles.includes(r)))
    return undefined
  for (const g of intent.groups) {
    if (g.requiresAuth && !isAuthenticated) continue
    if (g.roles && g.roles.length > 0 && !g.roles.some(r => userRoles.includes(r))) continue
    for (const item of g.items) {
      if (!item.comingSoon && (!item.requiresAuth || isAuthenticated)) return item.href
    }
  }
  return undefined
}

export function getIntentById(id: NavIntentId): NavIntent | undefined {
  return NAV_INTENTS.find(i => i.id === id)
}
