import { matchesGlob } from 'node:path'

export const JSCPD_CONFIG_PATH = '.jscpd.json'

// jscpd matches a bare ignore glob at any depth, and applies a `./`-anchored glob to the HEAD scan
// but not to the `--baseline-from-ref` rescan. Only `**/` globs mean the same thing on both sides
// and under `path.matchesGlob`, so they are the only accepted config form.
const ANCHOR = '**/'

export function readIgnoreGlobs(configText: string): string[] {
  const config: unknown = JSON.parse(configText)
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error(`${JSCPD_CONFIG_PATH} must contain a JSON object`)
  }
  const ignore: unknown = (config as { ignore?: unknown }).ignore
  if (ignore === undefined) return []
  if (!Array.isArray(ignore) || !ignore.every(glob => typeof glob === 'string')) {
    throw new Error(`${JSCPD_CONFIG_PATH} "ignore" must be an array of strings`)
  }
  return ignore
}

export function findConfigGlobProblems(globs: string[], trackedFiles: string[]): string[] {
  return globs.flatMap(glob => {
    if (!glob.startsWith(ANCHOR)) {
      return [
        `${JSCPD_CONFIG_PATH} ignore glob "${glob}" must start with "${ANCHOR}"; jscpd matches bare globs at any depth.`,
      ]
    }
    if (!trackedFiles.some(file => matchesGlob(file, glob))) {
      return [
        `${JSCPD_CONFIG_PATH} ignore glob "${glob}" matches no tracked file; delete it and its README row.`,
      ]
    }
    return []
  })
}

// Untracked paths are anchored to the scan root with metacharacters escaped. The base rescan does
// not apply `./` globs, which is harmless because untracked files never exist in the base tree.
export function untrackedIgnoreGlobs(paths: string[]): string[] {
  return paths.map(path => {
    const escaped = `./${path.replace(/[\\*?[\]{}]/g, '\\$&')}`
    return path.endsWith('/') ? `${escaped}**` : escaped
  })
}

// jscpd splits `--ignore` on commas and replaces the config list with it, so every glob is passed
// in one argument and none may contain a comma.
export function buildIgnoreArguments(globs: string[]): string[] {
  const unsplittable = globs.filter(glob => glob.includes(','))
  if (unsplittable.length > 0) {
    throw new Error(
      [
        'jscpd --ignore is comma-separated, so these ignore entries cannot be passed:',
        ...unsplittable.map(glob => `  ${glob}`),
        'Rename the untracked path or rewrite the glob without a comma.',
      ].join('\n'),
    )
  }
  return globs.length === 0 ? [] : ['--ignore', globs.join(',')]
}
