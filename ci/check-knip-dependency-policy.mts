import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

import { parse as parseJsonc } from 'jsonc-parser'

import {
  allowedWorkspaceIgnoreDependencies,
  ignoredDependencyImportPattern,
  PHANTOM_REFERENCE_FILE_NAME,
  type KnipConfig,
} from './knip-dependency-policy.mts'

/** Live tracked-source inspection belongs to dedicated static CI. */
export function checkKnipDependencyPolicy(root: string): void {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
    .toSorted()
  const config = parseJsonc(readFileSync(join(root, 'knip.jsonc'), 'utf8')) as KnipConfig
  const ownPath = relative(root, import.meta.filename)
  const contentCache = new Map<string, string | undefined>()
  const readTracked = (path: string): string | undefined => {
    if (contentCache.has(path)) return contentCache.get(path)
    try {
      const content = readFileSync(join(root, path), 'utf8')
      contentCache.set(path, content)
      return content
    } catch (err) {
      const code = err !== null && typeof err === 'object' && 'code' in err ? err.code : undefined
      if (code !== 'EISDIR' && code !== 'ENOENT') throw err
      contentCache.set(path, undefined)
      return undefined
    }
  }
  const matching = (pattern: RegExp, candidates: readonly string[], workspace?: string) =>
    candidates.filter(path => {
      if (path === ownPath || (workspace && !path.startsWith(`${workspace}/`))) return false
      const content = readTracked(path)
      return content === undefined ? false : pattern.test(content)
    })

  assert.deepEqual(
    files.filter(path => basename(path) === PHANTOM_REFERENCE_FILE_NAME),
    [],
  )
  assert.deepEqual(config.ignoreDependencies ?? [], [])
  const actualIgnores = Object.entries(config.workspaces ?? {})
    .flatMap(([workspace, entry]) =>
      entry.ignoreDependencies === undefined
        ? []
        : [[workspace, entry.ignoreDependencies.toSorted()] as const],
    )
    .toSorted(([left], [right]) => left.localeCompare(right))
  const expectedIgnores = [...allowedWorkspaceIgnoreDependencies.entries()].map(
    ([workspace, allowed]) =>
      [workspace, allowed.map(({ dependency }) => dependency).toSorted()] as const,
  )
  assert.deepEqual(actualIgnores, expectedIgnores)

  for (const [workspace, allowed] of allowedWorkspaceIgnoreDependencies) {
    for (const { dependency, evidenceFiles, evidencePattern } of allowed) {
      assert.deepEqual(matching(evidencePattern, evidenceFiles), evidenceFiles)
      assert.deepEqual(matching(ignoredDependencyImportPattern(dependency), files, workspace), [])
    }
  }
}

if (import.meta.main) checkKnipDependencyPolicy(process.cwd())
