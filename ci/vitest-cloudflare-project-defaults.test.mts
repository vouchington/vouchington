import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'

const projects = [
  'cloudflare-worker',
  'cloudflare-worker-portability',
  'cloudflare-worker-mocks',
] as const

describe('five-second Cloudflare project defaults', () => {
  it.each(projects)('%s declares five-second defaults with no project globalSetup', name => {
    const matches = (config.test?.projects ?? []).filter(
      project => typeof project === 'object' && 'test' in project && project.test?.name === name,
    )
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      extends: true,
      test: { testTimeout: 5_000, hookTimeout: 5_000 },
    })
    expect(matches[0]).not.toHaveProperty('test.globalSetup')
  })
})
