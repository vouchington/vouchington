import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

const BANNED_TEST_HELPER_DIRECTORY_NAMES = [
  'test-helper',
  'test-support',
  'test-utils',
  'testutils',
  'test-utilities',
  'testutilities',
  'testing-helper',
  'testing-helpers',
] as const

const bannedTestHelperDirectoryNames = new Set<string>(BANNED_TEST_HELPER_DIRECTORY_NAMES)

type NoMistakesConfig = {
  rules?: Array<{
    exclude?: string[]
    name?: string
    options?: { bannedPaths?: Array<{ glob?: string; message?: string }> }
    rule?: string
  }>
}

function trackedBaselinedTestHelperPaths(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(path => {
      const segments = path.split('/')
      return (
        segments.indexOf('test-helpers') >= 2 ||
        segments.some(segment => bannedTestHelperDirectoryNames.has(segment))
      )
    })
}

function unescapeGlobLiteral(path: string): string {
  return path.replaceAll('[[]', '[').replaceAll('[]]', ']')
}

describe('no-mistakes test-helper path config', () => {
  it('blocks nested aliases with an exact tracked-file baseline', () => {
    const config = parseYaml(
      readFileSync(`${repoRoot}/.no-mistakes.yml`, 'utf8'),
    ) as NoMistakesConfig
    const rule = config.rules?.find(rule => rule.name === 'banned repository paths')
    const expectedGlobs = [
      '*/*/**/test-helpers/**',
      ...BANNED_TEST_HELPER_DIRECTORY_NAMES.map(directory => `**/${directory}/**`),
    ]
    const helperBans = rule?.options?.bannedPaths?.filter(ban =>
      expectedGlobs.includes(ban.glob ?? ''),
    )

    expect(rule).toMatchObject({ rule: 'banned-paths' })
    expect(helperBans).toEqual(
      expectedGlobs.map(glob => ({
        glob,
        message: 'Test helpers must live under test-helpers/** or <top-level>/test-helpers/**.',
      })),
    )
    expect(rule?.exclude?.map(unescapeGlobLiteral)).toEqual(trackedBaselinedTestHelperPaths())
    expect(rule?.exclude).toHaveLength(106)
    expect(rule?.exclude?.every(path => !/[*?{]/.test(path))).toBe(true)
  })
})
