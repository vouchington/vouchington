import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  createTestUserDirect,
  insertTestModerationReport,
  insertTestModerationReportsForTarget,
  getTestReportIntegrityFlagsByUserId,
  createTestUser,
  insertTestPost,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { processReportIntegrityCheck, processBackfillReportIntegrity } from './processors.mts'
import { MASS_REPORT_THRESHOLD } from '@services/report-integrity/config'
import type { PrivateUser } from '@services/users/types'
import { reportIntegrityQueue } from '@queues/report-integrity/queues'
import type { ProcessReportIntegrityCheckData } from '@queues/report-integrity/types'

describe('processReportIntegrityCheck', () => {
  const randomUsername = () => `test-ri-proc-${randomBytes(4).toString('hex')}`

  let targetUser: PrivateUser

  beforeAll(async () => {
    targetUser = await createTestUserDirect({ username: randomUsername() })
  }, 60_000)

  it('creates a report_integrity_flags row when reporter count meets threshold', async () => {
    const freshTarget = await createTestUserDirect({ username: randomUsername() })

    // Seed exactly MASS_REPORT_THRESHOLD reports from distinct users
    for (let i = 0; i < MASS_REPORT_THRESHOLD; i++) {
      const reporter = await createTestUserDirect({ username: randomUsername() })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'user',
        entityId: freshTarget.id,
      })
    }

    await processReportIntegrityCheck({ entityType: 'user', entityId: freshTarget.id })

    const flags = await getTestReportIntegrityFlagsByUserId(freshTarget.id)
    expect(flags.length).toBeGreaterThanOrEqual(1)
    expect(flags[0]!.flag_type).toBe('mass_report_suspected')
    expect(flags[0]!.reported_user_id).toBe(freshTarget.id)
  }, 60_000)

  it('does not create a flag when reporter count is below threshold', async () => {
    const freshTarget = await createTestUserDirect({ username: randomUsername() })
    const count = MASS_REPORT_THRESHOLD - 1

    for (let i = 0; i < count; i++) {
      const reporter = await createTestUserDirect({ username: randomUsername() })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'user',
        entityId: freshTarget.id,
      })
    }

    await processReportIntegrityCheck({ entityType: 'user', entityId: freshTarget.id })

    const flags = await getTestReportIntegrityFlagsByUserId(freshTarget.id)
    expect(flags).toHaveLength(0)
  }, 60_000)

  it('does not create a flag for an unknown entity type', async () => {
    // processReportIntegrityCheck should not throw but also not create a flag
    // because detectMassReportCampaign returns flagged=false for unknown types,
    // and createReportIntegrityFlag would throw 400 — the processor catches and re-throws
    await expect(
      processReportIntegrityCheck({ entityType: 'unknown_type', entityId: targetUser.id }),
    ).resolves.toBeUndefined()
  }, 60_000)
})

describe('processBackfillReportIntegrity', () => {
  it('enqueues a processReportIntegrityCheck job for an entity with pending reports', async () => {
    const author = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `proc-backfill-ri-${randomBytes(4).toString('hex')}`,
      title: `Proc Backfill RI Post ${randomBytes(4).toString('hex')}`,
      markdown: 'body',
    })
    const reporterIds = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD }, () => createTestUser().then(u => u!.id)),
    )
    await insertTestModerationReportsForTarget({
      reporterUserIds: reporterIds,
      entityType: 'post',
      entityId: postId,
    })

    const result = await processBackfillReportIntegrity()
    expect(result.enqueued).toBeGreaterThanOrEqual(1)

    const waiting = await readAllQueueJobs(reportIntegrityQueue)
    const found = waiting.find(
      j =>
        j.name === 'processReportIntegrityCheck' &&
        (j.data as ProcessReportIntegrityCheckData).entityId === postId,
    )
    expect(found).toBeDefined()
    expect((found!.data as ProcessReportIntegrityCheckData).entityType).toBe('post')
  }, 60_000)
})

describe('workers.mts module', () => {
  it('exports a reportIntegrity Worker instance', async () => {
    const { reportIntegrity } = await import('./workers.mts')
    expect(reportIntegrity).toBeDefined()
    // Close the worker connection to avoid test teardown leaks
    await reportIntegrity.close()
  }, 60_000)
})
