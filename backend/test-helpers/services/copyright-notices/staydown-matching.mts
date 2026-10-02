import { afterEach, beforeEach } from 'vitest'
import { copyrightConfig } from '../../../services/copyright-notices/config.mts'
import { overrideDynamicConfigFieldsForTest } from '../../dynamic-config.mts'

/**
 * Turns `staydownMatching` on for this fork and returns its restore function. The config is
 * detached from Valkey pub/sub first, so a namespace update from another fork cannot flip the
 * switch mid-test in projects without the dynamic-config isolation setup.
 */
export async function enableStaydownMatchingForTest(): Promise<() => void> {
  await copyrightConfig.waitForInitialization()
  await copyrightConfig.close()
  return overrideDynamicConfigFieldsForTest(copyrightConfig, { staydownMatching: true })
}

/** Turns `staydownMatching` on before each test in the describe block and restores it after. */
export function useStaydownMatching(): void {
  let restore: (() => void) | undefined

  beforeEach(async () => {
    restore = await enableStaydownMatchingForTest()
  })

  afterEach(() => {
    restore?.()
    restore = undefined
  })
}
