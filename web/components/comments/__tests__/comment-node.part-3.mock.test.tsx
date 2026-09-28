import { scoreVoteProps } from '@/test-helpers/components/comments/comment-node.mock-support'
import {
  createCommentNodeProps,
  makeCommentNode,
  makeCommentPost,
} from '@/test-helpers/components/comments/comment-node-fixtures'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'

import { CommentNode } from '../comment-node'

import type { ElectionVote } from '@/types/posts'

const makePost = makeCommentPost
const makeNode = makeCommentNode
const defaultProps = createCommentNodeProps()

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({ currentUser: null, isAuthenticated: false }),
}))

vi.mock(
  import('../comment-reply-form'),
  () =>
    ({
      CommentReplyForm: () => null,
    }) as unknown as typeof import('../comment-reply-form'),
)

describe('CommentNode', () => {
  beforeEach(() => {
    scoreVoteProps.length = 0
  })

  it('passes only the node-local election vote choice to ScoreVote', () => {
    const post = makePost()
    const electionVote: ElectionVote = {
      __entity_type: 'election_vote',
      entity_id: post.id,
      user_id: 'user-1',
      choice: 'vouch',
      created_at: '2024-01-01T00:00:00Z',
    }

    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post, {
          election: {
            __entity_type: 'post_election',
            id: 'election-1',
            votes_count_up: 2,
            votes_count_down: 1,
            votes_score_net: 1,
          },
          electionVote,
        })}
      />,
    )

    expect(scoreVoteProps).toHaveLength(1)
    expect(scoreVoteProps[0]?.existingVoteChoice).toBe('vouch')
  })

  it('hides the negative vote label in a collapsed comment for restricted viewers', () => {
    render(
      <CommentNode
        {...defaultProps}
        collapsedIds={new Set(['c1'])}
        hideDownCount
        node={makeNode(makePost(), {
          election: {
            __entity_type: 'post_election',
            id: 'election-1',
            votes_count_up: 2,
            votes_count_down: 1,
            votes_score_net: 1,
          },
        })}
      />,
    )

    expect(document.body.textContent).toContain('2 positive votes')
    expect(document.body.textContent).not.toContain('1 negative votes')
  })

  it('stops click event propagation on permalink and author links in header', () => {
    const post = makePost()
    const onNodeClick = vi.fn<() => void>()
    render(
      <CommentNode
        {...defaultProps}
        node={makeNode(post)}
      />,
    )
    document.body.addEventListener('click', onNodeClick)

    try {
      // The user link is an anchor wrapping the avatar/username
      const userLink = screen.getAllByTestId('user-link')[0]
      expect(userLink).toBeDefined()
      fireEvent.click(userLink!)
      expect(onNodeClick).not.toHaveBeenCalled()

      // The timeago link is the permalink link
      const timeLink = screen.getByText('2024-01-01T00:00:00Z')
      expect(timeLink).toBeDefined()
      fireEvent.click(timeLink)
      expect(onNodeClick).not.toHaveBeenCalled()
    } finally {
      document.body.removeEventListener('click', onNodeClick)
    }
  })
})
