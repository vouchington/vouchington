import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getModmailInboxServer,
  getModmailThreadServer,
  getModmailThreadMessagesServer,
} from './modmail'

const { mockGet, mockReturnNullForMissingEntity } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockReturnNullForMissingEntity: vi.fn<VitestLooseMock>((p: unknown) => p),
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

vi.mock(import('../return-null-for-missing-entity'), () => ({
  returnNullForMissingEntity: mockReturnNullForMissingEntity,
}))

describe('modmail server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockReturnNullForMissingEntity.mockReset()
    mockReturnNullForMissingEntity.mockImplementation((p: unknown) => p)
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null },
    })
  })

  describe('getModmailInboxServer', () => {
    it('calls serverApi.get with the correct modmail endpoint', async () => {
      await getModmailInboxServer('test-slug')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/test-slug/modmail', undefined)
    })

    it('encodes the community slug in the URL', async () => {
      await getModmailInboxServer('my community')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my%20community/modmail', undefined)
    })

    it('forwards options to serverApi.get', async () => {
      const opts = { headers: { Authorization: 'Bearer token' } }
      await getModmailInboxServer('test-slug', opts)
      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/test-slug/modmail', opts)
    })
  })

  describe('getModmailThreadServer', () => {
    beforeEach(() => {
      mockGet.mockResolvedValue({ thread: { id: 'thread-1' } })
    })

    it('calls serverApi.get with thread endpoint and wraps with returnNullForMissingEntity', async () => {
      await getModmailThreadServer('test-slug', 'thread-1')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/test-slug/modmail/thread-1',
        undefined,
      )
      expect(mockReturnNullForMissingEntity).toHaveBeenCalled()
    })

    it('encodes the community slug', async () => {
      await getModmailThreadServer('my community', 'thread-1')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/my%20community/modmail/thread-1',
        undefined,
      )
    })
  })

  describe('getModmailThreadMessagesServer', () => {
    it('calls serverApi.get with messages endpoint and wraps with returnNullForMissingEntity', async () => {
      await getModmailThreadMessagesServer('test-slug', 'thread-1')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/test-slug/modmail/thread-1/messages',
        undefined,
      )
      expect(mockReturnNullForMissingEntity).toHaveBeenCalled()
    })

    it('encodes the community slug', async () => {
      await getModmailThreadMessagesServer('my community', 'thread-1')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/my%20community/modmail/thread-1/messages',
        undefined,
      )
    })
  })
})
