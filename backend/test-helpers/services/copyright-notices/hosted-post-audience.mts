import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestImage,
  insertTestLocalFollow,
  insertTestPost,
  insertTestPostImage,
  suspendTestUser,
} from '../../index.mts'
import { archivePost } from '../../../services/posts/archive.mts'

/** Every way a hosted post can be limited, each set up through the real post columns. */
export type HostedPostAudience =
  | 'public'
  | 'users'
  | 'followers'
  | 'private-community'
  | 'awaiting-community-review'
  | 'draft'
  | 'archived'
  | 'suspended-author'

const POST_COLUMNS = {
  public: {},
  users: { privacy: 'private', broadcast: 'users' },
  followers: { privacy: 'private', broadcast: 'followers' },
  'private-community': {},
  'awaiting-community-review': {},
  draft: { clearanceStatus: 'pending' },
  archived: {},
  'suspended-author': {},
} satisfies Record<HostedPostAudience, Partial<Parameters<typeof insertTestPost>[0]>>

/**
 * Creates a claimant, a poster, and a post with one hosted image shared to `audience`.
 * `claimantHasAccess` gives the claimant the follow or membership that audience requires.
 */
export async function createHostedImagePost(
  audience: HostedPostAudience,
  { claimantHasAccess = false } = {},
) {
  const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
  const inCommunity = audience === 'private-community' || audience === 'awaiting-community-review'
  const community = inCommunity
    ? await insertTestCommunity({ createdById: poster.id, visibility: 'private' })
    : null
  const postId = await insertTestPost({
    title: `Copyright route test ${crypto.randomUUID()}`,
    slug: `copyright-route-test-${crypto.randomUUID()}`,
    createdById: poster.id,
    markdown: 'Hosted image for a copyright-notice route test.',
    communityId: community?.id,
    ...POST_COLUMNS[audience],
  })
  const imageId = await insertTestImage(poster.id)
  await insertTestPostImage({ postId, imageId })
  if (community && audience === 'private-community') {
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: poster.id,
    })
  }
  if (community && claimantHasAccess) {
    await insertTestCommunityMember({ communityId: community.id, userId: claimant.id })
  }
  if (audience === 'followers' && claimantHasAccess) {
    await insertTestLocalFollow(claimant.id, poster.id)
  }
  if (audience === 'archived') await archivePost(postId, poster.id)
  if (audience === 'suspended-author') await suspendTestUser(poster.id)
  return { claimant, poster, postId, imageId }
}
