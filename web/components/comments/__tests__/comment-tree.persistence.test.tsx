import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/test-helpers/components/comment-tree-test-helpers'
import { CommentTree } from '../comment-tree'
import { getPreference, setPreference } from '@/lib/preferences/storage'
import type { PostsResponseBody } from '@/types/api-responses'
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
    it('hydrates collapsedIds from localStorage on mount', async () => {
      vi.mocked(getPreference).mockReturnValue(JSON.stringify(['c1']))

      const parent = makeComment('c1', 'root-1', 'alice')
      const child = makeComment('c2', 'c1', 'bob')
      const data: PostsResponseBody = {
        results: [
          { __entity_type: 'post', id: 'c1', ranking: 0, search_vector_ts: null },
          { __entity_type: 'post', id: 'c2', ranking: 0, search_vector_ts: null },
        ],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
        posts: { c1: parent, c2: { ...child, parent_id: 'c1' } },
        posts_metrics: {},
        markdown_to_html: {
          c1: '<p>Parent</p>',
          c2: '<p>Child</p>',
        },
      }

      await act(async () => {
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
      })

      // c1 is collapsed — its body MarkdownContent and children are not rendered
      // The parent content '<p>Parent</p>' should NOT appear (collapsed body is hidden)
      // The child content '<p>Child</p>' should also NOT appear
      const markdowns = screen.queryAllByTestId('markdown')
      expect(markdowns.find(el => el.textContent === '<p>Parent</p>')).toBeUndefined()
      expect(markdowns.find(el => el.textContent === '<p>Child</p>')).toBeUndefined()
    })

    it('persists collapse toggle to localStorage', async () => {
      vi.mocked(setPreference)

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

      const collapseButton = screen.getByRole('button', { name: 'Collapse comment thread' })
      fireEvent.click(collapseButton)

      expect(vi.mocked(setPreference)).toHaveBeenCalledWith(
        'comments-collapsed:root-1',
        JSON.stringify(['1']),
      )
    })

    it('prunes stale ids on hydrate', async () => {
      const staleId = 'stale-uuid-not-in-tree'
      vi.mocked(getPreference).mockReturnValue(JSON.stringify([staleId]))

      const comments = [makeComment('1', 'root-1', 'alice')]
      const data = makeData(comments)

      await act(async () => {
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
      })

      expect(vi.mocked(setPreference)).toHaveBeenCalledWith(
        'comments-collapsed:root-1',
        JSON.stringify([]),
      )
    })
  })
})
