import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  getUserModerationContext,
  listUserModNotes,
  createUserModNote,
  deleteUserModNote,
} from '../users'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)
const mockDelete = vi.mocked(clientApi.delete)

describe('users mod-notes API client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserModerationContext', () => {
    it('GETs /api/v1/users/:userId/moderation-context', async () => {
      const mockResponse = {
        context: {
          account_age_ms: 86_400_000,
          trust_tier: 2,
          active_suspension: null,
          content_removal_count: 3,
          community_removal_count: 1,
        },
        notes: [],
        page_info: { has_next_page: false },
      }
      mockGet.mockResolvedValueOnce(mockResponse)
      const result = await getUserModerationContext('user-abc')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user-abc/moderation-context')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('listUserModNotes', () => {
    it('GETs /api/v1/users/:userId/mod-notes with search params', async () => {
      const mockResponse = { notes: [], page_info: { has_next_page: false } }
      mockGet.mockResolvedValueOnce(mockResponse)
      const result = await listUserModNotes('user-abc', { after: 'some-cursor', limit: 10 })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user-abc/mod-notes', {
        searchParams: { after: 'some-cursor', limit: 10 },
      })
      expect(result).toEqual(mockResponse)
    })

    it('GETs /api/v1/users/:userId/mod-notes with no options', async () => {
      const mockResponse = { notes: [], page_info: { has_next_page: false } }
      mockGet.mockResolvedValueOnce(mockResponse)
      await listUserModNotes('user-abc')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/users/user-abc/mod-notes', {
        searchParams: {},
      })
    })
  })

  describe('createUserModNote', () => {
    it('POSTs to /api/v1/users/:userId/mod-notes', async () => {
      const mockNote = {
        id: 'note-1',
        created_at: '2026-01-01T00:00:00.000Z',
        target_user_id: 'user-abc',
        author_user_id: 'admin-1',
        community_id: null,
        body: 'Test note',
        deleted_at: null,
      }
      mockPost.mockResolvedValueOnce({ note: mockNote })
      const result = await createUserModNote('user-abc', { body: 'Test note' })
      expect(mockPost).toHaveBeenCalledWith('/api/v1/users/user-abc/mod-notes', {
        body: 'Test note',
      })
      expect(result).toEqual({ note: mockNote })
    })
  })

  describe('deleteUserModNote', () => {
    it('DELETEs /api/v1/users/:userId/mod-notes/:noteId', async () => {
      mockDelete.mockResolvedValueOnce({ ok: true })
      const result = await deleteUserModNote('user-abc', 'note-xyz')
      expect(mockDelete).toHaveBeenCalledWith('/api/v1/users/user-abc/mod-notes/note-xyz')
      expect(result).toEqual({ ok: true })
    })
  })
})
