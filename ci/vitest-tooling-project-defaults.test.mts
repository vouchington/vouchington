import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'

describe('declared git-hooks timeout policy', () => {
  it('resolves a five-second test default with bounded hooks and isolated resources', () => {
    const projects = config.test?.projects ?? []
    const hooks = projects.filter(
      project =>
        typeof project === 'object' && 'test' in project && project.test?.name === 'git-hooks',
    )
    expect(hooks).toHaveLength(1)
    expect(hooks[0]).toMatchObject({
      extends: true,
      test: {
        testTimeout: 5_000,
        hookTimeout: 5_000,
        isolate: true,
        include: ['.husky/**/*.test.mts'],
        setupFiles: ['./test-helpers/vitest.setup.tooling-isolated-env.mts'],
      },
    })
  })
})
