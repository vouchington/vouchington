import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type NoMistakesConfig = {
  projects?: Record<string, { root?: string; type?: string }>
  rules?: Array<{ name?: string; options?: { projectFilters?: Record<string, string[]> } }>
}

function readNoMistakesConfig(): NoMistakesConfig {
  return parseYaml(readFileSync(`${repoRoot}/.no-mistakes.yml`, 'utf8')) as NoMistakesConfig
}

describe('no-mistakes transient-retry config', () => {
  it('keeps transient-retry owned by a dedicated no-mistakes project and ci-tools suite', () => {
    const noMistakes = readNoMistakesConfig()
    const filters = noMistakes.rules?.find(rule => rule.name === 'Vitest CI path coverage')?.options
      ?.projectFilters

    expect(noMistakes.projects?.['ci-transient-retry']).toEqual({
      root: 'ci/transient-retry',
      type: 'tests',
    })
    expect(filters?.['ci-transient-retry']).toEqual(['tooling'])
    expect(filters?.['ci-tools']).toEqual(['tooling'])
  })
})
