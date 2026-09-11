import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import { clientApi } from '@/lib/api/client/instance'
import {
  createDirectConversation,
  getMyMessagesClient,
  getDirectMessageThreadClient,
  sendDirectMessage,
  getConversationParticipantsClient,
  addConversationParticipant,
  removeConversationParticipant,
  updateConversationParticipantPolicy,
} from '@/lib/api/client/messages'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)
const mockDelete = vi.mocked(clientApi.delete)
const mockPatch = vi.mocked(clientApi.patch)

describe('messages client api helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('createDirectConversation', () => {
    it('POSTs to /api/v1/my/messages with user_ids array', async () => {
      const conversation = { id: 'conv-1', channel_type: 'direct_message' }
      mockPost.mockResolvedValueOnce({ conversation })

      const result = await createDirectConversation(['user-123'])

      expect(mockPost).toHaveBeenCalledWith('/api/v1/my/messages', { user_ids: ['user-123'] })
      expect(result).toEqual({ conversation })
    })
  })

  describe('addConversationParticipant', () => {
    it('POSTs to /api/v1/my/messages/:id/participants with user_id', async () => {
      const participant = { id: 'part-1', user_id: 'user-456', role: 'member' }
      mockPost.mockResolvedValueOnce({ participant })

      const result = await addConversationParticipant('conv-abc', 'user-456')

      expect(mockPost).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/participants', {
        user_id: 'user-456',
      })
      expect(result).toEqual({ participant })
    })
  })

  describe('removeConversationParticipant', () => {
    it('DELETEs /api/v1/my/messages/:id/participants/:userId', async () => {
      mockDelete.mockResolvedValueOnce(undefined)

      await removeConversationParticipant('conv-abc', 'user-456')

      expect(mockDelete).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/participants/user-456')
    })
  })

  describe('updateConversationParticipantPolicy', () => {
    it('PATCHes /api/v1/my/messages/:id with policy', async () => {
      mockPatch.mockResolvedValueOnce({ participant_add_policy: 'all_members' })

      const result = await updateConversationParticipantPolicy('conv-abc', 'all_members')

      expect(mockPatch).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc', {
        participant_add_policy: 'all_members',
      })
      expect(result).toEqual({ participant_add_policy: 'all_members' })
    })
  })

  describe('getMyMessagesClient', () => {
    it('GETs /api/v1/my/messages', async () => {
      const response = {
        results: [],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      }
      mockGet.mockResolvedValueOnce(response)

      const result = await getMyMessagesClient()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages', {
        searchParams: { limit: 50, after: undefined },
      })
      expect(result).toBe(response)
    })
  })

  describe('getDirectMessageThreadClient', () => {
    it('GETs /api/v1/my/messages/:id/messages', async () => {
      const response = {
        results: [],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      }
      mockGet.mockResolvedValueOnce(response)

      const result = await getDirectMessageThreadClient('conv-abc')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/messages', {
        searchParams: { limit: 50, after: undefined },
      })
      expect(result).toBe(response)
    })

    it('forwards the opaque after cursor and requested limit', async () => {
      mockGet.mockResolvedValueOnce({
        results: [],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      })

      await getDirectMessageThreadClient('conv-abc', { after: 'opaque-cursor', limit: 25 })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/messages', {
        searchParams: { limit: 25, after: 'opaque-cursor' },
      })
    })
  })

  describe('sendDirectMessage', () => {
    it('POSTs to /api/v1/my/messages/:id/messages with text', async () => {
      const message = {
        id: 'msg-1',
        conversation_id: 'conv-abc',
        body_text: 'Hello!',
        created_at: '2026-01-01T00:00:00Z',
      }
      mockPost.mockResolvedValueOnce({ message })

      const result = await sendDirectMessage('conv-abc', 'Hello!')

      expect(mockPost).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/messages', {
        text: 'Hello!',
      })
      expect(result).toEqual({ message })
    })
  })

  describe('getConversationParticipantsClient', () => {
    it('GETs /api/v1/my/messages/:id/participants', async () => {
      const response = { data: [{ user_id: 'user-1' }] }
      mockGet.mockResolvedValueOnce(response)

      const result = await getConversationParticipantsClient('conv-abc')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/participants')
      expect(result).toBe(response)
    })

    it('forwards participant pagination options', async () => {
      mockGet.mockResolvedValueOnce({ results: [], page_info: {} })

      await getConversationParticipantsClient('conv-abc', { after: 'opaque', limit: 20 })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/participants', {
        searchParams: { after: 'opaque', limit: 20 },
      })
    })
  })
})
