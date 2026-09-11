import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type NoMistakesConfig = {
  rules?: Array<{ options?: Record<string, unknown>; rule?: string }>
}

describe('package-json-workspace-coverage config', () => {
  it('keeps packageRoots complete and unnamed strays visible', () => {
    const config = parseYaml(
      readFileSync(`${repoRoot}/.no-mistakes.yml`, 'utf8'),
    ) as NoMistakesConfig
    const coverage = config.rules?.find(rule => rule.rule === 'package-json-workspace-coverage')
    const packageRoots = coverage?.options?.packageRoots
    expect(Array.isArray(packageRoots)).toBe(true)
    expect(coverage?.options?.requireNamedPackage).not.toBe(true)

    const roots = new Set(
      (packageRoots as string[]).map(root => root.replaceAll('\\', '/').replace(/^\.\//, '')),
    )
    const trackedTopLevelDirs = new Set(
      execFileSync('git', ['ls-tree', '-d', '--name-only', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      })
        .split('\n')
        .filter(Boolean),
    )
    expect([...trackedTopLevelDirs].filter(dir => !roots.has(dir)).sort()).toEqual([])

    const workspaceYaml = parseYaml(readFileSync(`${repoRoot}/pnpm-workspace.yaml`, 'utf8')) as {
      packages?: string[]
    }
    const workspacePrefixes = new Set(
      (workspaceYaml.packages ?? []).map(pattern => pattern.replaceAll('\\', '/').split('/')[0]),
    )
    const extraRoots = [...roots].filter(root => !trackedTopLevelDirs.has(root)).sort()
    expect(extraRoots.every(root => workspacePrefixes.has(root))).toBe(true)
  })
})
