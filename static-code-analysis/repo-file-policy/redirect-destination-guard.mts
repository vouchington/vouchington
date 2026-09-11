import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { extractRedirectDestinations } from './redirect-destination-extractor.mts'

const NEXT_CONFIG = 'web/next.config.ts'
const PAGE_RE = /^web\/app\/(.*\/)?page\.(tsx|ts|jsx|js)$/

function buildRouteSet(trackedFiles: readonly string[]): Set<string> {
  const routes = new Set<string>()
  for (const file of trackedFiles) {
    const m = PAGE_RE.exec(file)
    if (!m) continue
    const inner = m[1] ?? ''
    const rawSegs = inner.split('/').filter(s => s.length > 0)
    // Skip private subtrees entirely — Next.js opts out any segment starting with '_'
    if (rawSegs.some(s => s.startsWith('_'))) continue
    const segs = rawSegs.filter(s => !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@'))
    routes.add(segs.length === 0 ? '/' : `/${segs.join('/')}`)
  }
  return routes
}

export function checkRedirectDestinations(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
): void {
  if (!trackedFiles.includes(NEXT_CONFIG)) return

  const routeSet = buildRouteSet(trackedFiles)
  const content = readFileSync(join(repoRoot, NEXT_CONFIG), 'utf8')
  const extracted = extractRedirectDestinations(content, NEXT_CONFIG)

  if (!extracted.bodyFound) {
    if (/\bredirects\b/.test(content)) {
      errors.push(
        `::error file=${NEXT_CONFIG}::${NEXT_CONFIG}: redirect-destination guard could not locate the redirects() body; redirect definition syntax in next.config.ts changed — update redirect-destination-guard`,
      )
    }
    return
  }

  if (extracted.sawOwnerPrivatePaths && !extracted.sawOwnerPrivatePathsTuple) {
    errors.push(
      `::error file=${NEXT_CONFIG}::${NEXT_CONFIG}: redirect-destination extractor matched no ownerPrivatePaths tuples; redirect construction in next.config.ts changed — update redirect-destination-guard`,
    )
    return
  }

  for (const dest of extracted.destinations) {
    const destPath = dest.split('?')[0].split('#')[0]
    if (destPath.includes('://') || destPath.startsWith('//') || /:[a-zA-Z]/.test(destPath))
      continue
    if (routeSet.has(destPath) || matchesDynamicRoute(routeSet, destPath)) continue
    errors.push(
      `::error file=${NEXT_CONFIG}::${NEXT_CONFIG}: ownerPrivatePaths redirect destination '${dest}' has no matching page (expected web/app/**/page.tsx for route ${destPath}); remove the redirect or restore the page`,
    )
  }
}

function matchesDynamicRoute(routeSet: ReadonlySet<string>, destPath: string): boolean {
  const destSegs = destPath.split('/').filter(Boolean)
  for (const route of routeSet) {
    const routeSegs = route === '/' ? [] : route.split('/').filter(Boolean)
    if (matchesRouteSegments(routeSegs, destSegs)) return true
  }
  return false
}

function matchesRouteSegments(routeSegs: string[], destSegs: string[]): boolean {
  const lastSeg = routeSegs.at(-1) ?? ''
  if (!lastSeg.includes('...')) {
    return (
      routeSegs.length === destSegs.length &&
      routeSegs.every((seg, i) => seg.startsWith('[') || seg === destSegs[i])
    )
  }

  const prefixLen = routeSegs.length - 1
  const minExtraSegs = lastSeg.startsWith('[[') ? 0 : 1
  const prefixSegs = routeSegs.slice(0, prefixLen)
  const destPrefix = destSegs.slice(0, prefixLen)
  return (
    destSegs.length >= prefixLen + minExtraSegs &&
    prefixSegs.length === destPrefix.length &&
    prefixSegs.every((seg, i) => seg.startsWith('[') || seg === destPrefix[i])
  )
}
