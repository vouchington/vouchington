import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'

const projects = ['dev-tools', 'ci-tools', 'github-actions', 'docker-deploy'] as const

describe('five-second operations project defaults', () => {
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
