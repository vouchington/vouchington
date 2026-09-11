import type { PostsResponseBody } from '@/types/api-responses'

export type CommentTreeViewModel = Pick<
  PostsResponseBody,
  | 'results'
  | 'posts'
  | 'post_elections'
  | 'election_votes'
  | 'markdown_to_html'
  | 'post_moderations'
  | 'agent_moderation_elections'
  | 'bookmarks'
>

function pickRecords<T>(records: Record<string, T> | undefined, ids: Set<string>) {
  if (!records) return undefined
  return Object.fromEntries(Object.entries(records).filter(([id]) => ids.has(id)))
}

export function projectCommentTree(data: PostsResponseBody): CommentTreeViewModel {
  const postIds = new Set(data.results.map(result => result.id))
  const moderations = pickRecords(data.post_moderations, postIds)
  const moderationIds = new Set(
    Object.values(moderations ?? {}).flatMap(items => items.map(item => item.id)),
  )
  const electionVoteIds = new Set([...postIds, ...moderationIds])

  return {
    results: data.results.map(result => ({
      id: result.id,
      __entity_type: result.__entity_type,
      ranking: result.ranking,
      search_vector_ts: result.search_vector_ts,
    })),
    posts: pickRecords(data.posts, postIds) ?? {},
    post_elections: pickRecords(data.post_elections, postIds),
    election_votes: pickRecords(data.election_votes, electionVoteIds),
    markdown_to_html: pickRecords(data.markdown_to_html, postIds),
    post_moderations: moderations,
    agent_moderation_elections: pickRecords(data.agent_moderation_elections, moderationIds),
    bookmarks: pickRecords(data.bookmarks, postIds),
  }
}
