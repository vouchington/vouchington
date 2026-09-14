import { expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

export async function expectPendingReportsPagination(
  moderator: PrivateUser,
  community: Community,
): Promise<void> {
  const reporter = await createTestUser()
  await Promise.all(
    ['one', 'two'].map(async suffix => {
      const postId = await insertTestPost({
        createdById: moderator.id,
        slug: `pending-report-page-${suffix}-${crypto.randomUUID().slice(0, 8)}`,
        title: `Pending report page ${suffix}`,
        markdown: 'Reported content',
        communityId: community.id,
      })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
      })
    }),
  )

  const request = createRequest()
  await request.authenticateAs(moderator)
  const base = `/api/v1/communities/${community.slug}/reports/pending?sort=created_at_desc&limit=1`
  const first = await request.get(base).expect(200)
  expect(first.body.reports).toHaveLength(1)
  expect(first.body.page_info).toMatchObject({
    has_next_page: true,
    has_previous_page: false,
  })
  const cursor = encodeURIComponent(first.body.page_info.end_cursor as string)
  const second = await request.get(`${base}&after=${cursor}`).expect(200)
  expect(second.body.reports[0].id).not.toBe(first.body.reports[0].id)
  expect(second.body.page_info.has_previous_page).toBe(true)

  const changedSort = base.replace('created_at_desc', 'created_at_asc')
  await request.get(`${changedSort}&after=${cursor}`).expect(422)
}
