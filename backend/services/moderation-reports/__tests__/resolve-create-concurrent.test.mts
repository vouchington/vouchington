import { describe, expect, it } from 'vitest'
import { findOpenCaseForEntity } from '@services/moderation-cases'
import {
  beginTransaction,
  createTestUser,
  getTestPostgresBackendProcessId,
  insertTestModerationReport,
  insertTestPost,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { interceptPostgresTransactionsForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { getTestModerationReportCaseId } from '@voucha/test-helpers/entities/moderation-reports'
import { getTestModerationCaseById } from '@voucha/test-helpers/entities/moderation-case-reads'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { interceptPostgresTransactionQueriesForTest } from '@voucha/test-helpers/injected-transaction-queries'
import { getTestModerationReportClusters } from '@voucha/test-helpers/entities/moderation-report-clusters'
import { insertModerationReport } from '../create-insert.mts'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { getModerationReportById } from '../get-by-id.mts'
import { parseCreateModerationReportInput } from '../parse.mts'
import { resolveModerationReport } from '../resolve.mts'

describe('report creation during case resolution', () => {
  it.each(['new', 'duplicate'] as const)(
    'completes a %s report submission concurrent with resolution',
    async submission => {
      const [author, reporter, newReporter, moderator] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
        createTestUser({ extraRoles: ['moderator'] }),
      ])
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `case-resolution-${submission}-${crypto.randomUUID()}`,
        title: 'Concurrent report submission and resolution',
        markdown: 'body',
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
      })
      const input = parseCreateModerationReportInput({
        entityType: 'post',
        entityId: postId,
        reason: 'harassment',
        note: 'Concurrent submission',
      })
      const barrier = Promise.withResolvers<void>()
      const arrived = new Set<string>()
      const markers = ['/* createModerationReport */', '/* lockModerationCases */']
      const restore = interceptPostgresTransactionsForTest(
        transaction =>
          new Proxy(transaction, {
            async apply(target, thisArgument, args: Parameters<typeof transaction>) {
              const [statement] = args
              const text = typeof statement === 'string' ? statement : statement.text
              const marker = markers.find(candidate => text.includes(candidate))
              if (marker && !arrived.has(marker)) {
                arrived.add(marker)
                if (arrived.size === markers.length) barrier.resolve()
                await barrier.promise
              }
              return Reflect.apply(target, thisArgument, args)
            },
          }),
      )
      try {
        const [created, resolved] = await Promise.all([
          withCommittedPostgresTransactionForTest(query =>
            insertModerationReport(
              submission === 'new' ? newReporter.id : reporter.id,
              WEB_PROVENANCE,
              input,
              query,
            ),
          ).catch((err: unknown) => {
            barrier.resolve()
            throw err
          }),
          withCommittedPostgresTransactionForTest(query =>
            resolveModerationReport(
              reportId,
              {
                trainingEvidence: 'staff_or_user',
                resolvedById: moderator.id,
                status: 'reviewed',
              },
              { query },
            ),
          ).catch((err: unknown) => {
            barrier.resolve()
            throw err
          }),
        ])
        expect(arrived.size).toBe(markers.length)
        expect(resolved.id).toBe(reportId)
        expect((await getModerationReportById(reportId))?.status).toBe('reviewed')
        expect(created.report.reason).toBe('harassment')
        expect(submission === 'new' && created.isDuplicate).toBe(false)
        expect(created.report.id === reportId).toBe(created.isDuplicate)
        expect((await getModerationReportById(created.report.id))?.status).toBe(
          created.isDuplicate ? 'reviewed' : 'pending',
        )
        expect(
          (await getTestModerationReportClusters('post', postId)).map(row => row.resolution_action),
        ).toEqual(created.isDuplicate ? ['reviewed'] : [null, 'reviewed'])
      } finally {
        barrier.resolve()
        restore()
      }
    },
  )
  it.each(['report', 'resolution'] as const)(
    'commits the filing when %s commits first',
    async first => {
      const [author, reporter, newReporter, successorReporter] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `pending-case-${crypto.randomUUID()}`,
        title: 'Report on a closing case',
        markdown: 'body',
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
      })
      const original = (await findOpenCaseForEntity({ entityType: 'post', entityId: postId }))!
      const input = parseCreateModerationReportInput({
        entityType: 'post',
        entityId: postId,
        reason: 'harassment',
      })
      const fileReport = (reporterId: string) =>
        withCommittedPostgresTransactionForTest(query =>
          insertModerationReport(reporterId, WEB_PROVENANCE, input, query),
        )
      const resolveReport = () =>
        resolveModerationReport(reportId, {
          trainingEvidence: 'staff_or_user',
          resolvedById: null,
          status: 'reviewed',
        })

      let successor: Awaited<ReturnType<typeof fileReport>> | undefined
      const created = first === 'report' ? await fileBeforeClose() : await closeBeforeInsert()

      async function fileBeforeClose() {
        await using holder = await beginTransaction()
        const filed = await insertModerationReport(newReporter.id, WEB_PROVENANCE, input, holder)
        const holderProcessId = await getTestPostgresBackendProcessId(holder)
        await withTestOwnedPostgresWait(
          {
            holderProcessId,
            pool: 'write',
            lock: { kind: 'transaction' },
            queryMarker: 'lockModerationCases',
            releaseHolder: () => holder[Symbol.asyncDispose](),
          },
          async waitForLock => {
            const closing = resolveReport()
            void closing.catch(() => undefined)
            await waitForLock(closing)
            await holder.commit()
            await closing
          },
        )
        return filed
      }

      async function closeBeforeInsert() {
        const restore = interceptPostgresTransactionQueriesForTest(
          (statement, values) =>
            statement.includes('/* createModerationReport */') && values.includes(newReporter.id),
          async () => {
            await resolveReport()
            successor = await fileReport(successorReporter.id)
          },
        )
        try {
          return await fileReport(newReporter.id)
        } finally {
          restore()
        }
      }

      expect(created.report.case_id).toBe(original.id)
      expect((await getModerationReportById(reportId))?.status).toBe('reviewed')
      const openCase = await findOpenCaseForEntity({ entityType: 'post', entityId: postId })
      const expectedCaseId = first === 'report' ? original.id : successor?.report.case_id
      const resolvedAt = expect.any(Date)
      const expectedResolvedAt = first === 'report' ? null : resolvedAt
      expect(openCase?.id).toBe(expectedCaseId)
      expect(await getTestModerationCaseById(original.id)).toMatchObject({
        resolved_at: expectedResolvedAt,
        resolved_by_id: null,
      })
      const pendingIds = [created.report.id, ...(successor ? [successor.report.id] : [])]
      expect(pendingIds).toHaveLength(first === 'report' ? 1 : 2)
      const pending = await Promise.all(
        pendingIds.map(async id => {
          const [report, caseId] = await Promise.all([
            getModerationReportById(id),
            getTestModerationReportCaseId(id),
          ])
          return { status: report?.status, caseId }
        }),
      )
      const expectedPending = [{ status: 'pending', caseId: original.id }]
      if (successor) expectedPending.push({ status: 'pending', caseId: successor.report.case_id })
      expect(pending).toEqual(expectedPending)
    },
  )

  it('returns a conflict without retrying a deadlocked resolution', async () => {
    const [reporter, target] = await Promise.all([createTestUser(), createTestUser()])
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: target.id,
    })
    const deadlock = Object.assign(new Error('deadlock detected'), { code: '40P01' })
    let attempts = 0
    const restore = interceptPostgresTransactionQueriesForTest(
      (statement, values) =>
        statement.includes('/* resolveModerationReport */') && values.includes(reportId),
      async () => {
        attempts++
        throw deadlock
      },
    )
    try {
      await expect(
        resolveModerationReport(reportId, {
          trainingEvidence: 'staff_or_user',
          resolvedById: null,
          status: 'reviewed',
        }),
      ).rejects.toMatchObject({ status: 409, cause: deadlock })
    } finally {
      restore()
    }
    expect(attempts).toBe(1)
    expect((await getModerationReportById(reportId))?.status).toBe('pending')
  })
})
