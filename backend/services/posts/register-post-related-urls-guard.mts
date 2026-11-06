import { registerPostHackerNewsFlagRecompute } from '@services/entity-relations/post-hacker-news-flag-registry'
import { recomputePostHackerNewsFlags } from './hacker-news-flags.mts'
import type { BasicUser } from '@voucha/types/entities/user'
import type { QueryOptions } from '@data-stores/psql/types'
import { registerPostRelatedUrlsGuard } from '@services/entity-relations/post-related-urls-guard-registry'
import { assertCommunityNoLinksAllowed } from '@services/communities/restrictions/enforce'
import { getPostByAny } from './get.mts'

async function guardPostRelatedUrls(
  creator: BasicUser,
  postId: string,
  urlIds: string[],
  options?: QueryOptions,
): Promise<void> {
  const post = await getPostByAny(postId, options)
  const communityId = post?.community_id
  if (!communityId) return

  await Promise.all(
    urlIds.map(urlId =>
      assertCommunityNoLinksAllowed({
        communityId,
        currentUser: creator,
        options,
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

registerPostHackerNewsFlagRecompute(recomputePostHackerNewsFlags)
