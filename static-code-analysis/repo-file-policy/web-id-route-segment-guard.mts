import { webIdRouteSegmentAllowlist } from './web-id-route-segment-allowlist.mts'

const ID_SEGMENT_RE = /^\[(?:\.\.\.)?(?:id|[A-Za-z]+Id|[a-z]+(?:_[a-z]+)*_id)\]$/
const ROUTE_GROUP_RE = /^\(.+\)$/
export const webIdRouteSegmentAllowlistFile =
  'static-code-analysis/repo-file-policy/web-id-route-segment-allowlist.mts'
const ALLOWLIST_FILE = webIdRouteSegmentAllowlistFile

/** Route patterns (route groups removed) of every id-looking dynamic segment in `trackedFiles`. */
export function collectIdRouteSegments(trackedFiles: readonly string[]): Set<string> {
  const routes = new Set<string>()
  for (const file of trackedFiles) {
    if (!file.startsWith('web/app/')) continue
    const directories = file.split('/').slice(2, -1)
    const route: string[] = []
    for (const segment of directories) {
      if (ROUTE_GROUP_RE.test(segment)) continue
      route.push(segment)
      if (ID_SEGMENT_RE.test(segment)) routes.add(`/${route.join('/')}`)
    }
  }
  return routes
}

/** New id route segments must be allowlisted with a "no natural key" reason; stale entries fail. */
export function checkWebIdRouteSegments(
  trackedFiles: readonly string[],
  errors: string[],
  allowlist: ReadonlyMap<string, string> = webIdRouteSegmentAllowlist,
): void {
  if (!trackedFiles.some(file => file.startsWith('web/app/'))) return
  const found = collectIdRouteSegments(trackedFiles)
  for (const route of [...found].toSorted()) {
    if (allowlist.has(route)) continue
    errors.push(
      `::error file=${ALLOWLIST_FILE}::web/app route ${route} routes by an id; use a slug or ` +
        'unique natural key (username, hostname, URL, owner plus slug), or add the route to the ' +
        'allowlist with a one-line "no natural key" reason ' +
        '(docs/development/web-agent-rules.md#identifiers)',
    )
  }
  for (const route of [...allowlist.keys()].toSorted()) {
    if (found.has(route)) continue
    errors.push(
      `::error file=${ALLOWLIST_FILE}::stale web id route allowlist entry ${route}; the route no ` +
        'longer exists, remove the entry',
    )
  }
}
