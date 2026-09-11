import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestPost, insertTestModerationReport } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  insertReportJudgement,
  getLatestJudgementForEntity,
  getLatestJudgementsForEntitiesBatch,
} from '../judgements.mts'
import { getAllReportsForEntity } from '../judgement-reports.mts'
import crypto from 'node:crypto'

describe('moderation-reports/judgements', () => {
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[author, reporter] = await Promise.all([createTestUser(), createTestUser()])
  })

  describe('insertReportJudgement', () => {
    it('inserts a judgement and returns the row', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `judgement-insert-${crypto.randomUUID().slice(0, 8)}`,
        title: `Judgement Insert Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
      })

      const judgement = await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        triggeringReportId: reportId,
        rerunById: null,
        recommendedAction: 'no_action',
        publicResponse: 'No violation found.',
        internalResponse: 'Content is fine.',
        model: 'gpt-5.4-nano',
      })

      expect(judgement.id).toEqual(expect.any(String))
      expect(judgement.entity_type).toBe('post')
      expect(judgement.entity_id).toBe(postId)
      expect(judgement.triggering_report_id).toBe(reportId)
      expect(judgement.rerun_by_id).toBeNull()
      expect(judgement.recommended_action).toBe('no_action')
      expect(judgement.public_response).toBe('No violation found.')
      expect(judgement.internal_response).toBe('Content is fine.')
      expect(judgement.model).toBe('gpt-5.4-nano')
      expect(judgement.context_hash).toEqual(expect.any(String))
      expect(judgement.context_report_count).toBe(1)
      expect(judgement.context_note_hash).toEqual(expect.any(String))
      expect(judgement.context_max_reason_rank).toBe(2)
      expect(judgement.created_at).toBeInstanceOf(Date)
    })

    it('accepts null triggering_report_id and sets rerun_by_id', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `judgement-rerun-${crypto.randomUUID().slice(0, 8)}`,
        title: `Judgement Rerun Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })

      const judgement = await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        triggeringReportId: null,
        rerunById: author.id,
        recommendedAction: 'warn',
        publicResponse: 'Warning issued.',
        internalResponse: 'Borderline content.',
        model: 'gpt-5.4-nano',
      })

      expect(judgement.triggering_report_id).toBeNull()
      expect(judgement.rerun_by_id).toBe(author.id)
      expect(judgement.recommended_action).toBe('warn')
    })
  })

  describe('getLatestJudgementForEntity', () => {
    it('returns null when no judgements exist for an entity', async () => {
      const result = await getLatestJudgementForEntity('post', crypto.randomUUID())
      expect(result).toBeNull()
    })

    it('returns the latest judgement for an entity (most recent wins)', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `judgement-latest-${crypto.randomUUID().slice(0, 8)}`,
        title: `Judgement Latest Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })

      // Insert two judgements
      await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        triggeringReportId: null,
        rerunById: null,
        recommendedAction: 'no_action',
        publicResponse: 'First judgement.',
        internalResponse: 'First internal.',
        model: 'gpt-5.4-nano',
      })

      const second = await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        triggeringReportId: null,
        rerunById: author.id,
        recommendedAction: 'remove',
        publicResponse: 'Second judgement.',
        internalResponse: 'Second internal.',
        model: 'gpt-5.4-nano',
      })

      const result = await getLatestJudgementForEntity('post', postId)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(second.id)
      expect(result!.recommended_action).toBe('remove')
    })
  })

  describe('getLatestJudgementsForEntitiesBatch', () => {
    it('returns empty map for empty input', async () => {
      const result = await getLatestJudgementsForEntitiesBatch([])
      expect(result.size).toBe(0)
    })

    it('returns latest judgement keyed by entity_type:entity_id', async () => {
      const postId1 = await insertTestPost({
        createdById: author.id,
        slug: `judgement-batch-1-${crypto.randomUUID().slice(0, 8)}`,
        title: `Judgement Batch Post 1 ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      const postId2 = await insertTestPost({
        createdById: author.id,
        slug: `judgement-batch-2-${crypto.randomUUID().slice(0, 8)}`,
        title: `Judgement Batch Post 2 ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })

      const j1 = await insertReportJudgement({
        entityType: 'post',
        entityId: postId1,
        triggeringReportId: null,
        rerunById: null,
        recommendedAction: 'escalate',
        publicResponse: 'Escalated.',
        internalResponse: 'Need human review.',
        model: 'gpt-5.4-nano',
      })
      const j2 = await insertReportJudgement({
        entityType: 'post',
        entityId: postId2,
        triggeringReportId: null,
        rerunById: null,
        recommendedAction: 'no_action',
        publicResponse: 'No action.',
        internalResponse: 'Clean.',
        model: 'gpt-5.4-nano',
      })

      const result = await getLatestJudgementsForEntitiesBatch([
        { entityType: 'post', entityId: postId1 },
        { entityType: 'post', entityId: postId2 },
      ])

      expect(result.size).toBeGreaterThanOrEqual(2)
      expect(result.get(`post:${postId1}`)?.id).toBe(j1.id)
      expect(result.get(`post:${postId2}`)?.id).toBe(j2.id)
    })

    it('returns only the latest when multiple judgements exist for an entity', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `judgement-batch-multi-${crypto.randomUUID().slice(0, 8)}`,
        title: `Judgement Batch Multi ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })

      await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        triggeringReportId: null,
        rerunById: null,
        recommendedAction: 'warn',
        publicResponse: 'Warning.',
        internalResponse: 'First.',
        model: 'gpt-5.4-nano',
      })
      const latest = await insertReportJudgement({
        entityType: 'post',
        entityId: postId,
        triggeringReportId: null,
        rerunById: null,
        recommendedAction: 'remove',
        publicResponse: 'Remove.',
        internalResponse: 'Second.',
        model: 'gpt-5.4-nano',
      })

      const result = await getLatestJudgementsForEntitiesBatch([
        { entityType: 'post', entityId: postId },
      ])

      expect(result.get(`post:${postId}`)?.id).toBe(latest.id)
    })
  })

  describe('getAllReportsForEntity', () => {
    it('returns empty array when no reports exist', async () => {
      const result = await getAllReportsForEntity('post', crypto.randomUUID())
      expect(result).toEqual([])
    })

    it('returns all reports for an entity in descending created_at order', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `get-all-reports-${crypto.randomUUID().slice(0, 8)}`,
        title: `Get All Reports Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })

      const reporter2 = await createTestUser()
      const r1 = await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        note: 'First note',
      })
      const r2 = await insertTestModerationReport({
        reporterUserId: reporter2.id,
        entityType: 'post',
        entityId: postId,
        reason: 'harassment',
      })

      const result = await getAllReportsForEntity('post', postId)
      expect(result.length).toBeGreaterThanOrEqual(2)
      const ids = result.map(r => r.id)
      expect(ids).toContain(r1)
      expect(ids).toContain(r2)
      // Verify order: DESC by created_at
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.created_at.getTime()).toBeGreaterThanOrEqual(
          result[i]!.created_at.getTime(),
        )
      }
    })

    it('includes reason and note fields', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `get-all-reports-note-${crypto.randomUUID().slice(0, 8)}`,
        title: `Get All Reports Note Post ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      const r = await createTestUser()
      await insertTestModerationReport({
        reporterUserId: r.id,
        entityType: 'post',
        entityId: postId,
        reason: 'misinformation',
        note: 'This is false',
      })

      const result = await getAllReportsForEntity('post', postId)
      const found = result.find(row => row.reason === 'misinformation')
      expect(found).toBeDefined()
      expect(found!.note).toBe('This is false')
    })
  })
})
