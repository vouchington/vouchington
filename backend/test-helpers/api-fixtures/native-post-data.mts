import { timestamp, user } from './data.mts'

type PostFixtureOverrides = Record<string, unknown> & {
  id: string
  post_type?: string
}

export function completeNativePost(overrides: PostFixtureOverrides) {
  return {
    __entity_type: 'post',
    slug: `fixture-${overrides.id}`,
    post_type: 'discussion',
    title: `Fixture post ${overrides.id}`,
    markdown: '',
    ai_summary_markdown: '',
    html: '',
    parent_id: null,
    root_id: null,
    created_by_id: user.id,
    created_at: timestamp,
    updated_at: timestamp,
    updated_by_id: null,
    deleted_at: null,
    deleted_by_id: null,
    archived_at: null,
    archived_by_id: null,
    approved_at: null,
    rejected_at: null,
    in_review_at: null,
    locked_at: null,
    locked_by_id: null,
    broadcast: 'everyone',
    privacy: 'public',
    is_anonymous: false,
    community_id: null,
    clearance_status: 'pending',
    clearance_reason: null,
    clearance_updated_at: null,
    ...overrides,
  }
}

export function completePostMetrics(postId: string, index: number) {
  return {
    __entity_type: 'post_metrics',
    id: postId,
    count: { descendants: index + 1, children: index, ancestors: index + 2 },
    updated_at: timestamp,
    bookmarks: { follow: 0, save: 0 },
  }
}

export function completePostElection(postId: string, index: number) {
  return {
    __entity_type: 'post_election',
    id: postId,
    votes_count_down: index + 1,
    votes_count_up: index + 3,
    votes_score_net: index + 2,
  }
}

export function completePostElectionVote(postId: string, index: number) {
  return {
    __entity_type: 'election_vote',
    created_at: timestamp,
    entity_id: postId,
    choice: index % 2 === 0 ? 'dislike' : 'like',
    user_id: user.id,
  }
}
