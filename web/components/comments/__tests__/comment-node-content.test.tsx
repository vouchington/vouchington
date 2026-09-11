import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Post } from '@/types/posts'
import { CommentNodeContent } from '../comment-node-content'

function makeCommentPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'c1',
    post_type: 'comment',
    title: '',
    slug: 'c1',
    markdown: 'Bonjour le monde',
    root_id: 'root-1',
    parent_id: 'root-1',
    created_by_id: 'user-1',
    created_by: {
      __entity_type: 'user',
      id: 'user-1',
      username: 'alice',
      profile_image_id: null,
    },
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
    declared_language: 'fr',
    lingua_rs_detected_language: 'en',
    ...overrides,
  }
}

describe('CommentNodeContent', () => {
  it('sets content lang on plain-text comments using declared language before detected language', () => {
    render(
      <CommentNodeContent
        html={null}
        isDeleted={false}
        post={makeCommentPost()}
      />,
    )

    expect(screen.getByText('Bonjour le monde')).toHaveAttribute('lang', 'fr')
  })

  it('falls back to detected language when declared language is not provided', () => {
    render(
      <CommentNodeContent
        html={null}
        isDeleted={false}
        post={makeCommentPost({ declared_language: null })}
      />,
    )

    expect(screen.getByText('Bonjour le monde')).toHaveAttribute('lang', 'en')
  })

  it('omits lang when no valid content language is available', () => {
    render(
      <CommentNodeContent
        html={null}
        isDeleted={false}
        post={makeCommentPost({
          declared_language: null,
          lingua_rs_detected_language: null,
        })}
      />,
    )

    expect(screen.getByText('Bonjour le monde')).not.toHaveAttribute('lang')
  })
})
