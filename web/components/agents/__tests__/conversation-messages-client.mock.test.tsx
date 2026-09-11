import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPaginatedPage } from '@/lib/api/client'
import { ConversationMessagesClient } from '../conversation-messages-client'

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

const terminalPageInfo = { has_next_page: false, start_cursor: 'oldest', end_cursor: null }

function message(id: string, createdAt: string, content = id) {
  return {
    id,
    conversation_id: 'conversation-1',
    created_at: createdAt,
    created_by_id: 'user-1',
    content: { role: 'user' as const, content },
  }
}

describe('ConversationMessagesClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads and retries the reverse continuation while preserving the newer overlapping row', async () => {
    const initialData = {
      results: [
        message('message-2', '2026-01-02T00:00:00Z', 'current copy'),
        message('message-3', '2026-01-03T00:00:00Z'),
      ],
      page_info: {
        has_next_page: true,
        start_cursor: 'newest-cursor',
        end_cursor: 'older-cursor',
      },
    }
    vi.mocked(getPaginatedPage)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        results: [
          message('message-1', '2026-01-01T00:00:00Z'),
          message('message-2', '2026-01-02T00:00:00Z', 'stale copy'),
        ],
        page_info: terminalPageInfo,
      })

    const { container } = render(
      <ConversationMessagesClient
        initialData={initialData}
        endpoint='/api/v1/agents/helper/conversations/conversation-1'
        agentSystemUserId='agent-1'
        agentLabel='Agent'
        userLabel='User'
        emptyLabel='Empty'
        loadingLabel='Loading'
        loadOlderLabel='Load older messages'
        retryLabel='Retry'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }))
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(getPaginatedPage).toHaveBeenLastCalledWith(
      '/api/v1/agents/helper/conversations/conversation-1',
      { limit: 50, after: 'older-cursor' },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull())

    expect(getPaginatedPage).toHaveBeenCalledTimes(2)
    expect(
      [...container.querySelectorAll('.whitespace-pre-wrap')].map(element => element.textContent),
    ).toEqual(['message-1', 'current copy', 'message-3'])
    expect(screen.queryByText('stale copy')).toBeNull()
  })
})
