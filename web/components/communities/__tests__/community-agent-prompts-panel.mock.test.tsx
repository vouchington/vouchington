import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type { CommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import { CommunityAgentPromptsPanel } from '../community-agent-prompts-panel'

const mocks = vi.hoisted(() => ({
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
  createCommunityAgentPrompt: mocks.createCommunityAgentPrompt,
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
    prompt: 'My test prompt',
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

describe('CommunityAgentPromptsPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('renders the panel', () => {
    render(
      <CommunityAgentPromptsPanel
        prompts={[]}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(document.querySelector('[data-pw="community-agent-prompts-panel"]')).not.toBeNull()
  })

  it('renders empty state when no prompts are provided', () => {
    render(
      <CommunityAgentPromptsPanel
        prompts={[]}
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
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(document.querySelectorAll('[data-pw="community-agent-prompt-item"]')).toHaveLength(2)
  })

  it('renders the create form', () => {
    render(
      <CommunityAgentPromptsPanel
        prompts={[]}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    expect(document.querySelector('[data-pw="community-agent-prompt-form"]')).not.toBeNull()
  })
})
