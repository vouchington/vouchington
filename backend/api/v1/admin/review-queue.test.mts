import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { insertTestPost, createTestUser } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'

function createAdjacentReviewQueueIds() {
  const prefix = crypto.randomUUID().replaceAll('-', '').slice(0, 9)
  return {
    olderId: `ffffffff-ffff-7fff-8000-${prefix}001`,
    newerId: `ffffffff-ffff-7fff-8000-${prefix}002`,
    afterId: `ffffffff-ffff-7fff-8000-${prefix}003`,
  }
}

describe('review-queue', () => {
  const randomSuffix = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let regularUser: PrivateUser
  let moderatorUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    moderatorUser = await createTestUser()
    await addUserRole(moderatorUser.id, 'moderator')
    moderatorUser = (await getPrivateUserByAny(moderatorUser.id))!
  })

  describe('GET /api/v1/posts/review-queue', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/posts/review-queue').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/posts/review-queue').expect(403)
    })

    it('returns 403 for site moderators (clearance is admin-only)', async () => {
      const request = createRequest()
      await request.authenticateAs(moderatorUser)
      await request.get('/api/v1/posts/review-queue').expect(403)
    })

    it('returns rejected and in_review posts for admin', async () => {
      const suffix = randomSuffix()
      const { olderId: inReviewId, newerId: rejectedId, afterId } = createAdjacentReviewQueueIds()
      await Promise.all([
        insertTestPost({
          id: rejectedId,
          title: `review-queue-rejected-${suffix}`,
          slug: `review-queue-rejected-${suffix}`,
          createdById: regularUser.id,
          markdown: 'Rejected post content',
          clearanceStatus: 'rejected',
        }),
        insertTestPost({
          id: inReviewId,
          title: `review-queue-in-review-${suffix}`,
          slug: `review-queue-in-review-${suffix}`,
          createdById: regularUser.id,
          markdown: 'In review post content',
          clearanceStatus: 'in_review',
        }),
      ])

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(
          `/api/v1/posts/review-queue?limit=2&after=${encodeURIComponent(encodeCursor({ id: afterId }))}`,
        )
        .expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('page_info')

      expect(response.body.results.map((result: { id: string }) => result.id)).toEqual([
        rejectedId,
        inReviewId,
      ])
    })

    it('does NOT return approved posts', async () => {
      const suffix = randomSuffix()
      const { olderId: includedId, newerId: approvedId, afterId } = createAdjacentReviewQueueIds()
      await Promise.all([
        insertTestPost({
          id: approvedId,
          title: `review-queue-approved-${suffix}`,
          slug: `review-queue-approved-${suffix}`,
          createdById: regularUser.id,
          markdown: 'Approved post content',
          clearanceStatus: 'approved',
        }),
        insertTestPost({
          id: includedId,
          title: `review-queue-approved-sentinel-${suffix}`,
          slug: `review-queue-approved-sentinel-${suffix}`,
          createdById: regularUser.id,
          markdown: 'Rejected sentinel content',
          clearanceStatus: 'rejected',
        }),
      ])

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(
          `/api/v1/posts/review-queue?limit=1&after=${encodeURIComponent(encodeCursor({ id: afterId }))}`,
        )
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toEqual([includedId])
      expect(ids).not.toContain(approvedId)
    })

    it('does NOT return pending posts', async () => {
      const suffix = randomSuffix()
      const { olderId: includedId, newerId: pendingId, afterId } = createAdjacentReviewQueueIds()
      await Promise.all([
        insertTestPost({
          id: pendingId,
          title: `review-queue-pending-${suffix}`,
          slug: `review-queue-pending-${suffix}`,
          createdById: regularUser.id,
          markdown: 'Pending post content',
          clearanceStatus: 'pending',
        }),
        insertTestPost({
          id: includedId,
          title: `review-queue-pending-sentinel-${suffix}`,
          slug: `review-queue-pending-sentinel-${suffix}`,
          createdById: regularUser.id,
          markdown: 'Rejected sentinel content',
          clearanceStatus: 'rejected',
        }),
      ])

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(
          `/api/v1/posts/review-queue?limit=1&after=${encodeURIComponent(encodeCursor({ id: afterId }))}`,
        )
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toEqual([includedId])
      expect(ids).not.toContain(pendingId)
    })

    it('includes spam detection and moderation fields in results', async () => {
      const suffix = randomSuffix()
      const { newerId: postId, afterId } = createAdjacentReviewQueueIds()
      await insertTestPost({
        id: postId,
        title: `review-queue-fields-${suffix}`,
        slug: `review-queue-fields-${suffix}`,
        createdById: regularUser.id,
        markdown: 'Post for field check',
        clearanceStatus: 'rejected',
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(
          `/api/v1/posts/review-queue?limit=1&after=${encodeURIComponent(encodeCursor({ id: afterId }))}`,
        )
        .expect(200)

      const post = response.body.results.find((r: { id: string }) => r.id === postId)
      expect(post).toBeDefined()
      expect(post).toHaveProperty('spam_detection_flagged')
      expect(post).toHaveProperty('spam_detection_score')
      expect(post).toHaveProperty('spam_detection_results')
      expect(post).toHaveProperty('openai_omni_moderation_flagged')
      expect(post).toHaveProperty('openai_omni_moderation_results')
      expect(post).toHaveProperty('clearance_status')
      expect(post).toHaveProperty('created_at')
      expect(post).toHaveProperty('markdown_preview')
      expect(post).toHaveProperty('declared_language')
      expect(post).toHaveProperty('lingua_rs_detected_language')
    })

    it('traverses opaque cursors without gaps or duplicates across dirty-database-safe boundaries', async () => {
      const suffix = randomSuffix()
      const boundaryPrefix = crypto.randomUUID().replaceAll('-', '').slice(0, 9)
      const oldestId = `ffffffff-ffff-7fff-8000-${boundaryPrefix}001`
      const middleId = `ffffffff-ffff-7fff-8000-${boundaryPrefix}002`
      const newestId = `ffffffff-ffff-7fff-8000-${boundaryPrefix}003`

      await Promise.all(
        [oldestId, middleId, newestId].map((id, index) =>
          insertTestPost({
            id,
            title: `review-queue-pagination-${index}-${suffix}`,
            slug: `review-queue-pagination-${index}-${suffix}`,
            createdById: regularUser.id,
            markdown: `Review queue pagination boundary ${index}`,
            clearanceStatus: index % 2 === 0 ? 'rejected' : 'in_review',
          }),
        ),
      )

      const request = createRequest()
      await request.authenticateAs(admin)
      const newestCursor = encodeCursor({ id: newestId })
      const firstPage = await request
        .get(`/api/v1/posts/review-queue?limit=1&after=${encodeURIComponent(newestCursor)}`)
        .expect(200)

      expect(firstPage.body.results.map((post: { id: string }) => post.id)).toEqual([middleId])
      expect(firstPage.body.page_info.has_next_page).toBe(true)
      expect(firstPage.body.page_info.start_cursor).not.toBe(middleId)
      expect(firstPage.body.page_info.end_cursor).not.toBe(middleId)
      expect(
        decodeUuidCursor(
          firstPage.body.page_info.start_cursor,
          isSimpleCursor,
          'Invalid review queue cursor',
        ).id,
      ).toBe(middleId)
      expect(
        decodeUuidCursor(
          firstPage.body.page_info.end_cursor,
          isSimpleCursor,
          'Invalid review queue cursor',
        ).id,
      ).toBe(middleId)

      const secondPage = await request
        .get(
          `/api/v1/posts/review-queue?limit=1&after=${encodeURIComponent(
            firstPage.body.page_info.end_cursor,
          )}`,
        )
        .expect(200)

      expect(secondPage.body.results.map((post: { id: string }) => post.id)).toEqual([oldestId])
      expect(
        decodeUuidCursor(
          secondPage.body.page_info.start_cursor,
          isSimpleCursor,
          'Invalid review queue cursor',
        ).id,
      ).toBe(oldestId)
      const decodedSecondPageEndId =
        secondPage.body.page_info.end_cursor === null
          ? null
          : decodeUuidCursor(
              secondPage.body.page_info.end_cursor,
              isSimpleCursor,
              'Invalid review queue cursor',
            ).id
      expect(decodedSecondPageEndId).toBe(secondPage.body.page_info.has_next_page ? oldestId : null)
      expect([
        ...firstPage.body.results.map((post: { id: string }) => post.id),
        ...secondPage.body.results.map((post: { id: string }) => post.id),
      ]).toEqual([middleId, oldestId])
    })

    it('returns 400 for a malformed opaque cursor', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      await request.get('/api/v1/posts/review-queue?after=not-an-opaque-cursor').expect(400)
    })
  })
})
