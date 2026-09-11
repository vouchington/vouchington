/**
 * Shared helpers for community-list-items.test.mts.
 * Server creation and fetch patching are handled inline in the test file's
 * beforeAll because they rely on module-level state.
 */

export type CommunityListItemTestContext = {
  communitySlug: string
  communityId: string
  topicId: string
  rssFeedId: string
  postId: string
  hostnameId: string
  urlId: string
}
