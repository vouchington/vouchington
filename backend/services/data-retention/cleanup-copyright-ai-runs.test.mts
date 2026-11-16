import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import {
  COPYRIGHT_AI_RUN_TABLES,
  createCopyrightCaseWithAiRunSubjects,
  insertTestCopyrightAiRun,
  readTestCopyrightAiRun,
} from '@voucha/test-helpers/copyright-ai-run-fixtures'
import { cleanupCopyrightAiRuns } from './cleanup-copyright-ai-runs.mts'

const NOW = new Date('2100-01-01T00:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const atAge = (days: number) => uuidv7({ msecs: NOW.getTime() - days * DAY_MS })

type RunTable = (typeof COPYRIGHT_AI_RUN_TABLES)[keyof typeof COPYRIGHT_AI_RUN_TABLES]

describe('copyright AI run retention', () => {
  it('deletes only owned runs older than the window, terminal or abandoned, from every run table', async () => {
    const { appealSubmissionId, counterNoticeSubmissionId } =
      await createCopyrightCaseWithAiRunSubjects()
    const intake = await createParsedCopyrightEmailIntake()
    const subjects: Array<[RunTable, string, string]> = [
      [COPYRIGHT_AI_RUN_TABLES.appeal, 'copyright_notice_submission_id', appealSubmissionId],
      [
        COPYRIGHT_AI_RUN_TABLES.guidance,
        'copyright_notice_submission_id',
        counterNoticeSubmissionId,
      ],
      [COPYRIGHT_AI_RUN_TABLES.email, 'copyright_notice_email_intake_receipt_id', intake.id],
    ]
    const owned: string[] = []
    const rows = subjects.map(([table, column, subjectId]) => ({
      table,
      column,
      subjectId,
      oldTerminal: atAge(200),
      oldActive: atAge(201),
      young: atAge(1),
      unowned: atAge(202),
    }))
    for (const row of rows) {
      owned.push(row.oldTerminal, row.oldActive, row.young)
      await insertTestCopyrightAiRun(row.table, row.column, row.subjectId, row.oldTerminal, true)
      await insertTestCopyrightAiRun(row.table, row.column, row.subjectId, row.young, true)
      await insertTestCopyrightAiRun(row.table, row.column, row.subjectId, row.unowned, true)
      await insertTestCopyrightAiRun(row.table, row.column, row.subjectId, row.oldActive, false)
    }

    const result = await cleanupCopyrightAiRuns({
      batchSize: 10,
      maxBatches: 2,
      retentionDays: 90,
      now: NOW,
      runIds: owned,
    })

    expect(result).toEqual({ deleted: 6, hasMore: false })
    for (const row of rows) {
      expect(await readTestCopyrightAiRun(row.table, row.oldTerminal)).toBeNull()
      expect(await readTestCopyrightAiRun(row.table, row.young)).toMatchObject({ status: 'failed' })
      // An abandoned active run goes with the terminal ones; an equally eligible unowned row stays.
      expect(await readTestCopyrightAiRun(row.table, row.oldActive)).toBeNull()
      expect(await readTestCopyrightAiRun(row.table, row.unowned)).toMatchObject({
        status: 'failed',
      })
    }
  })
})
