import type { BreadcrumbNavItem } from '@/lib/seo/structured-data'
import type { NavIntentId, NavIntent } from '@/lib/navigation/intents/types'
import { findIntentLandingHref, getIntentById } from '@/lib/navigation/intents'
import { getActiveIntent } from '@/lib/navigation/intents/resolver'

const HOME_CRUMB: BreadcrumbNavItem = { nameKey: 'nav.home', path: '/' }

export interface BuildBreadcrumbsForPathArgs {
  isAuthenticated: boolean
  userRoles?: readonly string[]
  tail?: BreadcrumbNavItem[]
  /** Overrides the auto-derived intent crumb. Allowed callers are documented in docs/requirements/navigation/NAVIGATION.md § Breadcrumbs. */
  intentCrumbOverride?: BreadcrumbNavItem
}

/**
 * Derives the nav intent from `pathname` via the resolver, then builds the breadcrumb trail.
 * Use this instead of `buildBreadcrumbs` in page components so breadcrumb root and sidebar
 * intent always derive from the same source. `intentCrumbOverride` is the one sanctioned
 * divergence — for deliberate cross-intent roots such as community posts.
 */
export function buildBreadcrumbsForPath(
  pathname: string,
  { isAuthenticated, userRoles, tail = [], intentCrumbOverride }: BuildBreadcrumbsForPathArgs,
): BreadcrumbNavItem[] {
  const intentId = getActiveIntent(pathname)
  const intent = intentId !== null ? getIntentById(intentId) : null
  return buildBreadcrumbs({ intent, isAuthenticated, userRoles, tail, intentCrumbOverride })
}

export interface BuildBreadcrumbsArgs {
  /** Explicit intent id or object. Omit/null for plain-Home mode (utility pages). */
  intent?: NavIntentId | NavIntent | null
  isAuthenticated: boolean
  userRoles?: readonly string[]
  /** Tail crumbs in order, ending with the current-page leaf. */
  tail: BreadcrumbNavItem[]
  /**
   * Overrides the auto-derived intent crumb entirely (label + href).
   * Used by topic-route-layout to keep the more-specific feedTypeNav crumb
   * (e.g. { name: 'Channels', path: '/channels' }) while still applying
   * the auth-aware Home prepend logic.
   *
   * When set without an explicit `intent`, the override still counts as an
   * intent root (hasIntentRoot=true), so Home is suppressed for authenticated
   * users. This is intended for admin-only pages that gate via requireAdmin().
   */
  intentCrumbOverride?: BreadcrumbNavItem
}

/** @internal Use `buildBreadcrumbsForPath` in page components. Reserved for the navigation library and tests. */
export function buildBreadcrumbs({
  intent,
  isAuthenticated,
  userRoles = [],
  tail,
  intentCrumbOverride,
}: BuildBreadcrumbsArgs): BreadcrumbNavItem[] {
  const resolvedIntent = typeof intent === 'string' ? getIntentById(intent) : (intent ?? null)

  let intentCrumb: BreadcrumbNavItem | undefined
  if (intentCrumbOverride) {
    intentCrumb = intentCrumbOverride
  } else if (resolvedIntent) {
    const href = findIntentLandingHref(resolvedIntent, isAuthenticated, userRoles)
    if (href) {
      intentCrumb = { nameKey: resolvedIntent.label, path: href }
    }
  }

  const hasIntentRoot = intentCrumb !== undefined

  const items: BreadcrumbNavItem[] = []
  // Home: always for anon; only for authed when there is no intent root (utility pages)
  if (!isAuthenticated || !hasIntentRoot) items.push(HOME_CRUMB)
  if (intentCrumb) items.push(intentCrumb)
  items.push(...tail)

  return collapseBreadcrumbs(items)
}

function collapseBreadcrumbs(items: BreadcrumbNavItem[]): BreadcrumbNavItem[] {
  // Deduplicate adjacent items with the same path, keeping the LAST (leaf stays as aria-current)
  const deduped: BreadcrumbNavItem[] = []
  for (const item of items) {
    const prev = deduped.at(-1)
    if (prev && prev.path === item.path) {
      deduped[deduped.length - 1] = item
    } else {
      deduped.push(item)
    }
  }
  // A single crumb provides no navigation value — suppress entirely
  return deduped.length <= 1 ? [] : deduped
}
