import { afterEach, beforeEach } from 'vitest'
import { copyrightConfig } from '../services/copyright-notices/config.mts'
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
