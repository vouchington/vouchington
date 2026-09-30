import type { CommunityAgentPrompt } from '@/types/api-responses'
import { vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'

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

function resetCommunityAgentPromptItemMocks(): void {
  vi.clearAllMocks()
  mockNav.reset()
}

export { COMMUNITY_SLUG, mockNav, mocks, prompt, resetCommunityAgentPromptItemMocks }
