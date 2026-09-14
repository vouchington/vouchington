import { DEFAULT_LOCALIZATION_BOUNDS } from '@vouchington/localization'
import { LANDING_PAGE_HANDLE_RE } from '@/lib/utils/path'
import { ROUTE_SELECTORS, WEB_CHROME_SELECTOR } from './route-selectors.generated.mts'

type RouteSelectorEntry = (typeof ROUTE_SELECTORS)[number]

function isDynamicSegment(segment: string): boolean {
  return segment.startsWith('[') && segment.endsWith(']')
}

/** `web/proxy.ts` rewrites a public `/@handle(/slug)` request to
 * `/landing/<username>(/<slug>)` internally, but sets the `x-pathname` header (and
 * `window.location.pathname` sees the same thing, since the browser never learns about the
 * rewrite either) to the ORIGINAL pre-rewrite `/@handle` shape. Translate that shape into the
 * `['landing', '[idOrUsername]', ...]` segments route-selectors.generated.mts actually keys on,
 * so landing pages resolve their selectors instead of silently falling back to chrome-only. */
function segmentsForPathname(pathname: string): string[] {
  const handleMatch = LANDING_PAGE_HANDLE_RE.test(pathname)
  const segments = pathname.split('/').filter(Boolean)
  if (!handleMatch) return segments
  const [handle, ...rest] = segments
  return ['landing', (handle ?? '').slice(1), ...rest]
}

/** Finds the most specific `ROUTE_SELECTORS` entry matching `pathname`'s segments: same segment
 * count, with every pattern segment either a literal match or a `[dynamic]` wildcard. Ties
 * (impossible today, since Next.js rejects a literal and dynamic sibling at the same segment)
 * break toward the entry with more literal-segment matches. Returns `undefined` when no route
 * pattern matches (e.g. a 404 or an unrecognized path), in which case the caller falls back to
 * chrome-only selectors instead of guessing. */
function matchRouteSelector(pathname: string): RouteSelectorEntry | undefined {
  const segments = segmentsForPathname(pathname)
  let best: RouteSelectorEntry | undefined
  let bestLiteralMatches = -1

  for (const entry of ROUTE_SELECTORS) {
    const patternSegments = entry.pattern.split('/').filter(Boolean)
    if (patternSegments.length !== segments.length) continue

    let literalMatches = 0
    let matched = true
    for (const [index, patternSegment] of patternSegments.entries()) {
      if (patternSegment === segments[index]) {
        literalMatches += 1
      } else if (!isDynamicSegment(patternSegment)) {
        matched = false
        break
      }
    }

    if (matched && literalMatches > bestLiteralMatches) {
      best = entry
      bestLiteralMatches = literalMatches
    }
  }

  return best
}

/** Returns the shell and exact route selector set in one bounded request. */
export function webSelectorsForPath(pathname: string): string[] {
  const matchedRoute = matchRouteSelector(pathname)
  const route = matchedRoute?.hasMembership ? matchedRoute.selectorId : undefined
  const unique = route ? [WEB_CHROME_SELECTOR, route] : [WEB_CHROME_SELECTOR]
  unique.sort()
  if (unique.length > DEFAULT_LOCALIZATION_BOUNDS.maxSelectors) {
    throw new RangeError(
      `webSelectorsForPath(${pathname}) has ${unique.length} selectors; max is ${DEFAULT_LOCALIZATION_BOUNDS.maxSelectors}`,
    )
  }
  return unique
}
