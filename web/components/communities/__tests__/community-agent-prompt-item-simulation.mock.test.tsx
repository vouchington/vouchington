import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import { CommunityAgentPromptItem } from '../community-agent-prompt-item'

const mocks = vi.hoisted(() => ({
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
  updateCommunityAgentPrompt: mocks.updateCommunityAgentPrompt,
  deleteCommunityAgentPrompt: mocks.deleteCommunityAgentPrompt,
  allocateCommunityAgentPromptSlot: mocks.allocateCommunityAgentPromptSlot,
  deallocateCommunityAgentPromptSlot: mocks.deallocateCommunityAgentPromptSlot,
  simulateCommunityAutomod: mocks.simulateCommunityAutomod,
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
    prompt: 'My test prompt text',
    model_name: 'gpt-4',
    model_provider: 'openai',
    slot_allocated: false,
    on_flag_action: 'none',
    activated_at: null,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    deleted_by_id: null,
    ...overrides,
  }
}

describe('CommunityAgentPromptItem simulation', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('clicking Test shows the simulation panel', () => {
    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const testBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Test',
    )!
    fireEvent.click(testBtn)
    expect(document.querySelector('[data-pw="community-agent-prompt-test-panel"]')).not.toBeNull()
  })

  it('runs an automod simulation and renders projected matches', async () => {
    mocks.simulateCommunityAutomod.mockResolvedValueOnce({
      simulation: {
        prompt_id: 'prompt-1',
        time_window_hours: 168,
        sample_count: 2,
        would_flag_count: 1,
        would_unpublish_count: 0,
        false_positive_estimate: {
          historical_flagged_count: 0,
          historical_approved_count: 0,
          rate: null,
        },
      },
      results: [
        {
          post_id: 'post-1',
          title: 'Matched post',
          post_type: 'discussion',
          approved_at: '2026-01-01T00:00:00.000Z',
          content_excerpt: 'Matched post body',
          flagged: true,
          reason: 'Matches test prompt',
          would_unpublish: false,
        },
      ],
    })

    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const testBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Test',
    )!
    fireEvent.click(testBtn)
    const runBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Run Test',
    )!
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(mocks.simulateCommunityAutomod).toHaveBeenCalledWith(COMMUNITY_SLUG, {
        prompt_id: 'prompt-1',
        prompt: undefined,
        time_window_hours: 168,
        limit: 25,
      })
    })
    expect(document.querySelector('[data-pw="community-agent-prompt-test-results"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Matches test prompt')
  })

  it('clears stale simulation results when the draft prompt changes', async () => {
    mocks.simulateCommunityAutomod.mockResolvedValueOnce({
      simulation: {
        prompt_id: 'prompt-1',
        time_window_hours: 168,
        sample_count: 1,
        would_flag_count: 1,
        would_unpublish_count: 0,
        false_positive_estimate: null,
      },
      results: [
        {
          post_id: 'post-1',
          title: 'Matched post',
          post_type: 'discussion',
          approved_at: '2026-01-01T00:00:00.000Z',
          content_excerpt: 'Matched post body',
          flagged: true,
          reason: 'Old simulation result',
          would_unpublish: false,
        },
      ],
    })

    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const testBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Test',
    )!
    fireEvent.click(testBtn)
    const runBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Run Test',
    )!
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(document.body.textContent).toContain('Old simulation result')
    })

    fireEvent.change(document.querySelector('textarea')!, {
      target: { value: 'Changed draft prompt' },
    })

    expect(document.querySelector('[data-pw="community-agent-prompt-test-results"]')).toBeNull()
    expect(document.body.textContent).not.toContain('Old simulation result')
  })

  it('validates prompt text before running a simulation', () => {
    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const testBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Test',
    )!
    fireEvent.click(testBtn)
    fireEvent.change(document.querySelector('textarea')!, { target: { value: '   ' } })
    const runBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Run Test',
    )!
    fireEvent.click(runBtn)

    expect(document.body.textContent).toContain('Prompt is required')
    expect(mocks.simulateCommunityAutomod).not.toHaveBeenCalled()
  })

  it('reports failed simulations through onError', async () => {
    mocks.simulateCommunityAutomod.mockRejectedValueOnce(new Error('simulation failed'))

    render(
      <CommunityAgentPromptItem
        prompt={prompt({})}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    const testBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Test',
    )!
    fireEvent.click(testBtn)
    const runBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Run Test',
    )!
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(mocks.onError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to run simulation',
      })
    })
  })
})
