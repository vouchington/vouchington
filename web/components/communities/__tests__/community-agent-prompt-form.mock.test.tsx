import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { CommunityAgentPromptForm } from '../community-agent-prompt-form'

const mocks = vi.hoisted(() => ({
  createCommunityAgentPrompt: vi.fn<VitestLooseMock>(),
  onError: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/community-agent-prompts'), () => ({
  createCommunityAgentPrompt: mocks.createCommunityAgentPrompt,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mocks.onError,
  onSuccess: mocks.onSuccess,
}))

const COMMUNITY_SLUG = 'credit-cards'
const mockNav = createNavMock()

describe('CommunityAgentPromptForm', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('renders the form', () => {
    render(<CommunityAgentPromptForm communitySlug={COMMUNITY_SLUG} />)
    expect(document.querySelector('[data-pw="community-agent-prompt-form"]')).not.toBeNull()
    expect(document.querySelector('textarea[aria-label="New agent prompt"]')).not.toBeNull()
    expect(document.querySelector('button[type="submit"]')).not.toBeNull()
  })

  it('shows a validation error when submitting an empty prompt', async () => {
    render(<CommunityAgentPromptForm communitySlug={COMMUNITY_SLUG} />)

    fireEvent.submit(document.querySelector('[data-pw="community-agent-prompt-form"]')!)

    await waitFor(() => {
      expect(document.querySelector('.text-destructive')).not.toBeNull()
    })
    expect(document.querySelector('.text-destructive')!.textContent).toBe('Prompt is required')
    expect(mocks.createCommunityAgentPrompt).not.toHaveBeenCalled()
  })

  it('shows a validation error when prompt exceeds 10000 characters', async () => {
    render(<CommunityAgentPromptForm communitySlug={COMMUNITY_SLUG} />)

    const longText = 'a'.repeat(10_001)
    fireEvent.change(document.querySelector('textarea')!, { target: { value: longText } })
    fireEvent.submit(document.querySelector('[data-pw="community-agent-prompt-form"]')!)

    await waitFor(() => {
      expect(document.querySelector('.text-destructive')).not.toBeNull()
    })
    expect(document.querySelector('.text-destructive')!.textContent).toBe(
      'Prompt must be 10,000 characters or fewer',
    )
    expect(mocks.createCommunityAgentPrompt).not.toHaveBeenCalled()
  })

  it('calls onError when createCommunityAgentPrompt rejects', async () => {
    mocks.createCommunityAgentPrompt.mockRejectedValueOnce(new Error('API error'))

    render(<CommunityAgentPromptForm communitySlug={COMMUNITY_SLUG} />)

    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'Test prompt' } })
    fireEvent.submit(document.querySelector('[data-pw="community-agent-prompt-form"]')!)

    await waitFor(() => {
      expect(mocks.onError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to create prompt',
      })
    })
  })

  it('calls createCommunityAgentPrompt on submit with valid input', async () => {
    mocks.createCommunityAgentPrompt.mockResolvedValueOnce({
      community_agent_prompt: {
        id: 'prompt-1',
        community_id: 'c-1',
        created_by_id: 'u-1',
        agent_id: 'a-1',
        prompt: 'Test prompt',
        model_name: 'model',
        model_provider: 'provider',
        slot_allocated: false,
        on_flag_action: 'none',
        activated_at: null,
        deactivated_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        deleted_at: null,
        deleted_by_id: null,
      },
    })

    render(<CommunityAgentPromptForm communitySlug={COMMUNITY_SLUG} />)

    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'Test prompt' } })
    fireEvent.submit(document.querySelector('[data-pw="community-agent-prompt-form"]')!)

    await waitFor(() => {
      expect(mocks.createCommunityAgentPrompt).toHaveBeenCalledWith(COMMUNITY_SLUG, {
        prompt: 'Test prompt',
      })
    })
    expect(mocks.onSuccess).toHaveBeenCalledWith('Prompt created')
    expect(mockNav.refresh).toHaveBeenCalled()
  })
})
