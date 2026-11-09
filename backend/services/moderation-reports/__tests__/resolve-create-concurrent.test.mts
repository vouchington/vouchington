import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { interceptPostgresTransactionsForTest } from '@voucha/test-helpers/injected-postgres-transactions'
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
})
