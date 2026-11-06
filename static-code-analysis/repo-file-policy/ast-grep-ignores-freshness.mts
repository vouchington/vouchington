import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import picomatch from 'picomatch'
import { parse } from 'yaml'

const RULES_DIR = 'ast-grep-rules'

/** Glob metacharacters ast-grep ignore entries use. A path without them is a literal file. */
const GLOB_METACHARACTER = /[*?{[]/u

export function astGrepIgnoreEntries(document: unknown): string[] {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) return []
  const ignores = (document as { ignores?: unknown }).ignores
  if (typeof ignores === 'string') return [ignores]
  if (!Array.isArray(ignores)) return []
  return ignores.filter((entry): entry is string => typeof entry === 'string')
}

function isGlobIgnore(entry: string): boolean {
  return GLOB_METACHARACTER.test(entry)
}

function staleMessage(ruleFile: string, entry: string): string {
  return `${ruleFile}: stale ignores entry ${entry}; remove it`
}

/** Reports ignore entries that name a missing file or match no tracked path. */
export function staleAstGrepIgnoreMessages(
  ruleFile: string,
  ignores: readonly string[],
  trackedFiles: readonly string[],
): string[] {
  const tracked = new Set(trackedFiles)
  const globState = new Map<string, { matched: boolean; matches: (file: string) => boolean }>()
  for (const entry of ignores) {
    if (!isGlobIgnore(entry) || globState.has(entry)) continue
    globState.set(entry, { matched: false, matches: picomatch(entry, { dot: true }) })
  }
  if (globState.size > 0) {
    let remaining = globState.size
    for (const file of trackedFiles) {
      for (const glob of globState.values()) {
        if (glob.matched || !glob.matches(file)) continue
        glob.matched = true
        remaining -= 1
      }
      if (remaining === 0) break
    }
  }
  const messages: string[] = []
  for (const entry of ignores) {
    const glob = globState.get(entry)
    const stale = glob === undefined ? !tracked.has(entry) : !glob.matched
    if (stale) messages.push(staleMessage(ruleFile, entry))
  }
  return messages
}

/** Checks tracked ast-grep rule files for ignores entries that match nothing. */
export function checkAstGrepIgnoresFreshness(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
): void {
  for (const ruleFile of trackedFiles) {
    if (!ruleFile.startsWith(`${RULES_DIR}/`) || !ruleFile.endsWith('.yml')) continue
    const document: unknown = parse(readFileSync(join(repoRoot, ruleFile), 'utf8'))
    errors.push(
      ...staleAstGrepIgnoreMessages(ruleFile, astGrepIgnoreEntries(document), trackedFiles),
    )
  }
}
