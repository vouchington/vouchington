import sql from 'sql-template-strings'
import { afterEach, beforeEach } from 'vitest'
import { write } from '@data-stores/psql'
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
 * Records, once, that the switch went on a year ago. Automation acts only on submissions received
 * since the audited switch-on, and a real switch-on is audited the moment an administrator flips it;
 * a test flips the switch in memory, so it needs this backdated record to stand in for that flip.
 * The row is old enough that no test notice predates it, and it is never written as a current flip.
 */
async function recordBackdatedSwitchOn(): Promise<void> {
  await write(sql`/* recordBackdatedAutomaticWithholdingSwitchOn */
    INSERT INTO dynamic_config_change_logs (id, config_key, changed_by_id, previous_fields, next_fields)
    SELECT uuidv7(interval '-1 year'), 'copyright', NULL,
      '{"automaticProvisionalWithholding": false}'::jsonb,
      '{"automaticProvisionalWithholding": true}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM dynamic_config_change_logs
      WHERE config_key = 'copyright'
        AND next_fields -> 'automaticProvisionalWithholding' = 'true'::jsonb
        AND uuid_extract_timestamp(id) <= now() - interval '1 year' + interval '1 minute'
    )
  `)
}

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
  await recordBackdatedSwitchOn()
  return overrideDynamicConfigFieldsForTest(copyrightConfig, {
    ...permissiveGateFields,
    ...fields,
    automaticProvisionalWithholding: true,
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
