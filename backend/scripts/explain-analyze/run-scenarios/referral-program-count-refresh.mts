import assert from 'node:assert/strict'
import { read, write } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const SCENARIO_ID = 'mv-referral-program-link-counts-refresh'
const VIEW_NAME = 'mv_referral_program_link_counts'

export async function runReferralProgramCountRefreshScenario(): Promise<void> {
  // The owner chose an exact all-time count. These source cardinalities make the intended
  // one-pass cost explicit without pretending refresh work is capped by a recent window.
  const { rows: counts } = await write<{
    program_rows: number | string
    link_rows: number | string
  }>(`/* countReferralProgramRefreshSources */
    SELECT
      (SELECT COUNT(*) FROM referral_program_topics) AS program_rows,
      (SELECT COUNT(*) FROM user_referral_program_links) AS link_rows`)
  const programRows = Number(counts[0]?.program_rows)
  const linkRows = Number(counts[0]?.link_rows)
  assert.ok(Number.isSafeInteger(programRows) && programRows > 0)
  assert.ok(Number.isSafeInteger(linkRows) && linkRows > 0)

  registerScenarioContract(SCENARIO_ID, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'referral_program_topics', max: programRows + 1 },
      { kind: 'maxProcessedRows', relation: 'user_referral_program_links', max: linkRows + 1 },
    ],
    seededRows: {
      referral_program_topics: programRows,
      user_referral_program_links: linkRows,
    },
  })

  const { rows } = await read<{ definition: string }>(
    '/* explainReferralProgramCountDefinition */ SELECT pg_get_viewdef($1::regclass) AS definition',
    [VIEW_NAME],
  )
  const definition = rows[0]?.definition
  if (!definition) throw new Error(`Missing materialized view ${VIEW_NAME}`)
  await runAndCapture(SCENARIO_ID, async () => {
    const result = await read(`/* ${SCENARIO_ID} */ ${definition}`)
    assert.ok(result.rows.length > 0, 'Referral program count fixture must populate the view')
  })
}
