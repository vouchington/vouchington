import type { ApiFixtureCase } from './types.mts'

const postId = '00000000-0000-7000-8000-000000000801'
const imageId = '00000000-0000-7000-8000-000000000802'
const placementId = '00000000-0000-7000-8000-000000000803'
const noticeId = '00000000-0000-7000-8000-000000000804'
const targetId = '00000000-0000-7000-8000-000000000805'

const postImage = {
  image_id: imageId,
  placement_id: placementId,
  placement_revision: 1,
  order_index: 0,
  caption: 'Fixture copyright placement image',
}

const clientConsumers = ['web', 'swift-core', 'swift-ui', 'dotnet-core'] as const

export const nativeCopyrightApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.posts.images.placement.default',
    method: 'GET',
    path: `/api/v1/posts/${postId}/images`,
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/images',
      pathParams: { idOrSlug: postId },
    },
    auth: 'fixture-user',
    status: 200,
    body: { images: [postImage] },
    consumers: [...clientConsumers],
    migratedFrom: ['backend/api/v1/posts/post-images.mts'],
  },
  {
    id: 'native.moderation.copyright.image-similarity-candidates.default',
    method: 'GET',
    path: `/api/v1/copyright-notices/${noticeId}/targets/${targetId}/image-similarity-candidates`,
    route: {
      routeTemplate: '/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates',
      pathParams: { id: noticeId, targetId },
    },
    auth: 'fixture-admin',
    status: 200,
    body: {
      availability: 'available',
      copyright_image_similarity_candidates: [
        {
          placement_id: placementId,
          placement_revision: 1,
          image_id: imageId,
          post_id: postId,
          similarity: 0.98,
        },
      ],
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/copyright-notices/moderator-routes.mts'],
  },
]
