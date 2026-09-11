import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCommunityAgentPrompts, getCommunityAgentPromptHistory } from './community-agent-prompts'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('community-agent-prompts server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ community_agent_prompts: [] })
  })

  describe('getCommunityAgentPrompts', () => {
    it('calls GET /api/v1/communities/:idOrSlug/agent-prompts', async () => {
      await getCommunityAgentPrompts('my-community')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my-community/agent-prompts')
    })

    it('encodes idOrSlug in the URL', async () => {
      await getCommunityAgentPrompts('my community')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my%20community/agent-prompts')
    })
  })

  describe('getCommunityAgentPromptHistory', () => {
    it('calls GET /api/v1/communities/:idOrSlug/agent-prompts/history with no options', async () => {
      mockGet.mockResolvedValueOnce({ entries: [], next_cursor: null })
      await getCommunityAgentPromptHistory('my-community')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/history',
        { searchParams: {} },
      )
    })

    it('passes promptId in searchParams when provided', async () => {
      mockGet.mockResolvedValueOnce({ entries: [], next_cursor: null })
      await getCommunityAgentPromptHistory('my-community', { promptId: 'prompt-1' })
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/history',
        { searchParams: { promptId: 'prompt-1' } },
      )
    })

    it('passes before in searchParams when provided', async () => {
      mockGet.mockResolvedValueOnce({ entries: [], next_cursor: null })
      await getCommunityAgentPromptHistory('my-community', { before: 'cursor-xyz' })
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/history',
        { searchParams: { before: 'cursor-xyz' } },
      )
    })
  })
})
