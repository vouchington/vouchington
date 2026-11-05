import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import { CommunityAgentPromptsPanel } from '../community-agent-prompts-panel'

const mocks = vi.hoisted(() => ({
  fetchCommunityAgentPrompts: vi.fn<VitestLooseMock>(),
  createCommunityAgentPrompt: vi.fn<VitestLooseMock>(),
  updateCommunityAgentPrompt: vi.fn<VitestLooseMock>(),
  deleteCommunityAgentPrompt: vi.fn<VitestLooseMock>(),
  allocateCommunityAgentPromptSlot: vi.fn<VitestLooseMock>(),
  deallocateCommunityAgentPromptSlot: vi.fn<VitestLooseMock>(),
  simulateCommunityAutomod: vi.fn<VitestLooseMock>(),
  onError: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/community-agent-prompts'), () => ({
  fetchCommunityAgentPrompts: mocks.fetchCommunityAgentPrompts,
  createCommunityAgentPrompt: mocks.createCommunityAgentPrompt,
  updateCommunityAgentPrompt: mocks.updateCommunityAgentPrompt,
  deleteCommunityAgentPrompt: mocks.deleteCommunityAgentPrompt,
  allocateCommunityAgentPromptSlot: mocks.allocateCommunityAgentPromptSlot,
  deallocateCommunityAgentPromptSlot: mocks.deallocateCommunityAgentPromptSlot,
  simulateCommunityAutomod: mocks.simulateCommunityAutomod,
}))

vi.mock(import('../community-agent-prompt-item'), () => ({
  CommunityAgentPromptItem: ({
    prompt: item,
    onPromptUpdated,
  }: {
    prompt: CommunityAgentPrompt
    onPromptUpdated?: (updated: CommunityAgentPrompt | null) => void
  }) => (
    <article data-pw='community-agent-prompt-item'>
      <span>{item.prompt}</span>
      <button
        type='button'
        onClick={() => onPromptUpdated?.({ ...item, prompt: 'Edited older prompt' })}
      >
        Edit {item.id}
      </button>
    </article>
  ),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mocks.onError,
  onSuccess: mocks.onSuccess,
}))

const COMMUNITY_SLUG = 'credit-cards'
const mockNav = createNavMock()

function prompt(overrides: Partial<CommunityAgentPrompt>): CommunityAgentPrompt {
  return {
    id: 'prompt-1',
    community_id: 'c-1',
    created_by_id: 'u-1',
    agent_id: 'a-1',
    prompt: 'My test prompt',
    model_name: 'gpt-4',
    model_provider: 'openai',
    is_slot_allocated: false,
    activated_at: null,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    deleted_by_id: null,
    ...overrides,
  }
}

describe('CommunityAgentPromptsPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('renders the panel', () => {
    render(
      <CommunityAgentPromptsPanel
        prompts={[]}
        pageInfo={{ has_next_page: false, start_cursor: null, end_cursor: null }}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(document.querySelector('[data-pw="community-agent-prompts-panel"]')).not.toBeNull()
  })

  it('renders empty state when no prompts are provided', () => {
    render(
      <CommunityAgentPromptsPanel
        prompts={[]}
        pageInfo={{ has_next_page: false, start_cursor: null, end_cursor: null }}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(document.querySelector('[data-pw="community-agent-prompt-list"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="community-agent-prompt-item"]')).toBeNull()
    expect(document.body.textContent).toContain('No agent prompts yet.')
  })

  it('renders prompt items when prompts are provided', () => {
    render(
      <CommunityAgentPromptsPanel
        prompts={[
          prompt({ id: 'p-1', prompt: 'First prompt' }),
          prompt({ id: 'p-2', prompt: 'Second prompt' }),
        ]}
        pageInfo={{ has_next_page: false, start_cursor: null, end_cursor: null }}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(document.querySelectorAll('[data-pw="community-agent-prompt-item"]')).toHaveLength(2)
  })

  it('renders the create form', () => {
    render(
      <CommunityAgentPromptsPanel
        prompts={[]}
        pageInfo={{ has_next_page: false, start_cursor: null, end_cursor: null }}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(document.querySelector('[data-pw="community-agent-prompt-form"]')).not.toBeNull()
  })

  it('retries continuation, deduplicates pages, and preserves edits on older pages', async () => {
    const first = prompt({ id: 'first', prompt: 'Newest prompt' })
    const older = prompt({ id: 'older', prompt: 'Older prompt' })
    const last = prompt({ id: 'last', prompt: 'Oldest prompt' })
    mocks.fetchCommunityAgentPrompts
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({
        community_agent_prompts: [first, older],
        page_info: { has_next_page: true, start_cursor: 'second-start', end_cursor: 'second-end' },
      })
      .mockResolvedValueOnce({
        community_agent_prompts: [older, last],
        page_info: { has_next_page: false, start_cursor: 'last-start', end_cursor: 'last-end' },
      })
    render(
      <CommunityAgentPromptsPanel
        prompts={[first]}
        pageInfo={{ has_next_page: true, start_cursor: 'first-start', end_cursor: 'first-end' }}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Older prompt')).toBeVisible()
    expect(screen.getAllByText('Newest prompt')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Edit older' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Oldest prompt')).toBeVisible()
    expect(screen.getByText('Edited older prompt')).toBeVisible()
    expect(screen.queryByText('Older prompt')).toBeNull()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull())
    expect(mocks.fetchCommunityAgentPrompts).toHaveBeenNthCalledWith(1, COMMUNITY_SLUG, {
      after: 'first-end',
    })
    expect(mocks.fetchCommunityAgentPrompts).toHaveBeenNthCalledWith(2, COMMUNITY_SLUG, {
      after: 'first-end',
    })
    expect(mocks.fetchCommunityAgentPrompts).toHaveBeenNthCalledWith(3, COMMUNITY_SLUG, {
      after: 'second-end',
    })
  })

  it('resets loaded pages when the server response key changes', async () => {
    mocks.fetchCommunityAgentPrompts.mockResolvedValueOnce({
      community_agent_prompts: [prompt({ id: 'older', prompt: 'Loaded older prompt' })],
      page_info: { has_next_page: false, start_cursor: 'older', end_cursor: 'older' },
    })
    const { rerender } = render(
      <CommunityAgentPromptsPanel
        key='initial-response'
        prompts={[prompt({ prompt: 'Initial prompt' })]}
        pageInfo={{ has_next_page: true, start_cursor: 'first', end_cursor: 'first' }}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Loaded older prompt')).toBeVisible()
    rerender(
      <CommunityAgentPromptsPanel
        key='refreshed-response'
        prompts={[prompt({ prompt: 'Refreshed prompt' })]}
        pageInfo={{ has_next_page: false, start_cursor: 'new', end_cursor: 'new' }}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(screen.getByText('Refreshed prompt')).toBeVisible()
    expect(screen.queryByText('Loaded older prompt')).toBeNull()
  })
})
