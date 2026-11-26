import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { copyrightConfig } from '@services/copyright-notices/config'
import { searchPendingCopyrightEnforcementAssessmentIds } from '@services/copyright-notices/enforcement-pending'
import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightPendingEnforcement } from '../seed-data/copyright-pending-enforcement.mts'

const operation = 'searchPendingCopyrightEnforcementAssessmentIds'

export async function runCopyrightPendingEnforcementScenarios() {
  const { batchSize: limit } = getCopyrightSweepLimits('enforcement')
  assert.equal(limit, 100)
  await copyrightConfig.waitForInitialization()
  const fixture = await seedCopyrightPendingEnforcement(2 * limit + 1)
  const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
    automaticProvisionalWithholding: true,
    automaticProvisionalWithholdingSince: fixture.since.toISOString(),
    automaticWithholdingMinTrustTier: 2,
    automaticWithholdingMinAccountAgeDays: 7,
    automaticWithholdingClaimantDailyCap: 5,
    automaticWithholdingPosterDailyCap: 3,
  })
  try {
    await write(`/* analyzeCopyrightPendingEnforcement */
      ANALYZE copyright_notices, copyright_notice_submissions, copyright_notice_targets,
        copyright_notice_target_images, copyright_notice_form_intakes, copyright_notice_form_screenings,
        copyright_notice_form_screening_attempts, copyright_notice_delivery_work_items,
        copyright_notice_delivery_recipients`)
    const cursor: { after?: string } = {}
    for (const [index, suffix] of ['first', 'continuation'].entries()) {
      const expected = fixture.pendingIds.slice(index * limit, (index + 1) * limit)
      const scenario = `copyright-pending-enforcement-${suffix}`
      registerScenarioContract(scenario, {
        seededRows: fixture.seededRows,
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT' },
          // The first page crosses all three decoy populations.
          // Follow-up in https://github.com/vouchington/vouchington/issues/6374#issuecomment-7189051625
          {
            kind: 'maxProcessedRows',
            relation: 'copyright_notice_submissions',
            max: index === 0 ? 1601 : 101,
          },
          { kind: 'maxInputRows', nodeType: 'Sort', max: 0 },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          const page = await searchPendingCopyrightEnforcementAssessmentIds({
            after: cursor.after,
            limit,
          })
          assert.deepEqual(page, {
            results: expected,
            page_info: {
              has_next_page: true,
              start_cursor: encodeCursor({ id: expected[0]! }),
              end_cursor: encodeCursor({ id: expected.at(-1)! }),
            },
          })
          cursor.after = page.page_info.end_cursor!
        },
        suffix,
        operation,
        { exactCapturedNames: [operation] },
      )
    }
  } finally {
    restore()
    await fixture.cleanup()
  }
}
