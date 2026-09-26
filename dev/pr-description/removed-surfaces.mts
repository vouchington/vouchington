import { parseRemovedExports } from './removed-exports.mts'
// One parser serves both `validate <pr>` (`gh pr diff`) and `create` (`git diff origin/main...HEAD`)
// so the supersession search vocabulary always reflects what the diff deletes, not what it adds.

export type RemovedSurface =
  | { path: string; type: 'deleted-file' }
  | { name: string; path: string; type: 'removed-export' }
  | { path: string; route: string; type: 'removed-route' }
  | { name: string; path: string; type: 'removed-script' }

const DIFF_GIT_OLD_PATH_RE = /^diff --git a\/(?<path>.+) b\/.+$/m
const NEW_PATH_RE = /^\+\+\+ b\/(?<path>.+)$/m
const DELETED_FILE_MODE_RE = /^deleted file mode \d+$/m
const RENAME_FROM_RE = /^rename from (?<path>.+)$/m
// The segment/slash pair is optional so this also matches the root `web/app/page.tsx`.
const ROUTE_FILE_RE = /^web\/app\/(?:(?<segments>.+)\/)?(?:page|route)\.tsx?$/
const UBIQUITY_STOPLIST = new Set(
  'base common config constants core helper helpers index main shared types util utils'.split(' '),
)
const TYPE_PRIORITY: Record<RemovedSurface['type'], number> = {
  'deleted-file': 0,
  'removed-export': 1,
  'removed-route': 2,
  'removed-script': 3,
}

export function parseRemovedSurfaces(patch: string): RemovedSurface[] {
  const surfaces: RemovedSurface[] = []
  for (const block of splitDiffBlocks(patch)) {
    if (DELETED_FILE_MODE_RE.test(block)) {
      // `--- a/`/`+++ /dev/null` are absent for binary/empty deletions; `diff --git` is not.
      const oldPath = DIFF_GIT_OLD_PATH_RE.exec(block)?.groups?.path
      if (oldPath === undefined) continue
      surfaces.push({ path: oldPath, type: 'deleted-file' })
      const route = parseRouteFromPath(oldPath)
      if (route !== undefined) surfaces.push({ path: oldPath, route, type: 'removed-route' })
      continue
    }
    // A renamed route loses its old URL even with no content hunk, so its old path is checked here.
    const renamedFrom = RENAME_FROM_RE.exec(block)?.groups?.path
    if (renamedFrom !== undefined) {
      const route = parseRouteFromPath(renamedFrom)
      if (route !== undefined) surfaces.push({ path: renamedFrom, route, type: 'removed-route' })
    }
    const newPath = NEW_PATH_RE.exec(block)?.groups?.path
    if (newPath === undefined) continue
    surfaces.push(...parseRemovedExports(block, newPath))
  }
  return surfaces
}

/**
 * `package.json` `scripts` removal is detected by diffing full pre/post-image key sets
 * (`removed-scripts.mts`), not by parsing this hunk — a 3-line-context patch frequently omits the
 * `"scripts": {` opener, making any hunk-only heuristic silently inert on real manifests (#8779).
 * This only collects which paths changed, so the caller knows which files to fetch both sides of.
 * A deleted `package.json` is skipped: the `deleted-file` surface above already covers it.
 */
export function parseChangedPackageJsonPaths(patch: string): string[] {
  const paths: string[] = []
  for (const block of splitDiffBlocks(patch)) {
    if (DELETED_FILE_MODE_RE.test(block)) continue
    const newPath = NEW_PATH_RE.exec(block)?.groups?.path
    if (newPath !== undefined && newPath.endsWith('package.json')) paths.push(newPath)
  }
  return paths
}

function splitDiffBlocks(patch: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ') && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }
    current.push(line)
  }
  if (current.length > 0) blocks.push(current.join('\n'))
  return blocks
}

function parseRouteFromPath(path: string): string | undefined {
  const match = ROUTE_FILE_RE.exec(path)
  if (match === null) return undefined
  const segments = (match.groups?.segments ?? '').split('/')
  const kept = segments.filter(seg => seg !== '' && !/^\(.+\)$/.test(seg))
  return kept.length > 0 ? `/${kept.join('/')}` : '/'
}

// Bounds and orders the search vocabulary as quoted phrase terms (a quoted path outranked the bare
// filename against the live API), dropping sub-4-char/stoplist terms; excluded terms land in `dropped`.
export function buildRemovalVocabulary(
  surfaces: RemovedSurface[],
  limit = 12,
): { terms: string[]; dropped: string[] } {
  const ordered = surfaces.toSorted((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type])
  const seen = new Set<string>()
  const terms: string[] = []
  const dropped: string[] = []

  for (const surface of ordered) {
    const term = candidateTerm(surface)
    const bare = term.replaceAll('"', '')
    if (bare.length < 4 || UBIQUITY_STOPLIST.has(bare.toLowerCase())) {
      dropped.push(term)
      continue
    }
    const key = bare.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (terms.length < limit) terms.push(term)
    else dropped.push(term)
  }

  return { dropped, terms }
}

function candidateTerm(surface: RemovedSurface): string {
  if (surface.type === 'deleted-file') return quoteIfNeeded(surface.path)
  if (surface.type === 'removed-script') return quoteIfNeeded(surface.name)
  if (surface.type === 'removed-export') return surface.name
  const segments = surface.route.split('/').filter(seg => seg !== '' && !/^\[.+\]$/.test(seg))
  return quoteIfNeeded(segments.length > 0 ? `/${segments.join('/')}` : surface.route)
}

function quoteIfNeeded(term: string): string {
  return /[/:]/.test(term) ? `"${term}"` : term
}
