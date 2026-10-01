export function shouldIncludeCommunityPinnedPosts({
  after,
  hasHashtagFilter,
  textSearchQuery,
  topicIds,
}: {
  after?: string
  hasHashtagFilter?: boolean
  textSearchQuery?: string
  topicIds: string[]
}) {
  return (
    !after && shouldExcludeCommunityPinnedPosts({ hasHashtagFilter, textSearchQuery, topicIds })
  )
}

export function shouldExcludeCommunityPinnedPosts({
  hasHashtagFilter,
  textSearchQuery,
  topicIds,
}: {
  hasHashtagFilter?: boolean
  textSearchQuery?: string
  topicIds: string[]
}) {
  return !hasHashtagFilter && !textSearchQuery?.trim() && topicIds.length === 0
}
