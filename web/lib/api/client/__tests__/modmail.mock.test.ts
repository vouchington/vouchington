import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import { clientApi } from '@/lib/api/client/instance'
import {
  getModmailInboxClient,
  openModmailThread,
  openModmailThreadForReport,
  getModmailMessagesClient,
  sendModmailMessage,
  assignModmailThread,
  resolveModmailThread,
  getCommunitySavedReplies,
  createSavedReply,
  deleteSavedReply,
} from '@/lib/api/client/modmail'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)
const mockPatch = vi.mocked(clientApi.patch)
const mockDelete = vi.mocked(clientApi.delete)

describe('modmail client api helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getModmailInboxClient', () => {
    it('GETs /api/v1/communities/:slug/modmail', async () => {
      const response = { results: [], page_info: { has_next_page: false, end_cursor: null } }
      mockGet.mockResolvedValueOnce(response)

      const result = await getModmailInboxClient('my-community')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my-community/modmail')
      expect(result).toBe(response)
    })

    it('URL-encodes special characters in the community slug', async () => {
      mockGet.mockResolvedValueOnce({
        results: [],
        page_info: { has_next_page: false, end_cursor: null },
      })

      await getModmailInboxClient('my community')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my%20community/modmail')
    })
  })

  describe('openModmailThread', () => {
    it('POSTs to /api/v1/communities/:slug/modmail with empty body when no subjectUserId', async () => {
      const thread = { id: 'thread-1', community_id: 'comm-1' }
      mockPost.mockResolvedValueOnce({ thread })

      const result = await openModmailThread('my-community')

      expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/my-community/modmail', {})
      expect(result).toEqual({ thread })
    })

    it('POSTs with subject_user_id when provided', async () => {
      const thread = { id: 'thread-2', community_id: 'comm-1', subject_user_id: 'user-abc' }
      mockPost.mockResolvedValueOnce({ thread })

      await openModmailThread('my-community', 'user-abc')

      expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/my-community/modmail', {
        subject_user_id: 'user-abc',
      })
    })
  })

  describe('getModmailMessagesClient', () => {
    it('GETs /api/v1/communities/:slug/modmail/:conversationId/messages', async () => {
      const response = {
        results: [],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      }
      mockGet.mockResolvedValueOnce(response)

      const result = await getModmailMessagesClient('my-community', 'conv-1')

      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/modmail/conv-1/messages',
      )
      expect(result).toBe(response)
    })
  })

  describe('sendModmailMessage', () => {
    it('POSTs to /api/v1/communities/:slug/modmail/:conversationId/messages with text', async () => {
      const message = { id: 'msg-1', body_text: 'Hello' }
      mockPost.mockResolvedValueOnce({ message })

      const result = await sendModmailMessage('my-community', 'conv-1', 'Hello')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/modmail/conv-1/messages',
        { text: 'Hello' },
      )
      expect(result).toEqual({ message })
    })
  })

  describe('assignModmailThread', () => {
    it('PATCHes /api/v1/communities/:slug/modmail/:conversationId with assigned_mod_id', async () => {
      const thread = { id: 'conv-1', assigned_mod_id: 'mod-1' }
      mockPatch.mockResolvedValueOnce({ thread })

      await assignModmailThread('my-community', 'conv-1', 'mod-1')

      expect(mockPatch).toHaveBeenCalledWith('/api/v1/communities/my-community/modmail/conv-1', {
        assigned_mod_id: 'mod-1',
      })
    })
  })

  describe('resolveModmailThread', () => {
    it('PATCHes /api/v1/communities/:slug/modmail/:conversationId with resolved true', async () => {
      const thread = { id: 'conv-1', resolved_at: '2026-01-01T00:00:00Z' }
      mockPatch.mockResolvedValueOnce({ thread })

      await resolveModmailThread('my-community', 'conv-1')

      expect(mockPatch).toHaveBeenCalledWith('/api/v1/communities/my-community/modmail/conv-1', {
        resolved: true,
      })
    })
  })

  describe('getCommunitySavedReplies', () => {
    it('GETs /api/v1/communities/:slug/saved-replies', async () => {
      const response = {
        results: [],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      }
      mockGet.mockResolvedValueOnce(response)

      const result = await getCommunitySavedReplies('my-community')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my-community/saved-replies')
      expect(result).toBe(response)
    })

    it('forwards saved reply pagination options', async () => {
      mockGet.mockResolvedValueOnce({ results: [], page_info: {} })

      await getCommunitySavedReplies('my-community', { after: 'opaque', limit: 20 })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/my-community/saved-replies', {
        searchParams: { after: 'opaque', limit: 20 },
      })
    })
  })

  describe('createSavedReply', () => {
    it('POSTs to /api/v1/communities/:slug/saved-replies with title and body', async () => {
      const reply = { id: 'reply-1', title: 'Template', body: 'Thank you.' }
      mockPost.mockResolvedValueOnce({ reply })

      const result = await createSavedReply('my-community', 'Template', 'Thank you.')

      expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/my-community/saved-replies', {
        title: 'Template',
        body: 'Thank you.',
      })
      expect(result).toEqual({ reply })
    })
  })

  describe('deleteSavedReply', () => {
    it('DELETEs /api/v1/communities/:slug/saved-replies/:id', async () => {
      mockDelete.mockResolvedValueOnce(undefined)

      await deleteSavedReply('my-community', 'reply-1')

      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/saved-replies/reply-1',
      )
    })
  })

  describe('openModmailThreadForReport', () => {
    beforeEach(() => {
      mockPost.mockResolvedValue({ thread: { id: 'thread-1' } })
    })

    it('POSTs to the correct URL', async () => {
      await openModmailThreadForReport('test-community', 'report-1')
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/communities/test-community/reports/report-1/modmail',
        {},
      )
    })

    it('URL-encodes special characters in communitySlug', async () => {
      await openModmailThreadForReport('my community', 'report-1')
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/communities/my%20community/reports/report-1/modmail',
        {},
      )
    })

    it('URL-encodes special characters in reportId', async () => {
      await openModmailThreadForReport('test-community', 'report/special')
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/communities/test-community/reports/report%2Fspecial/modmail',
        {},
      )
    })
  })
})
