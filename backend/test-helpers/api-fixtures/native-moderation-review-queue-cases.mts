import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'

export const reviewQueueFixture = {
  inReviewPostId: '019e8300-5e60-7000-8000-000000000000',
  rejectedPostId: '019e82f2-a2c0-7000-8000-000000000000',
  olderRejectedPostId: '019e7d79-e100-7000-8000-000000000000',
  pageOneEndCursor: 'eyJpZCI6IjAxOWU4MmYyLWEyYzAtNzAwMC04MDAwLTAwMDAwMDAwMDAwMCJ9',
} as const

export const nativeModerationReviewQueueApiFixtureCases = [
  fixtureCase({
    id: 'native.moderation.review-queue.default',
    method: 'GET',
    path: '/api/v1/posts/review-queue',
    query: { limit: '2' },
    route: { routeTemplate: '/api/v1/posts/review-queue' },
    migratedFrom: ['backend/api/v1/admin/review-queue.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.review-queue.page-2',
    method: 'GET',
    path: '/api/v1/posts/review-queue',
    query: { after: reviewQueueFixture.pageOneEndCursor, limit: '2' },
    route: { routeTemplate: '/api/v1/posts/review-queue' },
    migratedFrom: ['backend/api/v1/admin/review-queue.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.clearance.approved',
    method: 'POST',
    path: `/api/v1/posts/${reviewQueueFixture.inReviewPostId}/clearances`,
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/clearances',
      pathParams: { idOrSlug: reviewQueueFixture.inReviewPostId },
    },
    requestBody: { status: 'approved', reason_code: 'staff_approved' },
    migratedFrom: ['backend/api/v1/posts/post-routes/post-mutation-routes.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.clearance.rejected',
    method: 'POST',
    path: `/api/v1/posts/${reviewQueueFixture.inReviewPostId}/clearances`,
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/clearances',
      pathParams: { idOrSlug: reviewQueueFixture.inReviewPostId },
    },
    requestBody: { status: 'rejected', reason_code: 'staff_rejected' },
    migratedFrom: ['backend/api/v1/posts/post-routes/post-mutation-routes.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.clearance.in-review',
    method: 'POST',
    path: `/api/v1/posts/${reviewQueueFixture.rejectedPostId}/clearances`,
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/clearances',
      pathParams: { idOrSlug: reviewQueueFixture.rejectedPostId },
    },
    requestBody: { status: 'in_review', reason_code: 'staff_reviewed' },
    migratedFrom: ['backend/api/v1/posts/post-routes/post-mutation-routes.mts'],
  }),
]
