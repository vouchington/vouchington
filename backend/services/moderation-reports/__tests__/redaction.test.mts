import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestCommunity,
  reviewPendingTestModerationReportsByPostSlugPrefixes,
  insertTestSystemModerationReport,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { listRedactedModerationReports } from '../redaction.mts'
import { insertReportJudgement } from '../judgements.mts'
import crypto from 'node:crypto'

describe('moderation-reports/redaction', () => {
  let releaseLock: () => Promise<void>
  beforeAll(async () => {
    const lock = await acquireReportPaginationTestLock()
    releaseLock = () => lock.release()
  })
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    author = await createTestUser()
    reporter = await createTestUser()
  })
  afterAll(() => releaseLock())

  describe('listRedactedModerationReports', () => {
    it('omits reporter identity fields for non-staff viewers', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `redaction-test-${crypto.randomUUID().slice(0, 8)}`,
        title: `Redaction Test Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        note: 'spam note',
      })

      const { reports } = await listRedactedModerationReports({ limit: 100 })
      expect(reports.length).toBeGreaterThan(0)
      for (const report of reports) {
        expect(report).not.toHaveProperty('reporter_user_id')
        expect(report).not.toHaveProperty('reporter_username')
        expect(report).not.toHaveProperty('note')
        expect(report).not.toHaveProperty('resolved_by_id')
        expect(report).not.toHaveProperty('admin_action_path')
        expect(report).not.toHaveProperty('target_is_restricted')
      }
    })

    it('masks target_label and target_path for private community posts', async () => {
      await reviewPendingTestModerationReportsByPostSlugPrefixes(['private-comm-redact-post-'])
      const community = await insertTestCommunity({
        createdById: author.id,
        name: `Private Redact Community ${crypto.randomUUID().slice(0, 8)}`,
        slug: `private-redact-comm-${crypto.randomUUID().slice(0, 8)}`,
        visibility: 'private',
      })
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `private-comm-redact-post-${crypto.randomUUID().slice(0, 8)}`,
        title: `Private Community Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'private community body',
        communityId: community.id,
      })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt: new Date(Date.UTC(5000, 1, 1)),
      })

      const { reports } = await listRedactedModerationReports({
        limit: 1000,
        sort: 'created_at_desc',
      })
      const found = reports.find(r => r.entity_id === postId)
      expect(found!.target_label).toBe('[Private content]')
      expect(found!.target_path).toBeNull()
      expect(found!.target_content).toBeNull()
    })

    it('masks target_label and target_path for followers-only posts', async () => {
      await reviewPendingTestModerationReportsByPostSlugPrefixes(['followers-only-redact-'])
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `followers-only-redact-${crypto.randomUUID().slice(0, 8)}`,
        title: `Followers Only Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'followers only body',
        broadcast: 'followers',
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'harassment',
        createdAt: new Date(Date.UTC(5000, 1, 2)),
      })
      await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        triggeringReportId: reportId,
        rerunById: null,
        recommendedAction: 'remove',
        publicResponse: 'Leaky public response.',
        internalResponse: 'internal',
        model: 'test-model',
      })

      const { reports } = await listRedactedModerationReports({
        limit: 1000,
        sort: 'created_at_desc',
      })
      const found = reports.find(r => r.entity_id === postId)
      expect(found).toBeDefined()
      expect(found!.target_label).toBe('[Private content]')
      expect(found!.target_path).toBeNull()
      expect(found!.target_content).toBeNull()
      expect(found).not.toHaveProperty('judgement')
      expect(found!.post_moderation_context).toBeNull()
    })

    it('supports sort asc', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `redaction-sort-asc-${crypto.randomUUID().slice(0, 8)}`,
        title: `Redaction Sort Asc Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
      })

      const { reports } = await listRedactedModerationReports({
        limit: 100,
        sort: 'created_at_asc',
      })
      expect(reports.length).toBeGreaterThan(0)
    })

    it('paginates with a cursor under sort asc', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `redaction-asc-cursor-${crypto.randomUUID().slice(0, 8)}`,
        title: `Redaction Asc Cursor Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
      })

      const firstPage = await listRedactedModerationReports({ limit: 1, sort: 'created_at_asc' })
      expect(firstPage.reports.length).toBe(1)
      const cursorRow = firstPage.reports[0]!
      const nextPage = await listRedactedModerationReports({
        limit: 1,
        sort: 'created_at_asc',
        beforeCursor: { id: cursorRow.id },
      })
      expect(Array.isArray(nextPage.reports)).toBe(true)
      for (const r of nextPage.reports) {
        expect(r.id).not.toBe(cursorRow.id)
      }
    })

    it('filters by status', async () => {
      const { reports } = await listRedactedModerationReports({
        limit: 100,
        status: 'reviewed',
      })
      expect(Array.isArray(reports)).toBe(true)
      for (const r of reports) {
        expect(r.status).toBe('reviewed')
      }
    })

    it('never exposes the AI judgement to non-staff viewers (staff-only)', async () => {
      await reviewPendingTestModerationReportsByPostSlugPrefixes(['redacted-judgement-'])
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `redacted-judgement-${crypto.randomUUID().slice(0, 8)}`,
        title: `Redacted Judgement Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt: new Date(Date.UTC(5000, 2, 3)),
      })
      await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        triggeringReportId: reportId,
        rerunById: null,
        recommendedAction: 'remove',
        publicResponse: 'Public: removed.',
        internalResponse: 'Internal: policy violation.',
        model: 'test-model',
      })

      const { reports } = await listRedactedModerationReports({
        limit: 1000,
        sort: 'created_at_desc',
      })
      const found = reports.find(r => r.entity_id === postId)
      expect(found).toBeDefined()
      // The judgement's public_response is LLM-derived from reporter notes → staff-only.
      expect(found).not.toHaveProperty('judgement')
    })

    it('excludes system-generated reports (ban-evasion detector) from non-staff list', async () => {
      const target = await createTestUser()
      await insertTestSystemModerationReport('user', target.id, 'Suspected ban evasion')
      const { reports } = await listRedactedModerationReports({ limit: 100 })
      expect(reports.find(r => r.entity_id === target.id)).toBeUndefined()
    })

    it('returns hasNextPage when more results exist', async () => {
      for (let i = 0; i < 2; i++) {
        const pid = await insertTestPost({
          createdById: author.id,
          slug: `redaction-hasnext-${i}-${crypto.randomUUID().slice(0, 8)}`,
          title: `Redaction HasNext ${i} ${crypto.randomUUID().slice(0, 8)}`,
          markdown: 'body',
        })
        const r = await createTestUser()
        await insertTestModerationReport({
          reporterUserId: r.id,
          entityType: 'post',
          entityId: pid,
          reason: 'spam',
        })
      }

      const { hasNextPage } = await listRedactedModerationReports({ limit: 1 })
      expect(hasNextPage).toBe(true)
    })
  })
})
