'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { useResolvedIntent } from '@/lib/navigation/intents/nav-intent-context'
import { getIntentById } from '@/lib/navigation/intents'
import { buildBreadcrumbs } from '@/lib/navigation/breadcrumbs'
import type { BreadcrumbNavItem } from '@/lib/seo/structured-data'

interface UseResolvedBreadcrumbsArgs {
  tail: BreadcrumbNavItem[]
  intentCrumbOverride?: BreadcrumbNavItem
}

/**
 * Client-side breadcrumb builder. Resolves intent from the current pathname via
 * `useResolvedIntent` (honoring SetNavIntent overrides from TopicRouteLayout) and
 * calls `buildBreadcrumbs`. Use in client components instead of `buildBreadcrumbs`.
 */
export function useResolvedBreadcrumbs({
  tail,
  intentCrumbOverride,
}: UseResolvedBreadcrumbsArgs): BreadcrumbNavItem[] {
  const pathname = usePathname()
  const { currentUser, isAuthenticated } = useAuth()
  const resolvedIntentId = useResolvedIntent(pathname)
  const intent = resolvedIntentId !== null ? getIntentById(resolvedIntentId) : null
  return buildBreadcrumbs({
    intent,
    isAuthenticated,
    userRoles: currentUser?.roles ?? [],
    tail,
    intentCrumbOverride,
  })
}
