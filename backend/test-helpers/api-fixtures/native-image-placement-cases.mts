import type { ApiFixtureCase } from './types.mts'

const postId = '00000000-0000-7000-8000-000000000801'
const imageId = '00000000-0000-7000-8000-000000000802'
const clientConsumers = ['swift-core', 'swift-ui', 'dotnet-core'] as const

export const nativeImagePlacementApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.posts.images.placement-limit.conflict',
    method: 'PUT',
    path: `/api/v1/posts/${postId}/images`,
    route: {
      routeTemplate: '/api/v1/posts/:idOrSlug/images',
      pathParams: { idOrSlug: postId },
    },
    requestBody: { images: [{ image_id: imageId, order_index: 0, caption: '' }] },
    auth: 'fixture-user',
    status: 409,
    backendResponseContractKey: 'PUT:/api/v1/posts/:idOrSlug/images#placement-limit',
    body: { message: 'Image placement limit reached', code: 'IMAGE_PLACEMENT_LIMIT_REACHED' },
    consumers: [...clientConsumers],
    migratedFrom: ['backend/api/v1/posts/post-images.mts'],
  },
]
