import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { basePost } from '@/test-helpers/components/posts/post-detail-rendering-fixture'
import type { Post } from '@/types/posts'
import { PostCardBadges } from '../post-card/post-card-badges'
import { PostDetailBadges, type PostDetailBadgeLabels } from '../post-detail-badges'

const labels: PostDetailBadgeLabels = {
  private: 'Private',
  locked: 'Locked',
  followers: 'Followers',
  signedIn: 'Signed In',
  mutual: 'Mutual',
}

const client = {
  client_id: 'voucha_fixture_agent',
  client_name: 'Fixture Agent',
  metadata_url: null,
  verified: true,
}

const verifiedApp = {
  kind: 'verified',
  client_id: client.client_id,
  client_name: client.client_name,
} as const

const withProvenance = (extra: Partial<Post>): Post => ({ ...basePost, ...extra })

const detail = (post: Post) =>
  render(
    <PostDetailBadges
      categoryTopics={[]}
      postType={post.post_type}
      broadcast={post.broadcast}
      privacy={post.privacy}
      locked={false}
      reviewRatings={[]}
      provenance={post.provenance}
      staffProvenance={post.staff_provenance}
      labels={labels}
    />,
  )

describe('provenance on post cards', () => {
  it('shows the public label next to the post type', () => {
    render(<PostCardBadges post={withProvenance({ provenance: { via: 'mcp', app: null } })} />)
    expect(screen.getByText('via MCP')).toHaveAttribute('data-pw', 'post-provenance-badge')
  })

  it('shows no label for a post written on the web', () => {
    render(<PostCardBadges post={basePost} />)
    expect(screen.queryByText(/^via /)).toBeNull()
    expect(screen.queryByText(/^Channel:/)).toBeNull()
  })

  it('shows staff the channel but leaves the client to the detail page', () => {
    render(
      <PostCardBadges
        post={withProvenance({
          provenance: { via: 'mcp', app: verifiedApp },
          staff_provenance: { created_via: 'mcp', oauth_client: client },
        })}
      />,
    )
    expect(screen.getByText('via Fixture Agent')).toBeInTheDocument()
    expect(screen.getByText('Channel: mcp')).toBeInTheDocument()
    expect(screen.queryByText(/^Client:/)).toBeNull()
  })
})

describe('provenance on post detail', () => {
  it('shows the public label in the badge strip', () => {
    detail(withProvenance({ provenance: { via: 'api', app: null } }))
    expect(screen.getByText('via API')).toBeInTheDocument()
    expect(screen.queryByText(/^Channel:/)).toBeNull()
  })

  it('shows no label for a post written on the web', () => {
    detail(basePost)
    expect(screen.queryByText(/^via /)).toBeNull()
  })

  it('shows staff the channel, the raw OAuth client and its verification', () => {
    detail(
      withProvenance({
        provenance: { via: 'mcp', app: verifiedApp },
        staff_provenance: { created_via: 'mcp', oauth_client: client },
      }),
    )
    expect(screen.getByText('Channel: mcp')).toBeInTheDocument()
    expect(screen.getByText('Client: Fixture Agent (voucha_fixture_agent)')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
  })
})
