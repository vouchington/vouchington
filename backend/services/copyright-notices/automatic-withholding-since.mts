import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getAutomaticWithholdingThresholds,
  isAutomaticProvisionalWithholdingEnabled,
} from './config.mts'

/**
 * The live switch plus the start of its current on-period. `since` is null while the switch is off,
 * or on with no audited off-to-on change on record, and automation then fails closed.
 */
export type AutomaticWithholdingWindow = { enabled: boolean; since: Date | null }

/**
 * When the switch last went from off to on, read from the audited config change log, or null when
 * no such change is on record. The audit row commits just before the new value is published, so the
 * time is a hair early and a notice received after the flip is never mistaken for a stale one.
 */
export async function findSwitchOnTime(configKey: string = 'copyright'): Promise<Date | null> {
  const { rows } = await write<{
    switched_on_at: Date | null
  }>(sql`/* findAutomaticWithholdingSwitchOnTime */
    SELECT uuid_extract_timestamp(id) AS switched_on_at
    FROM dynamic_configuration_revisions
    WHERE configuration_key = ${configKey}
      AND changes #> '{automaticProvisionalWithholding,after}' = 'true'::jsonb
      AND changes #> '{automaticProvisionalWithholding,before}' IS DISTINCT FROM 'true'::jsonb
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0]?.switched_on_at ?? null
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
