import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/test-helpers/components/comment-tree-test-helpers'
import { CommentTree } from '../comment-tree'
import type { User } from '@/types/user'
import {
  makeComment,
  makeData,
  renderWithAuth,
  type PostElection,
} from '@/test-helpers/components/comment-tree-test-helpers'

describe('comment-tree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('CommentTree', () => {
    it('renders threaded view by default', () => {
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

      expect(screen.getByText('Comments')).toBeDefined()
      expect(screen.getByLabelText('Sort comments')).toBeDefined()
      expect(screen.getByRole('option', { name: 'Best' })).toBeDefined()
      expect(screen.getByRole('option', { name: 'New' })).toBeDefined()
    })

    it('updates threaded comment order when sort dropdown changes', () => {
      const lowerScoreNewerComment = makeComment('2', 'root-1', 'bob')
      const higherScoreOlderComment = makeComment('1', 'root-1', 'alice')
      const data = makeData([lowerScoreNewerComment, higherScoreOlderComment])
      data.post_elections = {
        '1': { votes_count_up: 8, votes_count_down: 1 } as PostElection,
        '2': { votes_count_up: 2, votes_count_down: 0 } as PostElection,
      }

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

      expect(screen.getAllByTestId('markdown')[0]).toHaveTextContent('Comment 2')

      fireEvent.change(screen.getByLabelText('Sort comments'), {
        target: { value: 'best' },
      })

      expect(screen.getAllByTestId('markdown')[0]).toHaveTextContent('Comment 1')
    })

    it('does not render community filter pills', () => {
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

      expect(screen.queryByRole('button', { name: 'All' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Global' })).toBeNull()
    })

    it('hides the root reply form when the thread is locked', () => {
      const comments = [makeComment('1', 'root-1', 'alice')]
      const data = makeData(comments)

      renderWithAuth(
        <CommentTree
          data={data}
          rootPostId='root-1'
          rootPostType='discussion'
          rootLockedAt='2026-06-01T00:00:00Z'
          isAdmin={false}
          hideDownCount={false}
        />,
        { id: 'user-1' } as User,
      )

      expect(screen.queryByPlaceholderText('What are your thoughts?')).toBeNull()
      expect(document.querySelector('[data-pw="root-comment-textarea"]')).toBeNull()
      expect(screen.getByTestId('markdown').textContent).toBe('<p>Comment 1</p>')
    })
  })
})
