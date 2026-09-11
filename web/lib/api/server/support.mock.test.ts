import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminSupportThreads,
  getAdminSupportThread,
  getAdminSupportThreadMessages,
  getAdminSupportContacts,
  getAdminSupportContact,
  getMySupportThreads,
  getMySupportThread,
} from './support'

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

describe('support server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(null)
  })

  describe('getAdminSupportThreads', () => {
    it('calls the threads endpoint with no options', async () => {
      await getAdminSupportThreads()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/support/threads', {
        headers: undefined,
      })
    })

    it('forwards filter and pagination options as searchParams', async () => {
      await getAdminSupportThreads({ status: 'open', q: 'help', limit: 10, after: 'cursor-1' })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/support/threads', {
        headers: undefined,
        searchParams: { status: 'open', q: 'help', limit: '10', after: 'cursor-1' },
      })
    })
  })

  describe('getAdminSupportThread', () => {
    it('calls the thread detail endpoint', async () => {
      await getAdminSupportThread('thread-1')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/support/threads/thread-1', undefined)
    })
  })

  describe('getAdminSupportThreadMessages', () => {
    it('calls the messages endpoint with no options', async () => {
      await getAdminSupportThreadMessages('thread-1')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/support/threads/thread-1/messages', {
        headers: undefined,
      })
    })

    it('forwards pagination options as searchParams', async () => {
      await getAdminSupportThreadMessages('thread-1', { limit: 20, after: 'cursor-1' })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/support/threads/thread-1/messages', {
        headers: undefined,
        searchParams: { limit: '20', after: 'cursor-1' },
      })
    })
  })

  describe('getAdminSupportContacts', () => {
    it('calls the contacts endpoint with no options', async () => {
      await getAdminSupportContacts()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/support/contacts', {
        headers: undefined,
      })
    })

    it('forwards filter and pagination options as searchParams', async () => {
      await getAdminSupportContacts({ q: 'john', limit: 5, after: 'cursor-2' })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/support/contacts', {
        headers: undefined,
        searchParams: { q: 'john', limit: '5', after: 'cursor-2' },
      })
    })
  })

  describe('getAdminSupportContact', () => {
    it('forwards thread pagination options', async () => {
      await getAdminSupportContact('contact-1', {
        limit: 10,
        after: 'cursor-1',
        headers: { 'x-test': '1' },
      })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/support/contacts/contact-1', {
        headers: { 'x-test': '1' },
        searchParams: { limit: '10', after: 'cursor-1' },
      })
    })

    it('omits search params when pagination options are absent', async () => {
      await getAdminSupportContact('contact-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/support/contacts/contact-1', {
        headers: undefined,
      })
    })
  })

  describe('getMySupportThreads', () => {
    it('calls the my support-threads endpoint with no options', async () => {
      await getMySupportThreads()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/support-threads', {
        headers: undefined,
      })
    })

    it('forwards pagination options as searchParams', async () => {
      await getMySupportThreads({ limit: 10, after: 'cursor-1' })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/support-threads', {
        headers: undefined,
        searchParams: { limit: '10', after: 'cursor-1' },
      })
    })
  })

  describe('getMySupportThread', () => {
    it('calls the my support-thread detail endpoint', async () => {
      await getMySupportThread('thread-1')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/support-threads/thread-1', undefined)
    })
  })
})
