import { describe, expect, it } from 'vitest'
import {
  ISOLATED_DATABASE_PARENT_TIMEOUT_MS,
  runIsolatedDatabaseCase,
} from './vitest-isolated-database-case.mts'
import { assertIsolatedDatabaseCaseRan } from './vitest-isolated-database-case-result.mts'
import {
  getIsolatedDatabaseCase,
  getIsolatedDatabaseChildCase,
  makeIsolatedDatabaseName,
} from './vitest-isolated-database-cases.mts'

describe('isolated database case registry', () => {
  it('has no registered cases after the semantic search move', () => {
    expect(() => getIsolatedDatabaseCase('semantic-post-window-cap')).toThrow(
      'Unknown isolated database case: semantic-post-window-cap',
    )
    expect(() => getIsolatedDatabaseCase('semantic-post-window-selective')).toThrow(
      'Unknown isolated database case: semantic-post-window-selective',
    )
    expect(() => getIsolatedDatabaseChildCase({})).toThrow('Missing isolated database child case')
  })

  it('still validates disposable database names until harness removal', () => {
    expect(makeIsolatedDatabaseName('a'.repeat(24))).toBe(`voucha_scope_case_${'a'.repeat(24)}`)
    expect(() => makeIsolatedDatabaseName('shared_database')).toThrow(
      'Invalid isolated database suffix',
    )
  })

  it('rejects results for removed cases', () => {
    expect(() => assertIsolatedDatabaseCaseRan('semantic-post-window-selective', '')).toThrow(
      'Unknown isolated database case: semantic-post-window-selective',
    )
  })

  it('retains a bounded launcher API until the harness is removed', () => {
    expect(runIsolatedDatabaseCase).toBeTypeOf('function')
    expect(ISOLATED_DATABASE_PARENT_TIMEOUT_MS).toBeLessThanOrEqual(300_000)
  })
})
