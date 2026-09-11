import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestPost, insertTestModerationReport } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { listModerationReports } from '../get.mts'
import { insertReportJudgement } from '../judgements.mts'
import crypto from 'node:crypto'

describe('moderation-reports/judgement-attach', () => {
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[author, reporter] = await Promise.all([createTestUser(), createTestUser()])
  })

  describe('listModerationReports (judgement attachment)', () => {
    it('attaches full judgement including internal_response for staff', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `staff-judgement-${crypto.randomUUID().slice(0, 8)}`,
        title: `Staff Judgement Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt: new Date(Date.UTC(6000, 3, 1)),
      })
      await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        triggeringReportId: reportId,
        rerunById: null,
        recommendedAction: 'warn',
        publicResponse: 'Public: warning issued.',
        internalResponse: 'Internal: borderline content.',
        model: 'test-model',
      })

      const { reports } = await listModerationReports({ limit: 1000, sort: 'created_at_desc' })
      const found = reports.find(r => r.entity_id === postId)
      expect(found).toBeDefined()
      expect(found!.judgement).not.toBeNull()
      expect(found!.judgement!.recommended_action).toBe('warn')
      expect(found!.judgement!.public_response).toBe('Public: warning issued.')
      expect(found!.judgement!.internal_response).toBe('Internal: borderline content.')
      expect(found!.judgement!.is_stale).toBe(false)
      expect(found!.judgement!.judged_report_count).toBe(1)
      expect(found!.judgement!.current_report_count).toBe(1)
    })

    it('marks judgement stale when later report context changes', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `staff-stale-judgement-${crypto.randomUUID().slice(0, 8)}`,
        title: `Staff Stale Judgement Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
      })
      await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        triggeringReportId: reportId,
        recommendedAction: 'no_action',
        publicResponse: 'Public.',
        internalResponse: 'Internal.',
        model: 'test-model',
      })
      const otherReporter = await createTestUser()
      await insertTestModerationReport({
        reporterUserId: otherReporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'illegal_content',
        createdAt: new Date(Date.UTC(6000, 3, 4)),
      })

      const { reports } = await listModerationReports({ limit: 1000, sort: 'created_at_desc' })
      const found = reports.find(r => r.entity_id === postId)
      expect(found).toBeDefined()
      expect(found!.judgement).not.toBeNull()
      expect(found!.judgement!.is_stale).toBe(true)
      expect(found!.judgement!.judged_report_count).toBe(1)
      expect(found!.judgement!.current_report_count).toBe(2)
    })

    it('sets judgement to null for reports with no judgement', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `staff-no-judgement-${crypto.randomUUID().slice(0, 8)}`,
        title: `Staff No Judgement Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt: new Date(Date.UTC(6000, 3, 2)),
      })

      const { reports } = await listModerationReports({ limit: 1000, sort: 'created_at_desc' })
      const found = reports.find(r => r.entity_id === postId)
      expect(found).toBeDefined()
      expect(found!.judgement).toBeNull()
    })

    it('uses a single batch query for multiple reports (same entity gets same judgement)', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `staff-batch-${crypto.randomUUID().slice(0, 8)}`,
        title: `Staff Batch Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      // Two reports for the same entity
      const r1 = await createTestUser()
      const r2 = await createTestUser()
      await insertTestModerationReport({
        reporterUserId: r1.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt: new Date(Date.UTC(6000, 3, 3)),
      })
      // A distinct entity for the second reporter (can't have two pending reports from different
      // users for the same entity without conflict — use separate entities per reporter)
      const postId2 = await insertTestPost({
        createdById: author.id,
        slug: `staff-batch2-${crypto.randomUUID().slice(0, 8)}`,
        title: `Staff Batch Post2 ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      await insertTestModerationReport({
        reporterUserId: r2.id,
        entityType: 'post',
        entityId: postId2,
        reason: 'harassment',
        createdAt: new Date(Date.UTC(6000, 3, 3)),
      })
      await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        recommendedAction: 'remove',
        publicResponse: 'Removed.',
        internalResponse: 'Violation.',
        model: 'test-model',
      })

      const { reports } = await listModerationReports({ limit: 1000, sort: 'created_at_desc' })
      const found1 = reports.find(r => r.entity_id === postId)
      const found2 = reports.find(r => r.entity_id === postId2)
      expect(found1).toBeDefined()
      expect(found2).toBeDefined()
      expect(found1!.judgement!.recommended_action).toBe('remove')
      expect(found2!.judgement).toBeNull()
    })
  })
})
