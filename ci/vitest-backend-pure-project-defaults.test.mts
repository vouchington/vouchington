import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'

const projects = [
  { name: 'backend-modules', isolate: false },
  { name: 'backend-no-data-mocks', isolate: true },
] as const

describe('five-second Docker-free backend project defaults', () => {
  it.each(projects)(
    '$name declares five-second defaults without project globalSetup',
    ({ name, isolate }) => {
      const matches = (config.test?.projects ?? []).filter(
        project => typeof project === 'object' && 'test' in project && project.test?.name === name,
      )
      expect(matches).toHaveLength(1)
      expect(matches[0]).toMatchObject({
        extends: true,
        test: { testTimeout: 5_000, hookTimeout: 5_000, pool: 'forks', isolate },
      })
      expect(matches[0]).not.toHaveProperty('test.globalSetup')
    },
  )
})
