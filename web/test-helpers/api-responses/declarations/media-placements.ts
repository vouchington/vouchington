import nativePostImagesPlacementDefault from '../../../../api-fixtures/v1/responses/native.posts.images.placement.default.json'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const MEDIA_PLACEMENT_DECLARATIONS = [
  defineWebApiFixture<typeof nativePostImagesPlacementDefault>()(
    'native.posts.images.placement.default',
    nativePostImagesPlacementDefault,
    context =>
      context.rawServer.get<typeof nativePostImagesPlacementDefault>(
        '/api/v1/posts/00000000-0000-7000-8000-000000000801/images',
      ),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
