import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'
import {
  MAX_TEST_STATEMENT_TIMEOUT_MS,
  TEST_STATEMENT_TIMEOUT_MS,
} from '../backend/test-helpers/statement-timeout-constant.mts'

interface SessionProject {
  test?: {
    name?: string
    globalSetup?: string | string[]
    setupFiles?: string[]
    testTimeout?: number
    hookTimeout?: number
  }
}

describe('backend Vitest project config', () => {
  it('leaves SQL attribution and cleanup headroom for every test-session setup consumer', () => {
    const sessionSetups = new Set([
      './test-helpers/vitest.setup.data-stores.mts',
      './test-helpers/vitest.setup.shared-db-scope-guard.mts',
      './test-helpers/vitest.setup.postgres-sessions.mts',
    ])
    const projects = config.test?.projects as SessionProject[] | undefined
    const consumers = (projects ?? []).filter(project => {
      const globalSetup = project.test?.globalSetup
      const paths = [
        ...(typeof globalSetup === 'string' ? [globalSetup] : (globalSetup ?? [])),
        ...(project.test?.setupFiles ?? []),
      ]
      return paths.some(path => sessionSetups.has(path))
    })
    expect(consumers.map(project => project.test?.name)).toEqual(
      expect.arrayContaining([
        'backend-data-stores',
        'backend-mocks',
        'web-api',
        'backend-aws',
        'backend-openrouter',
        'backend-real-glide-mq',
      ]),
    )
    expect(TEST_STATEMENT_TIMEOUT_MS).toBeLessThanOrEqual(MAX_TEST_STATEMENT_TIMEOUT_MS)
    for (const project of consumers) {
      for (const deadline of [project.test?.testTimeout, project.test?.hookTimeout]) {
        expect(typeof deadline).toBe('number')
        if (typeof deadline !== 'number') throw new Error('Missing database consumer deadline')
        expect(MAX_TEST_STATEMENT_TIMEOUT_MS).toBeLessThan(deadline)
      }
    }
  })
})
