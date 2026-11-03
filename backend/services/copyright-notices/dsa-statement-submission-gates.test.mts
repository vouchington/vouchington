import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { stubDsaTransparencyDatabaseProvider } from '@voucha/test-helpers/dsa-transparency-database-provider'
import { configureDsaStatementSubmissionForTest } from '@voucha/test-helpers/dsa-switches'
import { afterNextPostgresCommitForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestDsaSubmission,
  readTestDsaAttempts,
  readTestDsaSubmission,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import { copyrightConfig } from './config.mts'
import { processDsaStatementSubmission } from './dsa-statement-submission.mts'

describe('DSA statement submission gates', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each([
    ['the switch is off', { dsaSorDatabase: false }, 'disabled'],
    ['the start date is unset', { dsaSorDatabaseFrom: '' }, 'configuration_missing'],
  ] as const)('keeps the ledger empty when %s', async (_name, fields, expected) => {
    const id = await createTestDsaSubmission()
    onTestFinished(await configureDsaStatementSubmissionForTest(fields))
    const provider = stubDsaTransparencyDatabaseProvider()
    expect((await processDsaStatementSubmission(id)).status).toBe(expected)
    expect(await readTestDsaAttempts(id)).toEqual([])
    expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
    expect(provider.requests).toBe(0)
  })

  it.each([
    ['blank', ''],
    ['whitespace', '   '],
  ])('keeps the ledger empty when the credentials are %s', async (_name, value) => {
    const id = await createTestDsaSubmission()
    onTestFinished(await configureDsaStatementSubmissionForTest())
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', value)
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', value)
    const provider = stubDsaTransparencyDatabaseProvider()
    expect((await processDsaStatementSubmission(id)).status).toBe('configuration_missing')
    expect(await readTestDsaAttempts(id)).toEqual([])
    expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
    expect(provider.requests).toBe(0)
  })

  it('does not claim an earlier restriction after the operator moves the start date', async () => {
    const id = await createTestDsaSubmission()
    onTestFinished(
      await configureDsaStatementSubmissionForTest({ dsaSorDatabaseFrom: '2200-01-01' }),
    )
    const provider = stubDsaTransparencyDatabaseProvider()
    expect((await processDsaStatementSubmission(id)).status).toBe('not_claimable')
    expect(await readTestDsaAttempts(id)).toEqual([])
    expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
    expect(provider.requests).toBe(0)
  })

  it.each([
    [
      'switch withdrawn',
      'disabled',
      () => overrideDynamicConfigFieldsForTest(copyrightConfig, { dsaSorDatabase: false }),
    ],
    [
      'start date unset',
      'configuration_missing',
      () => overrideDynamicConfigFieldsForTest(copyrightConfig, { dsaSorDatabaseFrom: '' }),
    ],
    [
      'start date moved past the restriction',
      'not_claimable',
      () =>
        overrideDynamicConfigFieldsForTest(copyrightConfig, { dsaSorDatabaseFrom: '2200-01-01' }),
    ],
    [
      'credentials withdrawn',
      'configuration_missing',
      () => {
        vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', '')
        return () => undefined
      },
    ],
  ] as const)(
    'rechecks after claiming without sending when the %s',
    async (_name, expected, change) => {
      const id = await createTestDsaSubmission()
      const restoreConfig = await configureDsaStatementSubmissionForTest()
      onTestFinished(restoreConfig)
      const provider = stubDsaTransparencyDatabaseProvider()
      let restoreChange: () => void = () => undefined
      onTestFinished(
        afterNextPostgresCommitForTest(() => {
          restoreChange = change()
        }),
      )
      expect((await processDsaStatementSubmission(id)).status).toBe(expected)
      restoreChange()
      restoreConfig()
      expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
      expect(await readTestDsaAttempts(id)).toEqual([])
      expect(provider.requests).toBe(0)
    },
  )

  it('releases a claim when the configured endpoint fails its HTTPS allowlist', async () => {
    const id = await createTestDsaSubmission()
    onTestFinished(await configureDsaStatementSubmissionForTest())
    vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', 'https://attacker.example/api/v1')
    const provider = stubDsaTransparencyDatabaseProvider()
    expect((await processDsaStatementSubmission(id)).status).toBe('configuration_missing')
    expect((await readTestDsaSubmission(id)).lease_token).toBeNull()
    expect(await readTestDsaAttempts(id)).toEqual([])
    expect(provider.requests).toBe(0)
  })
})
