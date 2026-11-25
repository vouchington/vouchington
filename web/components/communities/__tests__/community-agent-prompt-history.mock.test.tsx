import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityAgentPromptHistoryEntry } from '@/lib/api/client/community-agent-prompts'
import { CommunityAgentPromptHistory } from '../community-agent-prompt-history'

const mocks = vi.hoisted(() => ({
  fetchCommunityAgentPromptHistory: vi.fn<VitestLooseMock>(),
  onError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/community-agent-prompts'), () => ({
  fetchCommunityAgentPromptHistory: mocks.fetchCommunityAgentPromptHistory,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mocks.onError,
  onSuccess: vi.fn<VitestLooseMock>(),
}))

const COMMUNITY_SLUG = 'credit-cards'

function entry(
  overrides: Partial<CommunityAgentPromptHistoryEntry>,
): CommunityAgentPromptHistoryEntry {
  return {
    id: 'entry-1',
    agent_prompt_id: 'prompt-1',
    community_id: 'c-1',
    action: 'created',
    changed_by: { id: 'u-1', username: 'alice' },
    previous_fields: {},
    next_fields: { prompt: 'Hello' },
    changed_fields: {},
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('CommunityAgentPromptHistory', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('renders the card wrapper', () => {
    render(
      <CommunityAgentPromptHistory
        initialEntries={[]}
        initialNextCursor={null}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(document.querySelector('[data-pw="community-agent-prompt-history"]')).not.toBeNull()
  })

  it('renders empty state when no entries are provided', () => {
    render(
      <CommunityAgentPromptHistory
        initialEntries={[]}
        initialNextCursor={null}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(document.querySelector('[data-pw="community-agent-prompt-history-entry"]')).toBeNull()
    expect(
      document.querySelector('[data-pw="community-agent-prompt-history-load-more"]'),
    ).toBeNull()
  })

  it('renders history entries when provided', () => {
    render(
      <CommunityAgentPromptHistory
        initialEntries={[
          entry({ id: 'e-1', action: 'created' }),
          entry({ id: 'e-2', action: 'updated' }),
        ]}
        initialNextCursor={null}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(
      document.querySelectorAll('[data-pw="community-agent-prompt-history-entry"]'),
    ).toHaveLength(2)
  })

  it('shows a load-more button when cursor is non-null', () => {
    render(
      <CommunityAgentPromptHistory
        initialEntries={[entry({})]}
        initialNextCursor='cursor-abc'
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(
      document.querySelector('[data-pw="community-agent-prompt-history-load-more"]'),
    ).not.toBeNull()
  })

  it('advances through an empty response using the next cursor', async () => {
    mocks.fetchCommunityAgentPromptHistory
      .mockResolvedValueOnce({ entries: [], next_cursor: 'second-cursor' })
      .mockResolvedValueOnce({ entries: [], next_cursor: null })
    render(
      <CommunityAgentPromptHistory
        initialEntries={[]}
        initialNextCursor='first-cursor'
        communitySlug={COMMUNITY_SLUG}
      />,
    )

    expect(screen.queryByText('No changes recorded')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(mocks.fetchCommunityAgentPromptHistory).toHaveBeenNthCalledWith(2, COMMUNITY_SLUG, {
      before: 'second-cursor',
    })
    expect(await screen.findByText('No changes recorded')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('hides load-more button when cursor is null', () => {
    render(
      <CommunityAgentPromptHistory
        initialEntries={[entry({})]}
        initialNextCursor={null}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(
      document.querySelector('[data-pw="community-agent-prompt-history-load-more"]'),
    ).toBeNull()
  })

  it('renders changed_fields diff for an updated entry', () => {
    render(
      <CommunityAgentPromptHistory
        initialEntries={[
          entry({
            action: 'updated',
            changed_fields: { prompt: { previous: 'old text', next: 'new text' } },
          }),
        ]}
        initialNextCursor={null}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(
      document.querySelectorAll('[data-pw="community-agent-prompt-history-entry"]'),
    ).toHaveLength(1)
    // ChangedFieldsTable renders field names
    expect(document.body.textContent).toContain('prompt')
  })

  it('calls onError when load-more fails', async () => {
    mocks.fetchCommunityAgentPromptHistory.mockRejectedValueOnce(new Error('Network error'))

    render(
      <CommunityAgentPromptHistory
        initialEntries={[entry({})]}
        initialNextCursor='cursor-abc'
        communitySlug={COMMUNITY_SLUG}
      />,
    )

    fireEvent.click(document.querySelector('[data-pw="community-agent-prompt-history-load-more"]')!)

    await waitFor(() => {
      expect(mocks.onError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to load history',
      })
    })
  })

  it('clicking load-more calls fetchCommunityAgentPromptHistory', async () => {
    mocks.fetchCommunityAgentPromptHistory.mockResolvedValueOnce({
      entries: [entry({ id: 'e-2', action: 'deleted' })],
      next_cursor: null,
    })

    render(
      <CommunityAgentPromptHistory
        initialEntries={[entry({ id: 'e-1' })]}
        initialNextCursor='cursor-abc'
        communitySlug={COMMUNITY_SLUG}
      />,
    )

    fireEvent.click(document.querySelector('[data-pw="community-agent-prompt-history-load-more"]')!)

    await waitFor(() => {
      expect(mocks.fetchCommunityAgentPromptHistory).toHaveBeenCalledWith(COMMUNITY_SLUG, {
        before: 'cursor-abc',
      })
    })
    expect(
      document.querySelectorAll('[data-pw="community-agent-prompt-history-entry"]'),
    ).toHaveLength(2)
  })
})
