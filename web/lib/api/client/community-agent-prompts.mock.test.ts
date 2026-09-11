import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCommunityAgentPrompts,
  fetchCommunityAgentPrompt,
  createCommunityAgentPrompt,
  updateCommunityAgentPrompt,
  deleteCommunityAgentPrompt,
  allocateCommunityAgentPromptSlot,
  deallocateCommunityAgentPromptSlot,
  fetchCommunityAgentPromptHistory,
  simulateCommunityAutomod,
} from './community-agent-prompts'

const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockPost: vi.fn<VitestLooseMock>(),
  mockPatch: vi.fn<VitestLooseMock>(),
  mockDelete: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
        post: mockPost,
        patch: mockPatch,
        delete: mockDelete,
      },
    }) as unknown as typeof import('./instance'),
)

describe('community-agent-prompts client api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPatch.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ community_agent_prompts: [] })
    mockPost.mockResolvedValue({ community_agent_prompt: { id: 'prompt-1' } })
    mockPatch.mockResolvedValue({ community_agent_prompt: { id: 'prompt-1' } })
    mockDelete.mockResolvedValue(undefined)
  })

  describe('fetchCommunityAgentPrompts', () => {
    it('calls GET /api/v1/communities/:slug/agent-prompts', async () => {
      const response = { community_agent_prompts: [], slot_info: { available: true } }
      mockGet.mockResolvedValueOnce(response)

      const result = await fetchCommunityAgentPrompts('my-community')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my-community/agent-prompts')
      expect(result).toBe(response)
    })

    it('encodes slug in URL', async () => {
      await fetchCommunityAgentPrompts('my community')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my%20community/agent-prompts')
    })
  })

  describe('fetchCommunityAgentPrompt', () => {
    it('calls GET /api/v1/communities/:slug/agent-prompts/:promptId', async () => {
      mockGet.mockResolvedValueOnce({ community_agent_prompt: { id: 'prompt-1' } })
      await fetchCommunityAgentPrompt('my-community', 'prompt-1')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/prompt-1',
      )
    })
  })

  describe('createCommunityAgentPrompt', () => {
    it('calls POST /api/v1/communities/:slug/agent-prompts with body', async () => {
      const body = { prompt: 'You are a moderation agent.' }
      await createCommunityAgentPrompt('my-community', body)
      expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/my-community/agent-prompts', body)
    })
  })

  describe('updateCommunityAgentPrompt', () => {
    it('calls PATCH /api/v1/communities/:slug/agent-prompts/:promptId with body', async () => {
      const body = { prompt: 'Updated prompt.' }
      await updateCommunityAgentPrompt('my-community', 'prompt-1', body)
      expect(mockPatch).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/prompt-1',
        body,
      )
    })
  })

  describe('deleteCommunityAgentPrompt', () => {
    it('calls DELETE /api/v1/communities/:slug/agent-prompts/:promptId', async () => {
      await deleteCommunityAgentPrompt('my-community', 'prompt-1')
      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/prompt-1',
      )
    })
  })

  describe('allocateCommunityAgentPromptSlot', () => {
    it('calls POST /api/v1/communities/:slug/agent-prompts/:promptId/allocations', async () => {
      mockPost.mockResolvedValueOnce(undefined)
      await allocateCommunityAgentPromptSlot('my-community', 'prompt-1')
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/prompt-1/allocations',
      )
    })
  })

  describe('deallocateCommunityAgentPromptSlot', () => {
    it('calls DELETE /api/v1/communities/:slug/agent-prompts/:promptId/allocations', async () => {
      await deallocateCommunityAgentPromptSlot('my-community', 'prompt-1')
      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/prompt-1/allocations',
      )
    })
  })

  describe('fetchCommunityAgentPromptHistory', () => {
    it('calls GET /api/v1/communities/:slug/agent-prompts/history with no options', async () => {
      mockGet.mockResolvedValueOnce({ entries: [], next_cursor: null })
      await fetchCommunityAgentPromptHistory('my-community')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/history',
        { searchParams: {} },
      )
    })

    it('passes promptId as searchParam when provided', async () => {
      mockGet.mockResolvedValueOnce({ entries: [], next_cursor: null })
      await fetchCommunityAgentPromptHistory('my-community', { promptId: 'prompt-1' })
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/history',
        { searchParams: { promptId: 'prompt-1' } },
      )
    })

    it('passes before as searchParam when provided', async () => {
      mockGet.mockResolvedValueOnce({ entries: [], next_cursor: null })
      await fetchCommunityAgentPromptHistory('my-community', { before: 'cursor-abc' })
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/agent-prompts/history',
        { searchParams: { before: 'cursor-abc' } },
      )
    })
  })

  describe('simulateCommunityAutomod', () => {
    it('calls POST /api/v1/communities/:slug/automod/simulate with body', async () => {
      const body = { prompt_id: 'prompt-1', time_window_hours: 168, limit: 25 }
      mockPost.mockResolvedValueOnce({ simulation: { sample_count: 0 }, results: [] })
      await simulateCommunityAutomod('my-community', body)
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/automod/simulate',
        body,
      )
    })
  })
})
