import { SITEMAP_FAMILY_TYPES, SITEMAP_POST_TYPES } from '@voucha/config/sitemap-types'

const ENCODED_SITEMAP_PATH_TRAVERSAL_RE = /%(?:2e|2f|5c)/i
const SITEMAP_POST_TYPE_SET: ReadonlySet<string> = new Set(SITEMAP_POST_TYPES)
const SITEMAP_FAMILY_SET: ReadonlySet<string> = new Set(SITEMAP_FAMILY_TYPES)
const SITEMAP_TYPE_SEGMENT = '([A-Za-z0-9_-]+)'
const TYPE_INDEX_SITEMAP_PATH_RE = new RegExp(`^/sitemaps/${SITEMAP_TYPE_SEGMENT}\\.xml$`)
const FAMILY_PAGE_SITEMAP_PATH_RE = new RegExp(
  `^/sitemaps/${SITEMAP_TYPE_SEGMENT}/([1-9]\\d*)\\.xml$`,
)
const DAY_INDEX_SITEMAP_PATH_RE = new RegExp(
  `^/sitemaps/${SITEMAP_TYPE_SEGMENT}/(\\d{4})-(\\d{2})-(\\d{2})/index\\.xml$`,
)
const DAY_PAGE_SITEMAP_PATH_RE = new RegExp(
  `^/sitemaps/${SITEMAP_TYPE_SEGMENT}/(\\d{4})-(\\d{2})-(\\d{2})/([1-9]\\d*)\\.xml$`,
)

export const isSitemapRoute = (pathname: string): boolean =>
  pathname === '/sitemap.xml' ||
  pathname.startsWith('/sitemaps/') ||
  pathname.startsWith('/sitemap/')

export const getCanonicalSitemapUrl = (url: URL): URL | null => {
  if (!isSitemapRoute(url.pathname) || !url.search) return null

  const canonicalUrl = new URL(url)
  canonicalUrl.search = ''
  return canonicalUrl
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const isValidSitemapDate = (year: string, month: string, day: string): boolean => {
  const numericYear = Number(year)
  const numericMonth = Number(month)
  const numericDay = Number(day)
  if (numericMonth < 1 || numericMonth > 12) return false
  const maxDay =
    numericMonth === 2 && isLeapYear(numericYear) ? 29 : DAYS_IN_MONTH[numericMonth - 1]
  return maxDay !== undefined && numericDay >= 1 && numericDay <= maxDay
}

export const getSitemapOriginPath = (pathname: string): string | null => {
  if (ENCODED_SITEMAP_PATH_TRAVERSAL_RE.test(pathname)) return null

  if (pathname === '/sitemap.xml') return '/sitemaps/root.xml'

  if (
    pathname === '/sitemaps/posts.xml' ||
    pathname === '/sitemaps/root.xml' ||
    pathname === '/sitemaps/static.xml'
  ) {
    return pathname
  }

  const typeIndexMatch = pathname.match(TYPE_INDEX_SITEMAP_PATH_RE)
  if (typeIndexMatch) {
    const [, segment] = typeIndexMatch
    if (!segment) return null
    if (SITEMAP_POST_TYPE_SET.has(segment)) return `/sitemaps/types/${segment}.xml`
    if (SITEMAP_FAMILY_SET.has(segment)) return `/sitemaps/families/${segment}.xml`
    return null
  }

  const familyPageMatch = pathname.match(FAMILY_PAGE_SITEMAP_PATH_RE)
  if (familyPageMatch) {
    const [, family, page] = familyPageMatch
    if (!family || !page) return null
    if (SITEMAP_FAMILY_SET.has(family)) return `/families/${family}/${page}.xml`
    return null
  }

  const dayIndexMatch = pathname.match(DAY_INDEX_SITEMAP_PATH_RE)
  if (dayIndexMatch) {
    const [, postType, year, month, day] = dayIndexMatch
    if (!postType || !year || !month || !day) return null
    if (!SITEMAP_POST_TYPE_SET.has(postType)) return null
    if (!isValidSitemapDate(year, month, day)) return null
    return `/posts/${year}/${month}/${day}/${postType}/index.xml`
  }

  const dayPageMatch = pathname.match(DAY_PAGE_SITEMAP_PATH_RE)
  if (dayPageMatch) {
    const [, postType, year, month, day, page] = dayPageMatch
    if (!postType || !year || !month || !day || !page) return null
    if (!SITEMAP_POST_TYPE_SET.has(postType)) return null
    if (!isValidSitemapDate(year, month, day)) return null
    return `/posts/${year}/${month}/${day}/${postType}/${page}.xml`
  }

  return null
}
