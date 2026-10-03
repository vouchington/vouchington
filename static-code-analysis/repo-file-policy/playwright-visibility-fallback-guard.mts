import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PLAYWRIGHT_SPEC_RE = /^playwright\/tests\/(?:[^/]+\/)*[^/]+\.spec\.mts$/
const SWALLOWED_VISIBILITY_RE = /\.isVisible\(\)\s*\.catch\(\(\)\s*=>\s*false\)/g
const DIAGNOSTIC =
  'Do not swallow Playwright isVisible() failures with .catch(() => false); seed the expected state and assert the observable result'

/** Checks the exact fallback shape that turns a failed locator check into an ordinary false. */
export function checkPlaywrightVisibilityFallback(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
  readTrackedFile?: (file: string) => string | null,
): void {
  for (const file of trackedFiles) {
    if (!PLAYWRIGHT_SPEC_RE.test(file)) continue

    const source = readTrackedFile?.(file) ?? readFileSync(join(repoRoot, file), 'utf8')
    for (const match of source.matchAll(SWALLOWED_VISIBILITY_RE)) {
      const line = 1 + (source.slice(0, match.index).match(/\n/g)?.length ?? 0)
      errors.push(`::error file=${file},line=${line}::${DIAGNOSTIC}`)
    }
  }
}
