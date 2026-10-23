import {
  copyrightConfig,
  getAutomaticWithholdingThresholds,
  isAutomaticProvisionalWithholdingEnabled,
} from './config.mts'

/**
 * The live switch plus the start of its current on-period. `since` is null while the switch is off,
 * or on with no audited off-to-on change on record, and automation then fails closed.
 */
export type AutomaticWithholdingWindow = { enabled: boolean; since: Date | null }

/**
 * The current on-period starts at the timestamp projected with the switch update. This field
 * survives retention of old audit revisions; malformed or absent values fail closed.
 */
export async function findSwitchOnTime(): Promise<Date | null> {
  await copyrightConfig.waitForInitialization()
  const value = copyrightConfig.getFields().automaticProvisionalWithholdingSince
  if (typeof value !== 'string' || value === '') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value ? null : parsed
}

/**
 * Automated enforcement left pending while the switch was off must not fire after an off-to-on
 * flip, so automation may act only on a submission received during the current on-period.
 */
export async function getAutomaticWithholdingWindow(): Promise<AutomaticWithholdingWindow> {
  if (!(await isAutomaticProvisionalWithholdingEnabled())) return { enabled: false, since: null }
  return { enabled: true, since: await findSwitchOnTime() }
}

/**
 * Where automated enforcement may act: submissions received since this instant. Null while the
 * switch is off, no switch-on is on record, or the approved gates are not all set, so automation
 * fails closed and the notice waits for a moderator.
 */
export async function getAutomaticEnforcementSince(): Promise<Date | null> {
  const { since } = await getAutomaticWithholdingWindow()
  if (!since || !(await getAutomaticWithholdingThresholds())) return null
  return since
}
