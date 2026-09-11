import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { makeCommunity, makeCommunityResponse } from '@/test-helpers/api-responses'

interface HeaderBag {
  get: (key: string) => string | null
}

const {
  mockGetCurrentUser,
  mockIsModerationStaff,
  mockGetCommunity,
  mockGetModmailThreadServer,
  mockGetModmailThreadMessagesServer,
  mockNotFound,
  mockRedirect,
  mockHeaders,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockIsModerationStaff: vi.fn<VitestLooseMock>(),
  mockGetCommunity: vi.fn<VitestLooseMock>(),
  mockGetModmailThreadServer: vi.fn<VitestLooseMock>(),
  mockGetModmailThreadMessagesServer: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NOT_FOUND')
  }),
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('REDIRECT')
  }),
  mockHeaders: vi.fn<() => Promise<HeaderBag>>(),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(
  import('next/headers'),
  () =>
    ({
      headers: mockHeaders,
    }) as unknown as typeof import('next/headers'),
)

vi.mock(import('@/lib/auth/official-account'), () => ({
  isModerationStaff: mockIsModerationStaff,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: mockGetCommunity,
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
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/lib/seo/metadata'),
  () =>
    ({
      createNoIndexMetadata: (t: string) => ({ title: t }),
    }) as unknown as typeof import('@/lib/seo/metadata'),
)

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: React.ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav />,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        asChild: _asChild,
        ...rest
      }: {
        children: React.ReactNode
        asChild?: boolean
        [k: string]: unknown
      }) => (
        <button
          type='button'
          {...rest}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(import('@/components/shared/page-header'), () => ({
  PageHeader: () => <h1>Modmail Thread</h1>,
}))

vi.mock(import('../modmail-thread-client'), () => ({
  ModmailThreadClient: () => <div data-pw='modmail-thread-client'>client</div>,
}))

import ModmailThreadPage, { generateMetadata } from '../page'

const defaultMessagesData = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null },
}

function makeModUser() {
  return { id: 'mod-user', role: 'admin' }
}

function makeCommunityData(role = 'moderator') {
  return {
    community: { id: 'c1', name: 'Test Community' },
    membership: { role, removed_at: null },
  }
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

describe('generateMetadata (communities modmail thread)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns noindex metadata with community name when community exists', async () => {
    mockGetCommunity.mockResolvedValueOnce(
      makeCommunityResponse({
        community: makeCommunity({ id: 'c1', name: 'Test Community' }),
        membership: null,
      }),
    )
    const result = await generateMetadata({
      params: Promise.resolve({ slug: 'test-community', threadId: 't1' }),
    })
    expect(result).toEqual({ title: 'Modmail Thread — Test Community' })
  })

  it('returns empty metadata when community is not found', async () => {
    mockGetCommunity.mockResolvedValueOnce(null)
    const result = await generateMetadata({
      params: Promise.resolve({ slug: 'unknown', threadId: 't1' }),
    })
    expect(result).toEqual({})
  })
})

describe('ModmailThreadPage (communities)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockNotFound.mockImplementation(() => {
      throw new Error('NOT_FOUND')
    })
    mockRedirect.mockImplementation(() => {
      throw new Error('REDIRECT')
    })
    mockHeaders.mockResolvedValue({ get: () => null })
  })

  it('renders ModmailThreadClient for a mod', async () => {
    mockGetCurrentUser.mockResolvedValue(makeModUser())
    mockIsModerationStaff.mockReturnValue(true)
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData())
    mockGetModmailThreadServer.mockResolvedValueOnce(makeThreadData())
    mockGetModmailThreadMessagesServer.mockResolvedValueOnce(defaultMessagesData)

    const jsx = await ModmailThreadPage({
      params: Promise.resolve({ slug: 'test-community', threadId: 't1' }),
    })
    render(jsx)
    expect(screen.getByText('client')).toBeDefined()
  })

  it('redirects to /login when user is not logged in', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    await expect(
      ModmailThreadPage({
        params: Promise.resolve({ slug: 'test-community', threadId: 't1' }),
      }),
    ).rejects.toThrow('REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('calls notFound when thread is missing', async () => {
    mockGetCurrentUser.mockResolvedValue(makeModUser())
    mockIsModerationStaff.mockReturnValue(true)
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData())
    mockGetModmailThreadServer.mockResolvedValueOnce(null)
    mockGetModmailThreadMessagesServer.mockResolvedValueOnce(defaultMessagesData)

    await expect(
      ModmailThreadPage({
        params: Promise.resolve({ slug: 'test-community', threadId: 't1' }),
      }),
    ).rejects.toThrow('NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('calls notFound when user is not mod and not the thread subject', async () => {
    // currentUser.id differs from thread.subject_user_id, and user is not a mod
    mockGetCurrentUser.mockResolvedValue({ id: 'other-user' })
    mockIsModerationStaff.mockReturnValue(false)
    mockGetCommunity.mockResolvedValueOnce(makeCommunityData('member'))
    mockGetModmailThreadServer.mockResolvedValueOnce(makeThreadData('subject-user'))
    mockGetModmailThreadMessagesServer.mockResolvedValueOnce(defaultMessagesData)

    await expect(
      ModmailThreadPage({
        params: Promise.resolve({ slug: 'test-community', threadId: 't1' }),
      }),
    ).rejects.toThrow('NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
