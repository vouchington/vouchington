import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'

const projects = ['static-analysis-tools', 'i18n-extract-codemod', 'i18n-route-bounds'] as const

describe('five-second analysis project defaults', () => {
  it.each(projects)(
    '%s declares five-second defaults with isolated tooling setup',
    name => {
      const declared = config.test?.projects ?? []
      const matches = declared.filter(
        project => typeof project === 'object' && 'test' in project && project.test?.name === name,
      )
      expect(matches).toHaveLength(1)
      expect(matches[0]).toMatchObject({
        extends: true,
        test: {
          testTimeout: 5_000,
          hookTimeout: 5_000,
          isolate: true,
          setupFiles: ['./test-helpers/vitest.setup.tooling-isolated-env.mts'],
        },
      })
    },
    5_000,
  )
})
