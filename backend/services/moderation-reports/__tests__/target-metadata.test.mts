import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPendingCommunityPostReview,
  setPostDeclaredLanguage,
  reviewPendingTestModerationReportsByPostSlugPrefixes,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { listRedactedModerationReports } from '../redaction.mts'
import { listModerationReports } from '../get.mts'
import { reportTargetContentSql, reportTargetLabelSql } from '../target-content.mts'
import crypto from 'node:crypto'

describe('moderation-reports/target-metadata — communityPostNotApprovedSql', () => {
  let releaseLock: () => Promise<void>
  beforeAll(async () => {
    const lock = await acquireReportPaginationTestLock()
    releaseLock = () => lock.release()
  })
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[author, reporter] = await Promise.all([createTestUser(), createTestUser()])
  })
  afterAll(() => releaseLock())

  describe('reportTargetIsRestrictedSql via listRedactedModerationReports', () => {
    it('uses the nonblank root post title and language for comment reports', async () => {
      const suffix = crypto.randomUUID().slice(0, 8)
      const rootPostId = await insertTestPost({
        createdById: author.id,
        slug: `comment-root-${suffix}`,
        title: `Root title ${suffix}`,
        markdown: 'root',
      })
      await setPostDeclaredLanguage(rootPostId, 'ar')
      const commentId = await insertTestPost({
        createdById: author.id,
        slug: `comment-child-${suffix}`,
        title: 'Comment title',
        markdown: 'comment',
        postType: 'comment',
        rootId: rootPostId,
        parentId: rootPostId,
      })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'comment',
        entityId: commentId,
        reason: 'spam',
      })

      const { reports } = await listModerationReports({ limit: 1000, sort: 'created_at_desc' })
      expect(reports.find(report => report.entity_id === commentId)?.target_content).toEqual({
        kind: 'comment',
        text: `Root title ${suffix}`,
        declared_language: 'ar',
        lingua_rs_detected_language: null,
      })
    })

    it('treats whitespace-only titles as absent at the projection boundary', () => {
      expect(reportTargetContentSql().text).toContain("NULLIF(BTRIM(root_post.title), '')")
      expect(reportTargetContentSql().text).toContain("NULLIF(BTRIM(target_post.title), '')")
    })

    it('uses fallback report labels for whitespace-only post and RSS titles', () => {
      const labelSql = reportTargetLabelSql().text
      expect(labelSql).toContain("NULLIF(BTRIM(root_post.title), '')")
      expect(labelSql).toContain("NULLIF(BTRIM(target_post.title), '')")
      expect(labelSql).toContain("NULLIF(BTRIM(target_rss_item.data->>'title'), '')")
    })
    it('masks target for unapproved public-community posts (pending community_post_reviews)', async () => {
      await reviewPendingTestModerationReportsByPostSlugPrefixes(['unapp-comm-post-'])
      const suffix = crypto.randomUUID().slice(0, 8)
      const comm = await insertTestCommunity({
        createdById: author.id,
        name: `Pub Unapp Comm ${suffix}`,
        slug: `pub-unapp-comm-${suffix}`,
        visibility: 'public',
      })
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `unapp-comm-post-${suffix}`,
        title: `Unapp Comm Post ${suffix}`,
        markdown: 'body',
        communityId: comm.id,
        broadcast: 'everyone',
      })
      // Pending (not approved) community_post_reviews row — post not yet publicly visible
      await insertTestPendingCommunityPostReview({ communityId: comm.id, postId })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt: new Date(Date.UTC(9999, 1, 1)),
      })

      // Non-staff (redacted) view: unapproved community post must be masked
      const { reports: redacted } = await listRedactedModerationReports({
        limit: 1000,
        sort: 'created_at_desc',
      })
      const redactedEntry = redacted.find(r => r.entity_id === postId)
      expect(redactedEntry).toBeDefined()
      expect(redactedEntry!.target_label).toBe('[Private content]')
      expect(redactedEntry!.target_content).toBeNull()
      expect(redactedEntry!.target_path).toBeNull()
    })

    it('does not mask target for approved public-community posts', async () => {
      await reviewPendingTestModerationReportsByPostSlugPrefixes(['app-comm-post-'])
      const suffix = crypto.randomUUID().slice(0, 8)
      const comm = await insertTestCommunity({
        createdById: author.id,
        name: `Pub App Comm ${suffix}`,
        slug: `pub-app-comm-${suffix}`,
        visibility: 'public',
      })
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `app-comm-post-${suffix}`,
        title: `App Comm Post ${suffix}`,
        markdown: 'body',
        communityId: comm.id,
        broadcast: 'everyone',
      })
      // Insert an approved community_post_reviews row — post is publicly visible
      await insertTestCommunityPostReview({ communityId: comm.id, postId })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt: new Date(Date.UTC(9999, 1, 2)),
      })

      // Staff view: target_is_restricted must be false for an approved community post
      const { reports } = await listModerationReports({ limit: 1000, sort: 'created_at_desc' })
      const staffEntry = reports.find(r => r.entity_id === postId)
      expect(staffEntry).toBeDefined()
      expect(staffEntry!.target_is_restricted).toBe(false)
      expect(staffEntry!.target_content).toEqual({
        kind: 'post',
        text: `App Comm Post ${suffix}`,
        declared_language: null,
        lingua_rs_detected_language: null,
      })
    })
  })
})
