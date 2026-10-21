import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'
import {
  FAST_TEST_STATEMENT_TIMEOUT_MS,
  MAX_TEST_STATEMENT_TIMEOUT_MS,
  parseTestStatementTimeout,
} from '../backend/test-helpers/statement-timeout-constant.mts'

interface SessionProject {
  test?: {
    name?: string
    globalSetup?: string | string[]
    setupFiles?: string[]
    env?: { PG_TEST_STATEMENT_TIMEOUT_MS?: string }
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
        'backend-migration-initializers',
        'backend/analytics-integration',
        'web-api',
        'backend-aws',
        'backend-openrouter',
        'backend-real-glide-mq',
      ]),
    )
    expect(parseTestStatementTimeout(undefined)).toBe(FAST_TEST_STATEMENT_TIMEOUT_MS)
    const shortConsumers = consumers.filter(
      project =>
        Math.min(
          project.test?.testTimeout ?? Number.POSITIVE_INFINITY,
          project.test?.hookTimeout ?? Number.POSITIVE_INFINITY,
        ) <= 15_000,
    )
    for (const project of shortConsumers) {
      expect(project.test?.env?.PG_TEST_STATEMENT_TIMEOUT_MS).toBe(
        String(FAST_TEST_STATEMENT_TIMEOUT_MS),
      )
    }
    for (const project of consumers) {
      const statementTimeoutMs = parseTestStatementTimeout(
        project.test?.env?.PG_TEST_STATEMENT_TIMEOUT_MS ?? process.env.PG_TEST_STATEMENT_TIMEOUT_MS,
      )
      expect(statementTimeoutMs).toBeLessThanOrEqual(MAX_TEST_STATEMENT_TIMEOUT_MS)
      for (const deadline of [project.test?.testTimeout, project.test?.hookTimeout]) {
        expect(typeof deadline).toBe('number')
        if (typeof deadline !== 'number') throw new Error('Missing database consumer deadline')
        expect(statementTimeoutMs).toBeLessThan(deadline)
        const projectMaximum =
          deadline <= 5_000 ? FAST_TEST_STATEMENT_TIMEOUT_MS : MAX_TEST_STATEMENT_TIMEOUT_MS
        expect(statementTimeoutMs).toBeLessThanOrEqual(projectMaximum)
      }
    }
  })
})
