import assert from 'node:assert/strict'
import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '@services/copyright-notices/read-models-staff'
import {
  copyrightStaffQueueParser,
  listCopyrightStaffQueuePage,
} from '@services/copyright-notices/staff-queue-page'
import { ANCILLARY_SEED_ROW_UPPER_BOUND } from '../plan-ancillary-seeded-rows.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  analyzeCopyrightStaffCaseQueue,
  seedCopyrightStaffCaseQueue,
  STAFF_CASE_CLOCK,
  STAFF_CASE_CONTACT,
  STAFF_CASE_ESCALATION,
  STAFF_CASE_MISSED,
  STAFF_CASE_OPEN,
  STAFF_CASE_ROWS,
} from '../seed-data/copyright-staff-case-queue.mts'

const pageSize = 100
const operation = 'listPendingCopyrightStaffCases'

export async function runCopyrightStaffCaseQueueScenarios(): Promise<void> {
  const fixture = await seedCopyrightStaffCaseQueue()
  try {
    await analyzeCopyrightStaffCaseQueue()
    const moderator = { ...seedUser, roles: ['moderator'] }
    const cursorFor = (index: number) =>
      encodeScopedTierPreciseUuidCursor(
        STAFF_CASE_ESCALATION,
        index < STAFF_CASE_MISSED ? 1 : 3,
        fixture.open[index]!,
        copyrightStaffQueueCursorScope,
      )
    const initial = copyrightStaffQueueParser.parse({})
    assert.equal(initial.limit, pageSize)
    const cursor: { after?: string } = {}
    for (const [index, suffix] of ['first', 'continuation'].entries()) {
      const offset = index * pageSize
      const scenario = `copyright-staff-case-queue-${suffix}`
      registerScenarioContract(scenario, {
        seededRows: {
          copyright_notice_deadlines: STAFF_CASE_ROWS,
          copyright_notice_counter_notice_reviews: STAFF_CASE_ROWS,
          copyright_notice_form_intakes: STAFF_CASE_OPEN,
          copyright_notice_appeal_reviews: ANCILLARY_SEED_ROW_UPPER_BOUND,
          copyright_notice_legal_hold_assessments: ANCILLARY_SEED_ROW_UPPER_BOUND,
          copyright_notice_legal_hold_resolutions: ANCILLARY_SEED_ROW_UPPER_BOUND,
          copyright_notice_delivery_work_items: ANCILLARY_SEED_ROW_UPPER_BOUND,
          copyright_notice_action_work_items: ANCILLARY_SEED_ROW_UPPER_BOUND,
          copyright_staydown_matches: ANCILLARY_SEED_ROW_UPPER_BOUND,
          copyright_staydown_entries: ANCILLARY_SEED_ROW_UPPER_BOUND,
          copyright_territorial_notice_receipts: ANCILLARY_SEED_ROW_UPPER_BOUND,
          copyright_territorial_redress_requests: ANCILLARY_SEED_ROW_UPPER_BOUND,
        },
        expectations: [
          { kind: 'queryBinds', token: 'LIMIT' },
          // The later main-2 fixture includes recovery history on the continuation. See #6616.
          {
            kind: 'maxProcessedRows',
            relation: 'copyright_notice_submissions',
            max: index === 0 ? 83_386 : 96_390,
          },
          { kind: 'maxProcessedRows', relation: 'copyright_notice_deadlines', max: 2_406 },
          { kind: 'maxInputRows', nodeType: 'Sort', max: 11_011 },
        ],
      })
      await runAndCapture(
        scenario,
        async () => {
          const args =
            index === 0 ? initial : copyrightStaffQueueParser.parse({ after: cursor.after })
          const page = await listCopyrightStaffQueuePage(moderator, args, { now: STAFF_CASE_CLOCK })
          assert.deepEqual(
            page.copyright_notices.map(({ id, reasons, claimant }) => ({
              id,
              reasons,
              contact: claimant.contact,
            })),
            fixture.open.slice(offset, offset + pageSize).map((id, position) => ({
              id,
              reasons: [
                offset + position < STAFF_CASE_MISSED ? 'deadline_missed' : 'deadline_due',
                'form_intake_review',
              ],
              contact: STAFF_CASE_CONTACT,
            })),
          )
          assert.deepEqual(page.page_info, {
            has_next_page: true,
            start_cursor: cursorFor(offset),
            end_cursor: cursorFor(offset + pageSize - 1),
          })
          cursor.after = page.page_info.end_cursor ?? undefined
        },
        suffix,
        operation,
      )
    }
  } finally {
    await fixture.cleanup()
  }
}
