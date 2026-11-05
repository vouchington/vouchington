import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, type Mock } from 'vitest'

const baseUser = { id: 'user-1', username: 'alice' }

export function registerFollowedRssFeedPageTests(options: {
  loadPage: () => Promise<ReactElement>
  requireCurrentUser: Mock
  getUserRssFeedsCollection: Mock
}): void {
  const { loadPage, requireCurrentUser, getUserRssFeedsCollection } = options

  beforeEach(() => {
    requireCurrentUser.mockReset()
    getUserRssFeedsCollection.mockReset()
    getUserRssFeedsCollection.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topic_elections: {},
      hostname_elections: {},
    })
  })

  it('redirects to /login when not authenticated', async () => {
    requireCurrentUser.mockRejectedValue(new Error('redirect:/login'))
    await expect(loadPage()).rejects.toThrow('redirect:/login')
    expect(requireCurrentUser).toHaveBeenCalled()
  })

  it('renders the page heading when authenticated', async () => {
    requireCurrentUser.mockResolvedValue(baseUser)
    render(await loadPage())
    expect(screen.getByTestId('bookmark-page-header')).toBeDefined()
  })

  it('renders RssFeedListItem for each result when results are non-empty', async () => {
    requireCurrentUser.mockResolvedValue(baseUser)
    getUserRssFeedsCollection.mockResolvedValue({
      results: [
        { id: 'feed-1', topic: { id: 'topic-1' }, hostname: null },
        { id: 'feed-2', topic: { id: 'topic-2' }, hostname: null },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topic_elections: {},
      hostname_elections: {},
      bookmarks: {},
      election_votes: {},
    })
    render(await loadPage())
    const items = screen.getAllByTestId('rss-feed-list-item')
    expect(items).toHaveLength(2)
  })
}
