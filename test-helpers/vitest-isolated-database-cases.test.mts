import { describe, expect, it } from 'vitest'
import {
  getIsolatedDatabaseCase,
  getIsolatedDatabaseCaseMode,
  getIsolatedDatabaseChildCase,
  isolatedTestNamePattern,
  makeIsolatedDatabaseName,
} from './vitest-isolated-database-cases.mts'

const databaseName = `voucha_scope_case_${'a'.repeat(24)}`
const databaseUrl = `postgres://postgres@localhost:5432/${databaseName}`
const childEnv = {
  VITEST_ISOLATED_DATABASE_CASE: 'activitypub-expiry',
  VITEST_ISOLATED_DATABASE_CHILD: databaseName,
  DATABASE_URL: databaseUrl,
  READ_DATABASE_URL: databaseUrl,
}

describe('isolated database case selection', () => {
  it('registers only exact media replay and ActivityPub expiry tests', () => {
    expect(makeIsolatedDatabaseName('a'.repeat(24))).toBe(databaseName)
    expect(() => makeIsolatedDatabaseName('shared_database')).toThrow(
      'Invalid isolated database suffix',
    )
    expect(getIsolatedDatabaseCase('media-replay')).toEqual({
      file: 'backend/api/v1/copyright-notices/copyright-notices.replay.isolated.test.mts',
      fullName:
        'isolated global media replay route replays failed media registry records only for review staff and writes one audit event',
    })
    expect(getIsolatedDatabaseCase('activitypub-expiry')).toEqual({
      file: 'backend/services/ap-inbox-activities/durable-delivery-storage.test.mts',
      fullName:
        'ActivityPub inbox durable storage bounds deletes expired rows in deterministic lease-aware locked batches',
    })
    expect(() => getIsolatedDatabaseCase('other')).toThrow('Unknown isolated database case')
  })

  it('anchors the selected test name instead of matching a prefix or sibling', () => {
    const { fullName } = getIsolatedDatabaseCase('activitypub-expiry')
    const pattern = new RegExp(isolatedTestNamePattern('activitypub-expiry'))
    expect(pattern.test(fullName)).toBe(true)
    expect(pattern.test(`${fullName} extra`)).toBe(false)
    expect(pattern.test(`prefix ${fullName}`)).toBe(false)
  })

  it('distinguishes a parent from the exact registered disposable child', () => {
    expect(getIsolatedDatabaseCaseMode('activitypub-expiry', {})).toBe('parent')
    expect(getIsolatedDatabaseCaseMode('activitypub-expiry', childEnv)).toBe('child')
    expect(getIsolatedDatabaseChildCase(childEnv)).toEqual(
      getIsolatedDatabaseCase('activitypub-expiry'),
    )
  })

  it.each([
    {
      override: { VITEST_ISOLATED_DATABASE_CHILD: undefined },
      message: 'Invalid isolated database child identity',
    },
    {
      override: { VITEST_ISOLATED_DATABASE_CASE: undefined },
      message: 'Invalid isolated database child identity',
    },
    {
      override: { VITEST_ISOLATED_DATABASE_CASE: 'media-replay' },
      message: 'Invalid isolated database child identity',
    },
    {
      override: { VITEST_ISOLATED_DATABASE_CHILD: 'shared_database' },
      message: 'Invalid isolated database child identity',
    },
    {
      override: { DATABASE_URL: 'postgres://postgres@localhost:5432/shared_database' },
      message: 'requires its exact disposable database',
    },
    {
      override: { READ_DATABASE_URL: 'postgres://postgres@localhost:5432/shared_database' },
      message: 'requires its exact disposable database',
    },
    {
      override: { DATABASE_URL: `${databaseUrl}?dbname=shared_database` },
      message: 'requires its exact disposable database',
    },
    {
      override: { DATABASE_URL: `postgres://postgres@remote.example:5432/${databaseName}` },
      message: 'requires its exact disposable database',
    },
  ])('rejects a malformed or mismatched child identity %#', ({ override, message }) => {
    expect(() =>
      getIsolatedDatabaseCaseMode('activitypub-expiry', { ...childEnv, ...override }),
    ).toThrow(message)
  })

  it('rejects a child config without both identity markers', () => {
    expect(() => getIsolatedDatabaseChildCase({})).toThrow('Missing isolated database child case')
    expect(() =>
      getIsolatedDatabaseChildCase({ ...childEnv, VITEST_ISOLATED_DATABASE_CASE: 'other' }),
    ).toThrow('Unknown isolated database case')
  })
})
