import type { BasicUser } from '@voucha/types/entities/user'
import { registerPostRelatedUrlsGuard } from '@services/entity-relations/post-related-urls-guard-registry'
import { assertCommunityNoLinksAllowed } from '@services/communities/restrictions/enforce'
import { getPostByAny } from './get.mts'

async function guardPostRelatedUrls(
  creator: BasicUser,
  postId: string,
  urlIds: string[],
): Promise<void> {
  const post = await getPostByAny(postId)
  const communityId = post?.community_id
  if (!communityId) return

  await Promise.all(
    urlIds.map(urlId =>
      assertCommunityNoLinksAllowed({
        communityId,
        currentUser: creator,
        updates: { url_id: urlId },
      }),
    ),
  )
}

// Registers this package's community-link-restriction check as entity-relations' post/url
// relation guard, as a side effect of importing this module (see
// backend/services/posts/index.mts, which imports this first for its side effects). Keeps
// entity-relations from depending on posts or communities.
registerPostRelatedUrlsGuard(guardPostRelatedUrls)
