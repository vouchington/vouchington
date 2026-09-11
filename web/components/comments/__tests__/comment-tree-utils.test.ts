import { describe, expect, it } from 'vitest'
import { buildCommentNodeData, buildTree } from '../comment-tree-utils'
import type { AgentModeration, AgentModerationElection } from '@/types/agents'
import type { ElectionVote, Post, PostElection } from '@/types/posts'

const makePost = (overrides: Partial<Post> = {}): Post => ({
  id: 'c1',
  post_type: 'comment',
  title: '',
  slug: 'c1',
  markdown: 'Comment c1',
  root_id: 'root-1',
  parent_id: 'root-1',
  created_by_id: 'user-1',
  created_by: { __entity_type: 'user', id: 'user-1', username: 'alice', profile_image_id: null },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,
  community_id: null,
  clearance_status: 'approved',
  ...overrides,
})

const makeElection = (id: string): PostElection => ({
  __entity_type: 'post_election',
  id,
  votes_score_net: 1,
  votes_count_up: 2,
  votes_count_down: 1,
})

const makeVote = (entityId: string, choice: ElectionVote['choice']): ElectionVote => ({
  __entity_type: 'election_vote',
  entity_id: entityId,
  user_id: 'user-1',
  choice,
  created_at: '2024-01-01T00:00:00Z',
})

describe('comment-tree-utils', () => {
  it('builds per-node comment data from response-wide sidecar maps', () => {
    const parent = makePost({ id: 'c1', community_id: 'community-1' })
    const child = makePost({ id: 'c2', parent_id: 'c1', markdown: 'Comment c2' })
    const tree = buildTree([{ id: 'c1' }, { id: 'c2' }], { c1: parent, c2: child })
    const moderation = {
      id: 'moderation-1',
      post_id: 'c1',
      prompt_id: 'prompt-1',
      agent_id: 'agent-1',
      moderator_slug: 'moderator',
      flagged: true,
      results: { reason: 'flagged' },
      input_sha256: 'sha',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    } as AgentModeration
    const moderationElection: AgentModerationElection = {
      __entity_type: 'agent_moderation_election',
      id: 'moderation-1',
      votes_score_net: -1,
      votes_count_up: 0,
      votes_count_down: 1,
    }

    const node = buildCommentNodeData(tree[0]!, {
      markdownToHtml: { c1: '<p>Parent</p>', c2: '<p>Child</p>', unrelated: '<p>Nope</p>' },
      electionsMap: { c1: makeElection('post-election-1'), unrelated: makeElection('unused') },
      electionVotesMap: {
        c1: makeVote('c1', 'vouch'),
        'moderation-1': makeVote('moderation-1', 'disavow'),
        unrelated: makeVote('unrelated', 'neutral'),
      },
      postModerations: { c1: [moderation] },
      moderationElections: {
        'moderation-1': moderationElection,
        unrelated: {
          __entity_type: 'agent_moderation_election',
          id: 'unrelated',
          votes_score_net: 0,
          votes_count_up: 0,
          votes_count_down: 0,
        },
      },
      communityNamesMap: { 'community-1': 'Tech' },
    })

    expect(node.post).toEqual(parent)
    expect(node.html).toBe('<p>Parent</p>')
    expect(node.election?.id).toBe('post-election-1')
    expect(node.electionVote?.choice).toBe('vouch')
    expect(node.communityName).toBe('Tech')
    expect(node.moderations).toEqual([moderation])
    expect(node.moderationElections).toEqual({ 'moderation-1': moderationElection })
    expect(node.moderationElectionVotes).toEqual({
      'moderation-1': expect.objectContaining({ choice: 'disavow' }),
    })
    expect(node.children).toHaveLength(1)
    expect(node.children[0]?.post).toEqual(child)
    expect(node.children[0]?.html).toBe('<p>Child</p>')
    expect(node.children[0]?.election).toBeUndefined()
    expect(node.children[0]?.electionVote).toBeUndefined()
  })
})
