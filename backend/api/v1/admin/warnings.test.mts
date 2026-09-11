import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestUserWarning,
} from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'

describe('admin warnings routes', () => {
  let modStaff: PrivateUser
  let regularUser: PrivateUser
  let targetUser: PrivateUser

  beforeAll(async () => {
    ;[modStaff, regularUser, targetUser] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    await addUserRole(modStaff.id, 'moderator')
    modStaff = (await getPrivateUserByAny(modStaff.id))!
  })

  describe('POST /api/v1/admin/warnings', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/admin/warnings')
        .send({ userId: targetUser.id, reason: 'Test reason' })
        .expect(401)
    })

    it('returns 403 for regular users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .post('/api/v1/admin/warnings')
        .send({ userId: targetUser.id, reason: 'Test reason' })
        .expect(403)
    })

    it('returns 415 when content-type is not json', async () => {
      const request = createRequest()
      await request.authenticateAs(modStaff)
      await request
        .post('/api/v1/admin/warnings')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(415)
    })

    it('returns 422 for missing userId', async () => {
      const request = createRequest()
      await request.authenticateAs(modStaff)
      await request.post('/api/v1/admin/warnings').send({ reason: 'Test reason' }).expect(422)
    })

    it('returns 422 for missing reason', async () => {
      const request = createRequest()
      await request.authenticateAs(modStaff)
      await request.post('/api/v1/admin/warnings').send({ userId: targetUser.id }).expect(422)
    })

    it('issues a warning as mod staff', async () => {
      const request = createRequest()
      await request.authenticateAs(modStaff)
      const response = await request
        .post('/api/v1/admin/warnings')
        .send({
          userId: targetUser.id,
          reason: 'Violated community guidelines',
          publicMessage: 'Please review our terms.',
        })
        .expect(201)

      expect(response.body.warning).toMatchObject({
        user_id: targetUser.id,
        issued_by_id: modStaff.id,
        reason: 'Violated community guidelines',
        public_message: 'Please review our terms.',
        community_id: null,
        report_id: null,
      })
      expect(response.body.warning.id).toBeDefined()
    })

    it('issues a warning with a linked report and resolves it as actioned', async () => {
      const postOwner = await createTestUser()
      const { insertTestPost } = await import('@voucha/test-helpers')
      const postId = await insertTestPost({
        createdById: postOwner.id,
        slug: `admin-warning-report-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Post for warning report',
        markdown: 'Content',
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: regularUser.id,
        entityType: 'post',
        entityId: postId,
      })

      const request = createRequest()
      await request.authenticateAs(modStaff)
      // Warn the post owner (the user targeted by the report), not an unrelated user
      const response = await request
        .post('/api/v1/admin/warnings')
        .send({
          userId: postOwner.id,
          reason: 'Spam content',
          reportId,
          resolveReport: true,
        })
        .expect(201)

      expect(response.body.warning).toMatchObject({
        user_id: postOwner.id,
        report_id: reportId,
      })
    })

    it('returns 422 when communityId + reportId are given but report is not in that community', async () => {
      const postOwner = await createTestUser()
      const { insertTestPost } = await import('@voucha/test-helpers')
      const postId = await insertTestPost({
        createdById: postOwner.id,
        slug: `warn-scope-mismatch-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Post for scope mismatch test',
        markdown: 'Content',
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: regularUser.id,
        entityType: 'post',
        entityId: postId,
      })

      // Use a random community UUID that the post does not belong to
      const unrelatedCommunityId = crypto.randomUUID()

      const request = createRequest()
      await request.authenticateAs(modStaff)
      await request
        .post('/api/v1/admin/warnings')
        .send({
          userId: postOwner.id,
          reason: 'Scope mismatch test',
          communityId: unrelatedCommunityId,
          reportId,
        })
        .expect(422)
    })

    it('returns 201 when communityId + reportId are given and report is in that community', async () => {
      const { insertTestCommunity, insertTestPost } = await import('@voucha/test-helpers')
      const postOwner = await createTestUser()
      const community = await insertTestCommunity({ createdById: modStaff.id })
      const postId = await insertTestPost({
        createdById: postOwner.id,
        slug: `warn-scope-match-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Post for scope match test',
        markdown: 'Content',
        communityId: community.id,
      })
      const reportId = await insertTestModerationReport({
        reporterUserId: regularUser.id,
        entityType: 'post',
        entityId: postId,
      })

      const request = createRequest()
      await request.authenticateAs(modStaff)
      const response = await request
        .post('/api/v1/admin/warnings')
        .send({
          userId: postOwner.id,
          reason: 'Scope match test',
          communityId: community.id,
          reportId,
        })
        .expect(201)

      expect(response.body.warning).toMatchObject({
        user_id: postOwner.id,
        community_id: community.id,
        report_id: reportId,
      })
    })
  })

  describe('GET /api/v1/admin/warnings', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/admin/warnings').query({ userId: targetUser.id }).expect(401)
    })

    it('returns 403 for regular users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/admin/warnings').query({ userId: targetUser.id }).expect(403)
    })

    it('returns 422 when userId is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(modStaff)
      await request.get('/api/v1/admin/warnings').expect(422)
    })

    it('returns 422 when userId is not a UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(modStaff)
      await request.get('/api/v1/admin/warnings').query({ userId: 'not-a-uuid' }).expect(422)
    })

    it('lists warnings for a user as mod staff', async () => {
      const warnedUser = await createTestUser()
      const warning = await insertTestUserWarning({
        userId: warnedUser.id,
        issuedById: modStaff.id,
        reason: 'Admin list test reason',
      })

      const request = createRequest()
      await request.authenticateAs(modStaff)
      const response = await request
        .get('/api/v1/admin/warnings')
        .query({ userId: warnedUser.id })
        .expect(200)

      expect(response.body.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: warning.id })]),
      )
      expect(response.body.page_info).toMatchObject({ has_next_page: false })
    })

    it('does not return warnings for other users', async () => {
      const warnedUser = await createTestUser()
      const otherUser = await createTestUser()
      const warning = await insertTestUserWarning({
        userId: otherUser.id,
        issuedById: modStaff.id,
        reason: 'Other user warning',
      })

      const request = createRequest()
      await request.authenticateAs(modStaff)
      const response = await request
        .get('/api/v1/admin/warnings')
        .query({ userId: warnedUser.id })
        .expect(200)

      const ids = (response.body.warnings as Array<{ id: string }>).map(w => w.id)
      expect(ids).not.toContain(warning.id)
    })

    it('supports legacy cursor pagination', async () => {
      const warnedUser = await createTestUser()
      await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          insertTestUserWarning({
            userId: warnedUser.id,
            issuedById: modStaff.id,
            reason: `Admin after pagination warning ${i}`,
          }),
        ),
      )

      const request = createRequest()
      await request.authenticateAs(modStaff)
      const firstPage = await request
        .get('/api/v1/admin/warnings')
        .query({ userId: warnedUser.id, limit: 2 })
        .expect(200)

      expect(firstPage.body.warnings).toHaveLength(2)
      expect(firstPage.body.page_info.has_next_page).toBe(true)
      expect(firstPage.body.page_info.start_cursor).toBeTruthy()
      expect(firstPage.body.page_info.end_cursor).toBeTruthy()

      const secondPage = await request
        .get('/api/v1/admin/warnings')
        .query({ userId: warnedUser.id, limit: 2, cursor: firstPage.body.page_info.end_cursor })
        .expect(200)

      expect(secondPage.body.warnings).toHaveLength(1)
      expect(secondPage.body.page_info.has_next_page).toBe(false)
      expect(secondPage.body.page_info.end_cursor).toBeNull()
    })

    it('returns 400 for malformed cursors', async () => {
      const request = createRequest()
      await request.authenticateAs(modStaff)
      await request
        .get('/api/v1/admin/warnings')
        .query({ userId: targetUser.id, after: 'not-a-cursor' })
        .expect(400)
    })
  })
})
