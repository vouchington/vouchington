import assert from 'node:assert/strict'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { deleteChildPage } from '@services/copyright-notices/operational-retention-email-intake-operations'
import { DEFAULT_DATA_RETENTION_CONFIG } from '@services/data-retention/config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  attachmentPageSize,
  attachmentRelation,
  cleanupCopyrightUnlinkedEmailRetention,
  emailChildDeleteSetting,
  enableEmailChildDelete,
  seedCopyrightUnlinkedEmailRetention,
  targetAttachments,
  targetIntake,
  unrelatedAttachments,
} from './copyright-unlinked-email-retention-fixture.mts'

const marker = 'deleteUnlinkedCopyrightEmailIntakeChildPage'

export async function runCopyrightUnlinkedEmailRetentionScenario(): Promise<void> {
  const scenario = 'copyright-unlinked-email-intake-attachment-retention-at-cap'
  await seedCopyrightUnlinkedEmailRetention()
  try {
    await write(`/* analyzeCopyrightUnlinkedEmailRetention */ ANALYZE ${attachmentRelation}`)
    const { rows } = await write<{ count: number }>(
      `/* countCopyrightUnlinkedEmailRetention */ SELECT COUNT(*)::int AS count FROM ${attachmentRelation}`,
    )
    registerScenarioContract(scenario, {
      allowEmptyResult: true, // The DELETE has no RETURNING clause.
      seededRows: { [attachmentRelation]: rows[0]!.count },
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_copyright_notice_email_intake_attachments__intake'] },
        // The receipt index finds one page and the DELETE visits the same TIDs once.
        { kind: 'maxProcessedRows', relation: attachmentRelation, max: attachmentPageSize * 2 },
      ],
    })
    await using query = await beginTransaction()
    await query(enableEmailChildDelete)
    await runAndCapture(
      scenario,
      async () => {
        assert.equal(
          await deleteChildPage(query, targetIntake, attachmentPageSize, attachmentRelation),
          attachmentPageSize,
        )
      },
      undefined,
      marker,
      {
        exactCapturedNames: [marker],
        localSettings: { [emailChildDeleteSetting]: 'on' },
        afterCapture: async () => {
          await checkSurvivors(query, [targetAttachments.at(-1)!, ...unrelatedAttachments])
          assert.equal(
            await deleteChildPage(
              query,
              targetIntake,
              DEFAULT_DATA_RETENTION_CONFIG.batch_size,
              attachmentRelation,
            ),
            1,
          )
          await checkSurvivors(query, unrelatedAttachments)
          assert.equal(
            await deleteChildPage(
              query,
              targetIntake,
              DEFAULT_DATA_RETENTION_CONFIG.batch_size,
              attachmentRelation,
            ),
            0,
          )
          // Both plan modes replay from the original attachment cohort.
          await query.rollback()
        },
      },
    )
  } finally {
    await cleanupCopyrightUnlinkedEmailRetention()
  }
}

async function checkSurvivors(query: TransactionQuery, expected: string[]): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `/* checkCopyrightUnlinkedEmailRetentionSurvivors */
     SELECT id FROM ${attachmentRelation} WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [[...targetAttachments, ...unrelatedAttachments]],
  )
  assert.deepEqual(
    rows.map(row => row.id),
    expected,
  )
}
