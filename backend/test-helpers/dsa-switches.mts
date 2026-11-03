import { afterEach, beforeEach, vi } from 'vitest'
import { copyrightConfig } from '../services/copyright-notices/config.mts'
import { DSA_TEST_PROVIDER_ORIGIN } from './dsa-transparency-database-provider.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'

/** Isolates the DSA report switch to this test fork and restores it after each test. */
export function useDsaTransparencyReports(enabled = true): void {
  let restore: (() => void) | undefined
  beforeEach(async () => {
    await copyrightConfig.waitForInitialization()
    await copyrightConfig.close()
    restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      dsaTransparencyReports: enabled,
    })
  })
  afterEach(() => {
    restore?.()
    restore = undefined
  })
}

/** Isolates the public DSA submission switch and cutoff to this test fork. */
export function useDsaStatementSubmissions(enabled = true, from = '2020-01-01'): void {
  let restore: (() => void) | undefined
  beforeEach(async () => {
    await copyrightConfig.waitForInitialization()
    await copyrightConfig.close()
    restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      dsaSorDatabase: enabled,
      dsaSorDatabaseFrom: from,
    })
  })
  afterEach(() => {
    restore?.()
    restore = undefined
  })
}

/**
 * Sets the DSA submission switch and cutoff for one test and returns the restore. Restore nested
 * overrides in reverse order.
 */
export async function overrideDsaStatementSubmissionConfigForTest(
  fields: { dsaSorDatabase?: boolean; dsaSorDatabaseFrom?: string } = {},
): Promise<() => void> {
  await copyrightConfig.waitForInitialization()
  await copyrightConfig.close()
  return overrideDynamicConfigFieldsForTest(copyrightConfig, {
    dsaSorDatabase: true,
    dsaSorDatabaseFrom: '2020-01-01',
    ...fields,
  })
}

/**
 * Switch on, cutoff 2020-01-01, and credentials for the synthetic provider origin. Call
 * `vi.unstubAllEnvs()` after the test; returns the config restore.
 */
export async function configureDsaStatementSubmissionForTest(
  fields: { dsaSorDatabase?: boolean; dsaSorDatabaseFrom?: string } = {},
): Promise<() => void> {
  vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', `${DSA_TEST_PROVIDER_ORIGIN}/api/v1`)
  vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', 'synthetic-token')
  return overrideDsaStatementSubmissionConfigForTest(fields)
}
