import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('../instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('../instance'),
)

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

vi.mock(import('@/lib/api/return-null-for-missing-entity'), () => ({
  returnNullForMissingEntity: vi.fn<VitestLooseMock>(async (promise: Promise<unknown>) => promise),
}))

import {
  getConversation,
  getConversationParticipants,
  getMyMessages,
  getMyMessageThread,
} from '../messages'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'

const mockReturnNullForMissingEntity = vi.mocked(returnNullForMissingEntity)

describe('messages server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockReturnNullForMissingEntity.mockReset()
    mockReturnNullForMissingEntity.mockImplementation(async (promise: Promise<unknown>) => promise)
  })

  describe('getMyMessages', () => {
    it('GETs /api/v1/my/messages and returns the response', async () => {
      const response = {
        results: [{ id: 'conv-1', channel_type: 'direct_message' }],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      }
      mockGet.mockResolvedValueOnce(response)

      const result = await getMyMessages()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages', undefined)
      expect(result).toBe(response)
    })

    it('passes through options (headers) to serverApi.get', async () => {
      mockGet.mockResolvedValueOnce({ results: [], page_info: {} })

      await getMyMessages({ headers: { cookie: 'session=abc' } })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages', {
        headers: { cookie: 'session=abc' },
      })
    })
  })

  describe('getMyMessageThread', () => {
    it('GETs /api/v1/my/messages/:id/messages', async () => {
      const response = {
        results: [{ id: 'msg-1', body_text: 'Hello' }],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      }
      mockGet.mockResolvedValueOnce(response)

      const result = await getMyMessageThread('conv-abc')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/messages', undefined)
      expect(result).toBe(response)
    })

    it('returns null when the conversation is not found (missing entity)', async () => {
      mockReturnNullForMissingEntity.mockResolvedValueOnce(null)
      mockGet.mockResolvedValueOnce({ results: [], page_info: {} })

      const result = await getMyMessageThread('missing-conv')

      expect(result).toBeNull()
    })

    it('passes through options (headers) to serverApi.get', async () => {
      mockGet.mockResolvedValueOnce({ results: [], page_info: {} })

      await getMyMessageThread('conv-abc', { headers: { cookie: 'session=xyz' } })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/messages', {
        headers: { cookie: 'session=xyz' },
      })
    })
  })

  describe('getConversation', () => {
    it('GETs /api/v1/my/messages/:id and unwraps the conversation field', async () => {
      const conversation = {
        id: 'conv-abc',
        channel_type: 'direct_message',
        participant_add_policy: 'owner_only',
        created_by_id: 'u-1',
      }
      mockGet.mockResolvedValueOnce({ conversation })

      const result = await getConversation('conv-abc')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc', undefined)
      expect(result).toBe(conversation)
    })

    it('returns null when missing entity (uses returnNullForMissingEntity)', async () => {
      mockReturnNullForMissingEntity.mockResolvedValueOnce(null)
      mockGet.mockResolvedValueOnce({})

      const result = await getConversation('missing-conv')

      expect(result).toBeNull()
    })
  })

  describe('getConversationParticipants', () => {
    it('GETs /api/v1/my/messages/:id/participants', async () => {
      const response = {
        results: [
          {
            id: 'p-1',
            conversation_id: 'conv-abc',
            user_id: 'u-1',
            role: 'member',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      }
      mockGet.mockResolvedValueOnce(response)

      const result = await getConversationParticipants('conv-abc')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/participants', undefined)
      expect(result).toBe(response)
    })

    it('passes through options (headers) to serverApi.get', async () => {
      mockGet.mockResolvedValueOnce({ results: [] })

      await getConversationParticipants('conv-abc', { headers: { cookie: 'session=abc' } })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/messages/conv-abc/participants', {
        headers: { cookie: 'session=abc' },
      })
    })

    it('returns null when missing entity (uses returnNullForMissingEntity)', async () => {
      mockReturnNullForMissingEntity.mockResolvedValueOnce(null)
      mockGet.mockResolvedValueOnce({ results: [] })

      const result = await getConversationParticipants('missing-conv')

      expect(result).toBeNull()
    })
  })
})
