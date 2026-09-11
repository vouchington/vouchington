import type { RemovedSurface } from './removed-surfaces.mts'

/**
 * Reads one side of a `package.json` at `path`. `undefined` means "couldn't read it" (missing on
 * that side, e.g. the file itself is new/deleted, or a transient fetch failure) — callers treat
 * that as an empty `scripts` object rather than throwing, so a read failure only ever narrows the
 * search vocabulary, never blocks `validate`.
 */
export type PackageJsonReader = (path: string, side: 'base' | 'head') => Promise<string | undefined>

function parseScripts(json: string | undefined): Record<string, unknown> {
  if (json === undefined) return {}
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const scripts = (parsed as { scripts?: unknown }).scripts
    if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return {}
    return scripts as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Exact key-set diffing of the full pre/post-image `scripts` object — no hunk parsing, so it
 * inherently handles whole-block removal, key reordering, and a same-named key surviving elsewhere
 * in the manifest (e.g. under `dependencies`). Missing/unparseable JSON on either side degrades to
 * `{}` (see `PackageJsonReader`), so this only ever adds search vocabulary, never throws.
 */
export async function findRemovedScripts(
  paths: string[],
  read: PackageJsonReader,
): Promise<RemovedSurface[]> {
  const results = await Promise.all(
    paths.map(async path => {
      const [baseJson, headJson] = await Promise.all([read(path, 'base'), read(path, 'head')])
      const baseScripts = parseScripts(baseJson)
      const headScripts = parseScripts(headJson)
      const surfaces: RemovedSurface[] = []
      for (const name of Object.keys(baseScripts)) {
        if (!(name in headScripts)) surfaces.push({ name, path, type: 'removed-script' })
      }
      return surfaces
    }),
  )
  return results.flat()
}
