import {
  COMMUNITY_PUBLIC_RESERVED_SEGMENTS,
  INDEXABLE_TOPIC_SUBPAGES,
  PUBLIC_STATIC_SITE_NAV_PATHS,
} from '@ts-shared/route-classification'

import { LANDING_PAGE_HANDLE_RE } from '@/lib/utils/path'
import { getTopicTypeFromSlug } from '@/types/topics'

function normalizePathname(pathname: string): string {
  if (!pathname) return ''
  if (pathname === '/') return pathname
  return pathname.replace(/\/+$/, '')
}

export function shouldRenderSiteNavigationSchema(pathname: string): boolean {
  const normalizedPathname = normalizePathname(pathname)

  if (!normalizedPathname) return false
  if (PUBLIC_STATIC_SITE_NAV_PATHS.has(normalizedPathname)) return true
  if (/^\/compare\/[^/]+$/.test(normalizedPathname)) return true
  if (/^\/domain\/[^/]+$/.test(normalizedPathname)) return true
  if (/^\/user\/[^/]+$/.test(normalizedPathname)) return true
  if (LANDING_PAGE_HANDLE_RE.test(normalizedPathname)) return true

  if (
    /^\/(review|discussion|article|blog-post|data-point|story)\/[^/]+(?:\/comment\/[^/]+)?$/.test(
      normalizedPathname,
    )
  ) {
    return true
  }

  const pathParts = normalizedPathname.split('/').filter(Boolean)
  if (
    pathParts.length >= 2 &&
    pathParts.length <= 3 &&
    getTopicTypeFromSlug(pathParts[0]!) !== undefined
  ) {
    const subpage = pathParts[2]
    return subpage === undefined || INDEXABLE_TOPIC_SUBPAGES.has(subpage)
  }

  const communityMatch = /^\/communities\/([^/]+)$/.exec(normalizedPathname)
  if (communityMatch) {
    return !COMMUNITY_PUBLIC_RESERVED_SEGMENTS.has(communityMatch[1]!)
  }

  return false
}
