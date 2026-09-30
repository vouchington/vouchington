import { describeCommunityListItemRoutes } from '@voucha/test-helpers/community-list-item-routes'
import { insertTestPost } from '@voucha/test-helpers'

describeCommunityListItemRoutes({
  segment: 'posts',
  itemType: 'post',
  bodyKey: 'post_id',
  createEntityId: (random, ownerId) =>
    insertTestPost({
      title: `List post ${random}`,
      slug: `list-post-${random}`,
      createdById: ownerId,
      markdown: 'Body',
    }),
})
