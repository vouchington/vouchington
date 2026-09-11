import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/test-helpers/components/comment-tree-test-helpers'
import { CommentTree } from '../comment-tree'
import { previewMarkdown } from '@/lib/api/client/markdown'
import { createPost } from '@/lib/api/client/posts'
import type { User } from '@/types/user'
import {
  makeComment,
  makeData,
  renderWithAuth,
} from '@/test-helpers/components/comment-tree-test-helpers'

describe('comment-tree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('CommentTree', () => {
    it('renders the root reply textarea data-pw when the thread is unlocked', () => {
      const comments = [makeComment('1', 'root-1', 'alice')]
      const data = makeData(comments)

      renderWithAuth(
        <CommentTree
          data={data}
          rootPostId='root-1'
          rootPostType='discussion'
          rootLockedAt={null}
          isAdmin={false}
          hideDownCount={false}
        />,
        { id: 'user-1' } as User,
      )

      expect(document.querySelector('[data-pw="root-comment-textarea"]')).not.toBeNull()
    })

    it('renders server-rendered HTML for existing comments (not raw markdown)', () => {
      const comments = [makeComment('1', 'root-1', 'alice')]
      const data = makeData(comments)

      renderWithAuth(
        <CommentTree
          data={data}
          rootPostId='root-1'
          rootPostType='discussion'
          rootLockedAt={null}
          isAdmin={false}
          hideDownCount={false}
        />,
      )

      // The MarkdownContent should receive the server-rendered HTML, not the raw markdown source
      expect(screen.getByTestId('markdown').textContent).toBe('<p>Comment 1</p>')
      expect(screen.queryByText('Comment 1')).toBeNull()
    })

    it('renders preview HTML for a newly submitted optimistic comment', async () => {
      const comment = makeComment('new-comment', 'root-1', 'alice')
      comment.markdown = '**bold test reply**'
      vi.mocked(createPost).mockResolvedValueOnce({ post: comment })
      vi.mocked(previewMarkdown).mockResolvedValueOnce({
        html: '<p><strong>bold test reply</strong></p>',
      })

      await act(async () => {
        renderWithAuth(
          <CommentTree
            data={makeData([])}
            rootPostId='root-1'
            rootPostType='discussion'
            rootLockedAt={null}
            isAdmin={false}
            hideDownCount={false}
          />,
          { id: 'user-1' } as User,
        )
      })

      fireEvent.change(screen.getByPlaceholderText('What are your thoughts?'), {
        target: { value: '**bold test reply**' },
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
      })

      expect(screen.getByTestId('markdown').textContent).toBe(
        '<p><strong>bold test reply</strong></p>',
      )
    })
  })
})
