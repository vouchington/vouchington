import { afterEach, beforeEach } from 'vitest'
import { copyrightConfig } from '../../../services/copyright-notices/config.mts'
import { overrideDynamicConfigFieldsForTest } from '../../dynamic-config.mts'

type ConfigFields = Parameters<typeof overrideDynamicConfigFieldsForTest>[1]

/**
 * Abuse gates that every notice passes: no account age or trust floor and caps far above any test.
 * Tests of a single gate override just that field.
 */
const permissiveGateFields = {
  automaticWithholdingMinTrustTier: 0,
  automaticWithholdingMinAccountAgeDays: 0,
  automaticWithholdingClaimantDailyCap: 1000,
  automaticWithholdingPosterDailyCap: 1000,
} satisfies ConfigFields

/**
 * Turns `automaticProvisionalWithholding` on for this fork, with permissive abuse gates unless the
 * caller overrides them, and returns its restore function. The config is detached from Valkey
 * pub/sub first, so a namespace update from another fork cannot flip the switch mid-test in
 * projects without the dynamic-config isolation setup.
 */
export async function enableAutomaticProvisionalWithholdingForTest(
  fields: ConfigFields = {},
): Promise<() => void> {
  await copyrightConfig.waitForInitialization()
  await copyrightConfig.close()
  return overrideDynamicConfigFieldsForTest(copyrightConfig, {
    ...permissiveGateFields,
    ...fields,
    automaticProvisionalWithholding: true,
    automaticProvisionalWithholdingSince: new Date(
      Date.now() - 365 * 24 * 60 * 60 * 1000,
    ).toISOString(),
  })
}

/** Change only the current on-period for an exact receipt-boundary assertion. */
export async function overrideAutomaticWithholdingSinceForTest(
  at: Date | string,
): Promise<() => void> {
  await copyrightConfig.waitForInitialization()
  await copyrightConfig.close()
  return overrideDynamicConfigFieldsForTest(copyrightConfig, {
    automaticProvisionalWithholdingSince: at instanceof Date ? at.toISOString() : at,
  })
}

/**
 * Turns `automaticProvisionalWithholding` on before each test in the describe block and restores it
 * after each one, for tests of the automated clear-screen path that launch keeps off.
 */
export function useAutomaticProvisionalWithholding(fields: ConfigFields = {}): void {
  let restore: (() => void) | undefined

  beforeEach(async () => {
    restore = await enableAutomaticProvisionalWithholdingForTest(fields)
  })

  afterEach(() => {
    restore?.()
    restore = undefined
  })
}

/**
 * Registers an after-each restore for every switch-on a test makes and returns the function that
 * makes one, for tests that need the switch off at first or flip it with gate fields that differ
 * per test. Call it inside a describe block.
 */
export function useAutomaticWithholdingSwitch(): (fields?: ConfigFields) => Promise<void> {
  const restores: Array<() => void> = []

  afterEach(() => {
    for (const restore of restores.splice(0).toReversed()) restore()
  })

  return async (fields = {}) => {
    restores.push(await enableAutomaticProvisionalWithholdingForTest(fields))
  }
}
