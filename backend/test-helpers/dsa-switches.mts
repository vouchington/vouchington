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
