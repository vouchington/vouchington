import { describe, it, expect, beforeAll, onTestFinished, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { reportIntegrityWorkConfig } from '@services/report-integrity/work-limits'
import { reviewTestModerationReports } from '@voucha/test-helpers/entities/moderation-reports-review'
import {
  createTestUserDirect,
  insertTestModerationReport,
  insertTestModerationReportsForTarget,
  getTestReportIntegrityFlagsByUserId,
  createTestUser,
  insertTestPost,
  readEnqueuedJob,
} from '@voucha/test-helpers'
import { processReportIntegrityCheck, processBackfillReportIntegrity } from './report-integrity.mts'
import { MASS_REPORT_THRESHOLD } from '@services/report-integrity/config'
import type { PrivateUser } from '@services/users/types'
import {
  VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB,
  VOTE_AGGREGATION_REPORT_INTEGRITY_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { background } from '@queues/background/queues'
import type { ProcessReportIntegrityCheckData } from '@queues/vote-aggregation/enqueues/types-report-integrity'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'

describe('processReportIntegrityCheck', () => {
  const randomUsername = () => `test-ri-proc-${randomBytes(4).toString('hex')}`

  let targetUser: PrivateUser

  beforeAll(async () => {
    targetUser = await createTestUserDirect({ username: randomUsername() })
  }, 5_000)

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
  })

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
  })

  it('does not create a flag for an unknown entity type', async () => {
    // processReportIntegrityCheck should not throw but also not create a flag
    // because detectMassReportCampaign returns flagged=false for unknown types,
    // and createReportIntegrityFlag would throw 400 — the processor catches and re-throws
    await expect(
      processReportIntegrityCheck({ entityType: 'unknown_type', entityId: targetUser.id }),
    ).resolves.toBeUndefined()
  })
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
    const reportIds = await insertTestModerationReportsForTarget({
      reporterUserIds: reporterIds,
      entityType: 'post',
      entityId: postId,
    })

    const admissions: Array<ReturnType<typeof background.addBulk>> = []
    const addBulk = background.addBulk
    const admissionSpy = vi.spyOn(background, 'addBulk')
    onTestFinished(async () => {
      const settled = await Promise.allSettled(admissions)
      const errors: unknown[] = []
      for (const admission of settled) {
        if (admission.status === 'rejected') errors.push(admission.reason)
      }
      try {
        admissionSpy.mockRestore()
      } catch (err) {
        errors.push(err)
      }
      if (errors.length) throw new AggregateError(errors, 'Owned report admissions failed')
    }, 5_000)
    admissionSpy.mockImplementation((jobs, ...options) => {
      const admission = addBulk.call(background, jobs, ...options)
      if (
        jobs.some(
          job =>
            job.name === VOTE_AGGREGATION_REPORT_INTEGRITY_JOB.name &&
            (job.data as ProcessReportIntegrityCheckData).entityId === postId,
        )
      ) {
        admissions.push(admission)
      }
      return admission
    })

    const result = await processBackfillReportIntegrity({}, reportIds)
    expect(result.enqueued).toBeGreaterThanOrEqual(1)

    const jobs = (await Promise.all(admissions)).flat()
    const waiting = await Promise.all(
      jobs.flatMap(job => (job ? [readEnqueuedJob(background, { id: job.id })] : [])),
    )
    const found = waiting.find(
      j =>
        j.name === VOTE_AGGREGATION_REPORT_INTEGRITY_JOB.name &&
        (j.data as ProcessReportIntegrityCheckData).entityId === postId,
    )
    expect(found).toBeDefined()
    expect((found!.data as ProcessReportIntegrityCheckData).entityType).toBe('post')
  })
})

