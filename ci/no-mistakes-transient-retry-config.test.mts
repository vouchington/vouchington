import { fileURLToPath } from 'node:url'

import { resolveConfig } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

type NoMistakesConfig = {
  projects?: Record<string, { root?: string; type?: string }>
  rules?: Array<{ name?: string; options?: { projectFilters?: Record<string, string[]> } }>
}

const noMistakesConfig = (await resolveConfig({
  root: repoRoot,
  view: 'declared',
})) as NoMistakesConfig

describe('no-mistakes transient-retry config', () => {
  it('keeps transient-retry owned by a dedicated no-mistakes project and ci-tools suite', () => {
    const noMistakes = noMistakesConfig
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
