import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { deleteExpiredCopyrightGuestCapabilities } from '@services/copyright-notices/operational-retention-guest-capabilities'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedCopyrightGuestRetentionFixtures } from '../seed-data/copyright-guest-retention.mts'

// The scheduled copyright sweep uses the shared retention batch_size default.
const PAGE_SIZE = 500
const SCENARIO_ID = 'copyright-expired-guest-capabilities-at-cap'
const DELETE_MARKER = 'deleteExpiredCopyrightGuestCapabilities'

export async function runCopyrightGuestRetentionScenario(): Promise<void> {
  const fixture = await seedCopyrightGuestRetentionFixtures(PAGE_SIZE)
  try {
    assert.equal(fixture.firstPageIds.length, PAGE_SIZE)
    const expiredIds = new Set(fixture.expiredIds)
    const expectedSurvivors = fixture.allIds.filter(id => !expiredIds.has(id)).toSorted()
    for (const id of [fixture.unexpiredId, fixture.protectedId, fixture.nextPageId]) {
      assert(expectedSurvivors.includes(id))
    }
    registerScenarioContract(SCENARIO_ID, {
      seededRows: {
        copyright_notice_guest_capabilities: fixture.seededRows.capabilities,
        copyright_notice_submissions: fixture.seededRows.submissions,
      },
      expectations: [{ kind: 'queryBinds', token: 'ANY' }],
    })
    await runAndCapture(
      SCENARIO_ID,
      async () => {
        await using transaction = await beginTransaction()
        await transaction(`/* enableCopyrightOperationalRetention */
          SET LOCAL app.copyright_operational_retention = 'on'`)
        assert.equal(
          await deleteExpiredCopyrightGuestCapabilities(
            transaction,
            fixture.firstPageIds,
            fixture.cutoff,
          ),
          expiredIds.size,
        )
        const { rows: survivors } = await transaction<{ id: string }>(
          `/* readCopyrightGuestRetentionSurvivors */ SELECT id
           FROM copyright_notice_guest_capabilities WHERE id = ANY($1::uuid[]) ORDER BY id`,
          [fixture.allIds],
        )
        assert.deepEqual(
          survivors.map(row => row.id),
          expectedSurvivors,
        )
        const { rows: submissions } = await transaction<{ id: string }>(
          `/* readCopyrightGuestRetentionProtectedSubmission */ SELECT id
           FROM copyright_notice_submissions WHERE id = $1::uuid
             AND copyright_notice_guest_capability_id = $2::uuid`,
          [fixture.protectedSubmissionId, fixture.protectedId],
        )
        assert.deepEqual(submissions, [{ id: fixture.protectedSubmissionId }])
        const { rows: activities } = await transaction<{ noticeId: string; lastActivityAt: Date }>(
          `/* readCopyrightGuestRetentionActivities */
           SELECT copyright_notice_id AS "noticeId", last_activity_at AS "lastActivityAt"
           FROM copyright_notice_thread_retention_activities
           WHERE copyright_notice_id = ANY($1::uuid[]) ORDER BY copyright_notice_id`,
          [fixture.noticeIds],
        )
        assert.deepEqual(
          activities,
          fixture.expectedActivities.toSorted((a, b) => a.noticeId.localeCompare(b.noticeId)),
        )
        await transaction.rollback()
      },
      undefined,
      DELETE_MARKER,
      { localSettings: { 'app.copyright_operational_retention': 'on' } },
    )
  } finally {
    await fixture.cleanup()
  }
}
