import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyConversations, getMyConversationMessages } from './conversations'

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

describe('conversations server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ conversations: [], page_info: { has_next_page: false } })
  })

  describe('getMyConversations', () => {
    it('calls the conversations endpoint with no options', async () => {
      await getMyConversations()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/conversations', {
        headers: undefined,
      })
    })

    it('forwards pagination options as searchParams', async () => {
      await getMyConversations({ after: 'cursor-1', limit: 20 })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/conversations', {
        headers: undefined,
        searchParams: { after: 'cursor-1', limit: '20' },
      })
    })
  })

  describe('getMyConversationMessages', () => {
    it('calls the messages endpoint with the conversation id', async () => {
      await getMyConversationMessages('conv-1')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/conversations/conv-1/messages', undefined)
    })
  })
})
