import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { makeCommunityAiAgentResponse } from '@/test-helpers/api-responses'
import { CommunityAiAgentsPanel } from '../community-ai-agents-panel'
import type { CommunityAiAgent } from '@/types/api-responses'

const mocks = vi.hoisted(() => ({
  disableCommunityAiAgent: vi.fn<VitestLooseMock>(),
  enableCommunityAiAgent: vi.fn<VitestLooseMock>(),
  onError: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client'), () => ({
  disableCommunityAiAgent: mocks.disableCommunityAiAgent,
  enableCommunityAiAgent: mocks.enableCommunityAiAgent,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mocks.onError,
  onSuccess: mocks.onSuccess,
}))

const COMMUNITY_SLUG = 'credit-cards'
const mockNav = createNavMock()

function agent(overrides: Partial<CommunityAiAgent>): CommunityAiAgent {
  return {
    slug: 'self-promotion',
    agent_id: 'agent-1',
    system_user_id: 'system-user-1',
    system_username: 'self-promotion',
    label_topic_slugs: ['self-promotion'],
    on_flag_action: 'review_queue',
    enabled: false,
    always_on: false,
    enabled_at: null,
    enabled_by_id: null,
    entitlement: { allowed: true, reason: null },
    ...overrides,
  }
}

describe('CommunityAiAgentsPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('renders the fixed-label community AI agents', () => {
    render(
      <CommunityAiAgentsPanel
        agents={[
          agent({ slug: 'self-promotion', system_username: 'self-promotion' }),
          agent({
            slug: 'marketplace',
            system_username: 'marketplace',
            label_topic_slugs: ['buying', 'selling', 'trade', 'for-hire', 'hiring'],
          }),
        ]}
        communitySlug={COMMUNITY_SLUG}
      />,
    )

    expect(document.querySelector('[data-pw="community-ai-agents-panel"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-pw="community-ai-agent-row"]')).toHaveLength(2)
    expect(
      document.querySelector(
        '[data-pw="community-ai-agent-toggle"][data-agent-slug="marketplace"]',
      ),
    ).not.toBeNull()
  })

  it('enables an agent for the current community', async () => {
    const enabledAgent = agent({ enabled: true, enabled_at: '2026-06-01T12:00:00.000Z' })
    mocks.enableCommunityAiAgent.mockResolvedValueOnce(
      makeCommunityAiAgentResponse({ communityAiAgent: enabledAgent }),
    )

    render(
      <CommunityAiAgentsPanel
        agents={[agent({})]}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    fireEvent.click(
      document.querySelector(
        '[data-pw="community-ai-agent-toggle"][data-agent-slug="self-promotion"]',
      )!,
    )

    await waitFor(() => {
      expect(mocks.enableCommunityAiAgent).toHaveBeenCalledWith(COMMUNITY_SLUG, 'self-promotion')
    })
    expect(mocks.onSuccess).toHaveBeenCalledWith('Self Promotion enabled')
    expect(mockNav.refresh).toHaveBeenCalled()
  })

  it('disables an enabled agent for the current community', async () => {
    const disabledAgent = agent({ enabled: false })
    mocks.disableCommunityAiAgent.mockResolvedValueOnce(
      makeCommunityAiAgentResponse({ communityAiAgent: disabledAgent }),
    )

    render(
      <CommunityAiAgentsPanel
        agents={[agent({ enabled: true })]}
        communitySlug={COMMUNITY_SLUG}
      />,
    )
    fireEvent.click(
      document.querySelector(
        '[data-pw="community-ai-agent-toggle"][data-agent-slug="self-promotion"]',
      )!,
    )

    await waitFor(() => {
      expect(mocks.disableCommunityAiAgent).toHaveBeenCalledWith(COMMUNITY_SLUG, 'self-promotion')
    })
    expect(mocks.onSuccess).toHaveBeenCalledWith('Self Promotion disabled')
    expect(mockNav.refresh).toHaveBeenCalled()
  })

  it('disables toggles when the entitlement denies access', () => {
    render(
      <CommunityAiAgentsPanel
        agents={[
          agent({
            entitlement: {
              allowed: false,
              reason: 'Community moderator access is required.',
            },
          }),
        ]}
        communitySlug={COMMUNITY_SLUG}
      />,
    )

    const toggle = document.querySelector(
      '[data-pw="community-ai-agent-toggle"][data-agent-slug="self-promotion"]',
    )
    expect(toggle).toHaveProperty('disabled', true)
    expect(
      document.querySelector('[data-pw="community-ai-agent-entitlement-reason"]'),
    ).not.toBeNull()
  })
})