describe('processBackfillReportIntegrity pages', () => {
  it('ends a backfill scoped to no reports', async () => {
    expect(await processBackfillReportIntegrity({}, [])).toEqual({ enqueued: 0 })
  })

  it('continues from the last inspected report of a full page', async () => {
    const author = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `proc-backfill-ri-page-${randomBytes(4).toString('hex')}`,
      title: `Proc Backfill RI Page ${randomBytes(4).toString('hex')}`,
      markdown: 'body',
    })
    const reporterIds = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD }, () => createTestUser().then(u => u!.id)),
    )
    const reportIds = await insertTestModerationReportsForTarget({
      reporterUserIds: reporterIds,
      entityType: 'post',
      entityId: postId,
    })
    const restoreLimit = overrideDynamicConfigFieldsForTest(reportIntegrityWorkConfig, {
      backfill_batch_size: 1,
    })
    onTestFinished(restoreLimit)
    const addBulk = vi.spyOn(background, 'addBulk')
    const add = vi.spyOn(background, 'add')
    onTestFinished(() => {
      addBulk.mockRestore()
      add.mockRestore()
    })

    const result = await processBackfillReportIntegrity({}, reportIds)

    expect(result).toEqual({ enqueued: 1 })
    expect(add).toHaveBeenCalledWith(
      VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB.name,
      { afterReportId: reportIds.toSorted()[0], reportIds },
      expect.objectContaining({ jobId: `backfill_report_integrity__${reportIds.toSorted()[0]}` }),
    )
  })
})

describe('reviewed report pages', () => {
  it('continues an empty output page and reaches a later pending subject without admitting excluded reports', async () => {
    const reporter = await createTestUser()
    const targets = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    const reviewedIds = await insertTestModerationReportsForTarget({
      reporterUserIds: [reporter.id],
      entityType: 'user',
      entityId: targets[0]!.id,
    })
    await reviewTestModerationReports(reviewedIds)
    const pendingIds = await insertTestModerationReportsForTarget({
      reporterUserIds: [reporter.id],
      entityType: 'user',
      entityId: targets[1]!.id,
    })
    await insertTestModerationReportsForTarget({
      reporterUserIds: [reporter.id],
      entityType: 'user',
      entityId: targets[2]!.id,
    })
    const owned = [...reviewedIds, ...pendingIds]
    const restore = overrideDynamicConfigFieldsForTest(reportIntegrityWorkConfig, {
      backfill_batch_size: 1,
    })
    const add = vi.spyOn(background, 'add')
    const addBulk = vi.spyOn(background, 'addBulk')
    onTestFinished(() => {
      restore()
      add.mockRestore()
      addBulk.mockRestore()
    })
    expect(await processBackfillReportIntegrity({}, owned)).toEqual({ enqueued: 0 })
    expect(
      addBulk.mock.calls
        .flatMap(([jobs]) => jobs)
        .filter(
          job =>
            job.name === VOTE_AGGREGATION_REPORT_INTEGRITY_JOB.name &&
            (job.data as ProcessReportIntegrityCheckData).entityId === targets[0]!.id,
        ),
    ).toEqual([])
    expect(add).toHaveBeenCalledWith(
      VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB.name,
      { afterReportId: reviewedIds[0], reportIds: owned },
      expect.objectContaining({ jobId: `backfill_report_integrity__${reviewedIds[0]}` }),
    )
    expect(await processBackfillReportIntegrity({ afterReportId: reviewedIds[0] }, owned)).toEqual({
      enqueued: 1,
    })
    const admitted = addBulk.mock.calls
      .flatMap(([jobs]) => jobs)
      .filter(job => job.name === VOTE_AGGREGATION_REPORT_INTEGRITY_JOB.name)
    const subjectIds = admitted.map(job => (job.data as ProcessReportIntegrityCheckData).entityId)
    expect(subjectIds).toContain(targets[1]!.id)
    expect(subjectIds).not.toContain(targets[0]!.id)
    expect(subjectIds).not.toContain(targets[2]!.id)
    expect(await processBackfillReportIntegrity({ afterReportId: pendingIds[0] }, owned)).toEqual({
      enqueued: 0,
    })
  })
})

describe('report integrity worker failures', () => {
  it('reports and rethrows the same database error so the queue can retry', async () => {
    const data: ProcessReportIntegrityCheckData = {
      entityType: 'user',
      entityId: 'not-a-uuid',
    }

    const failure: unknown = await processReportIntegrityCheck(data).catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ code: '22P02' })
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === failure)).toBe(
      true,
    )
  })
})
