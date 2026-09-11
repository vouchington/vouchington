import assert from 'http-assert'

type PostRemovalKind = 'platform' | 'community'

type PostRemovalState = {
  rejected_at: Date | null
  community_unpublished_at: Date | null
}

export function selectPostRemovalKind(
  requestedKind: PostRemovalKind | undefined,
  state: PostRemovalState,
): PostRemovalKind {
  if (requestedKind === 'platform') {
    assert(state.rejected_at != null, 422, 'Post has not been removed by platform moderation')
    return 'platform'
  }
  if (requestedKind === 'community') {
    assert(
      state.community_unpublished_at != null,
      422,
      'Post has not been removed by community moderation',
    )
    return 'community'
  }
  return state.rejected_at != null ? 'platform' : 'community'
}
