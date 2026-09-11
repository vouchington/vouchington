import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const {
  mockGetCurrentUser,
  mockGetModmailThreadServer,
  mockGetModmailThreadMessagesServer,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetModmailThreadServer: vi.fn<VitestLooseMock>(),
  mockGetModmailThreadMessagesServer: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NOT_FOUND')
  }),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/api/server/modmail'), () => ({
  getModmailThreadServer: mockGetModmailThreadServer,
  getModmailThreadMessagesServer: mockGetModmailThreadMessagesServer,
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
      redirect: vi.fn<VitestLooseMock>(),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/lib/seo/metadata'),
  () =>
    ({
      createNoIndexMetadata: (t: string) => ({ title: t }),
    }) as unknown as typeof import('@/lib/seo/metadata'),
)

vi.mock(
  import('@/app/(communities)/communities/[slug]/settings/moderation/modmail/[threadId]/modmail-thread-client'),
  () =>
    ({
      ModmailThreadClient: () => <div data-pw='modmail-thread-client'>client</div>,
    }) as unknown as typeof import('@/app/(communities)/communities/[slug]/settings/moderation/modmail/[threadId]/modmail-thread-client'),
)

import MemberModmailThreadPage, { generateMetadata } from '../page'

const defaultMessagesData = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null },
}

function makeThreadData(subjectUserId = 'subject-user') {
  return {
    thread: {
      id: 't1',
      subject_user_id: subjectUserId,
      community_id: 'c1',
      assigned_mod_id: null,
      resolved_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  }
}

describe('generateMetadata', () => {
  it('returns metadata with communitySlug in title', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ communitySlug: 'test-community', threadId: 't1' }),
    })
    expect(metadata).toEqual({ title: 'Modmail — test-community' })
  })
})

describe('MemberModmailThreadPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockNotFound.mockImplementation(() => {
      throw new Error('NOT_FOUND')
    })
  })

  it('renders ModmailThreadClient when thread exists and user is logged in', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ id: 'mod-user' })
    mockGetModmailThreadServer.mockResolvedValueOnce(makeThreadData())
    mockGetModmailThreadMessagesServer.mockResolvedValueOnce(defaultMessagesData)

    const jsx = await MemberModmailThreadPage({
      params: Promise.resolve({ communitySlug: 'test-community', threadId: 't1' }),
    })
    render(jsx)
    expect(screen.getByText('client')).toBeDefined()
  })

  it('calls notFound when user is not logged in', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    await expect(
      MemberModmailThreadPage({
        params: Promise.resolve({ communitySlug: 'test-community', threadId: 't1' }),
      }),
    ).rejects.toThrow('NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('calls notFound when thread is not found', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ id: 'mod-user' })
    mockGetModmailThreadServer.mockResolvedValueOnce(null)
    mockGetModmailThreadMessagesServer.mockResolvedValueOnce(defaultMessagesData)

    await expect(
      MemberModmailThreadPage({
        params: Promise.resolve({ communitySlug: 'test-community', threadId: 't1' }),
      }),
    ).rejects.toThrow('NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
