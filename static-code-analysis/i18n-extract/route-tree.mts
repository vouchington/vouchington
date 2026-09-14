import { dirname, join, relative } from 'node:path'
import { listCandidateFiles } from './file-list.mts'

/** Next.js special files that contribute UI to every route nested under the directory they live
 * in (not just the directory's own `page.tsx`). `template.tsx` and `default.tsx` have zero
 * instances in this repo today (verified via `find web/app -name template.tsx`), but are included
 * for correctness if one is ever added. */
const ANCESTOR_BASENAMES = new Set([
  'layout.tsx',
  'layout.ts',
  'template.tsx',
  'template.ts',
  'error.tsx',
  'error.ts',
  'default.tsx',
  'default.ts',
  'not-found.tsx',
  'not-found.ts',
])

export interface RouteEntry {
  /** URL pattern with route groups stripped and dynamic segments kept as `[param]`, e.g.
   * `/communities/[slug]/settings`. The root route is `/`. */
  pattern: string
  /** Repo-relative file paths that render on this route: the route's own page plus every
   * ancestor `layout`/`template`/`error`/`default`/`not-found` file from the `web/app` root down
   * to the route's own directory (inclusive of that directory). Deduplicated, deterministically
   * ordered (root-first). */
  files: string[]
}

/** Strips a Next.js route-group segment (`(name)`); route groups organize files without adding a
 * URL segment. Parallel-route slots (`@slot`) have zero instances under `web/app` today (verified
 * via `find web/app -type d -name '@*'`) and are intentionally unhandled — Next.js parallel slots
 * don't produce their own route pattern the way a `page.tsx` does, so there is nothing for this
 * tree walk to attribute a URL to. */
function isRouteGroupSegment(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')')
}

function segmentsToPattern(segments: string[]): string {
  const urlSegments = segments.filter(segment => !isRouteGroupSegment(segment))
  return urlSegments.length === 0 ? '/' : `/${urlSegments.join('/')}`
}

/** Walks tracked files under `appRoot` and returns one entry per Next.js page. */
export async function discoverRoutes(repoRoot: string, appRoot: string): Promise<RouteEntry[]> {
  const tracked = await listCandidateFiles(repoRoot, [appRoot], ['.ts', '.tsx'])
  const pages = tracked.filter(path => /\/page\.tsx?$/.test(path))

  // Index ancestor special files by their containing directory (repo-relative), so each route's
  // walk up to `appRoot` is a map lookup instead of a re-scan of `tracked`.
  const ancestorsByDir = new Map<string, string[]>()
  for (const path of tracked) {
    const base = path.split('/').pop() ?? ''
    if (!ANCESTOR_BASENAMES.has(base)) continue
    const dir = dirname(path)
    const existing = ancestorsByDir.get(dir)
    if (existing) existing.push(path)
    else ancestorsByDir.set(dir, [path])
  }

  const routes: RouteEntry[] = []
  for (const page of pages) {
    const routeDir = dirname(page)
    const relFromApp = relative(appRoot, routeDir)
    const segments = relFromApp === '.' ? [] : relFromApp.split('/')

    // Walk from `appRoot` down to `routeDir` inclusive, collecting ancestor special files at
    // every level (including intermediate route-group directories, which are real directories on
    // disk even though they don't contribute a URL segment).
    const files: string[] = []
    let currentDir = appRoot
    for (const ancestorFiles of [
      ancestorsByDir.get(currentDir) ?? [],
      ...segments.map(segment => {
        currentDir = join(currentDir, segment)
        return ancestorsByDir.get(currentDir) ?? []
      }),
    ]) {
      files.push(...ancestorFiles)
    }
    files.push(page)

    routes.push({ pattern: segmentsToPattern(segments), files: [...new Set(files)] })
  }

  return routes.toSorted((left, right) => (left.pattern < right.pattern ? -1 : 1))
}
