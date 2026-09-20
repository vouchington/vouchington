import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'

import {
  loadPostCard,
  mockElection,
  mockPost,
  postWithImages,
  setUpPostCardImagesTest,
} from '@/test-helpers/components/posts/post-card-images.mock-support'

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <Button type='button'>Save</Button>,
}))

describe('PostCard image presentation', () => {
  beforeEach(setUpPostCardImagesTest)

  it('uses the post title as card-image alt text when there is no caption', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(<PostCard post={postWithImages(1)} />)

    expect(container.querySelector('img')).toHaveAttribute('alt', 'Test Post Title')
  })

  it('uses empty card-image alt text when the image has a caption', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(<PostCard post={postWithImages(1, 'A beautiful view')} />)

    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('uses the untitled fallback for card-image alt text', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(<PostCard post={{ ...postWithImages(1), title: '' }} />)

    expect(container.querySelector('img')).toHaveAttribute('alt', 'Untitled Discussion')
  })

  it('uses the image caption as compact-image alt text', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(
      <PostCard
        post={postWithImages(1, 'Sunset view')}
        view='compact'
      />,
    )

    expect(container.querySelector('img')).toHaveAttribute('alt', 'Sunset view')
  })

  it('uses the post title for a compact image without a caption', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(
      <PostCard
        post={postWithImages(1)}
        view='compact'
      />,
    )

    expect(container.querySelector('img')).toHaveAttribute('alt', 'Test Post Title')
  })

  it('uses the untitled fallback for a compact image without a caption', async () => {
    const PostCard = await loadPostCard()
    const { container } = render(
      <PostCard
        post={{ ...postWithImages(1), title: '' }}
        view='compact'
      />,
    )

    expect(container.querySelector('img')).toHaveAttribute('alt', 'Untitled Discussion')
  })

  it('wraps the compact thumbnail in a post-detail link', async () => {
    const PostCard = await loadPostCard()
    const post = postWithImages(1)
    const { container } = render(
      <PostCard
        post={post}
        view='compact'
      />,
    )

    expect(container.querySelector('img')?.closest('a')).toHaveAttribute(
      'href',
      expect.stringContaining(post.id),
    )
  })

  it('places card carousel arrows inside the viewport', async () => {
    const PostCard = await loadPostCard()
    render(<PostCard post={postWithImages(2)} />)

    expect(screen.getByRole('button', { name: 'Previous slide' })).toHaveClass('left-2')
    expect(screen.getByRole('button', { name: 'Next slide' })).toHaveClass('right-2')
  })

  it('shows raw vote counts with the signed-out voting link', async () => {
    const PostCard = await loadPostCard()
    render(
      <PostCard
        post={mockPost}
        election={mockElection}
      />,
    )

    expect(document.querySelector('[data-pw="score-vote-sign-in"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="vote-count-up"]')).toHaveTextContent('+10 −2')
  })
})
