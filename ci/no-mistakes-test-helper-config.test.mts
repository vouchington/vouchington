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

type NoMistakesConfig = {
  rules?: Array<{
    exclude?: string[]
    name?: string
    options?: { bannedPaths?: Array<{ glob?: string; message?: string }> }
    rule?: string
  }>
}

describe('no-mistakes test-helper path config', () => {
  it('allows only literal first-layer test-helpers directories', () => {
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
    expect(rule?.exclude).toBeUndefined()
  })
})
