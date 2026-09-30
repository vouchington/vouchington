import { afterEach, beforeEach } from 'vitest'
import { copyrightConfig } from '../../../services/copyright-notices/config.mts'
import { overrideDynamicConfigFieldsForTest } from '../../dynamic-config.mts'

/**
 * Turns `automaticProvisionalWithholding` on for this fork and returns its restore function. The
 * config is detached from Valkey pub/sub first, so a namespace update from another fork cannot flip
 * the switch mid-test in projects without the dynamic-config isolation setup.
 */
export async function enableAutomaticProvisionalWithholdingForTest(): Promise<() => void> {
  await copyrightConfig.waitForInitialization()
  await copyrightConfig.close()
  return overrideDynamicConfigFieldsForTest(copyrightConfig, {
    automaticProvisionalWithholding: true,
  })
}

/**
 * Turns `automaticProvisionalWithholding` on before each test in the describe block and restores it
 * after each one, for tests of the automated clear-screen path that launch keeps off.
 */
export function useAutomaticProvisionalWithholding(): void {
  let restore: (() => void) | undefined

  beforeEach(async () => {
    restore = await enableAutomaticProvisionalWithholdingForTest()
  })

  afterEach(() => {
    restore?.()
    restore = undefined
  })
}
