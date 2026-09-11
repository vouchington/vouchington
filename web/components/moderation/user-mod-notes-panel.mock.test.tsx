import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetUserModerationContext,
  mockCreateUserModNote,
  mockDeleteUserModNote,
  mockOnError,
  mockOnSuccess,
  mockRefresh,
} = vi.hoisted(() => ({
  mockGetUserModerationContext: vi.fn<VitestLooseMock>(),
  mockCreateUserModNote: vi.fn<VitestLooseMock>(),
  mockDeleteUserModNote: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
  mockRefresh: vi.fn<() => void>(),
}))

vi.mock(import('@/lib/api/client/users'), () => ({
  getUserModerationContext: mockGetUserModerationContext,
  createUserModNote: mockCreateUserModNote,
  deleteUserModNote: mockDeleteUserModNote,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError, onSuccess: mockOnSuccess }))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

import { UserModNotesPanel } from './user-mod-notes-panel'
import { fmtAge, panelReducer } from './user-mod-notes-helpers'
import type { UserModerationContext, UserModNote } from '@/types/api-responses'

const makeContext = (overrides: Partial<UserModerationContext> = {}): UserModerationContext => ({
  account_age_ms: 86_400_000,
  trust_tier: 2,
  active_suspension: null,
  content_removal_count: 3,
  community_removal_count: 1,
  ...overrides,
})

const makeNote = (overrides: Partial<UserModNote> = {}): UserModNote => ({
  id: 'note-1',
  created_at: '2026-01-01T00:00:00.000Z',
  target_user_id: 'user-abc',
  author_user_id: 'admin-00000001',
  community_id: null,
  body: 'Test moderator note',
  deleted_at: null,
  ...overrides,
})

const makeContextResponse = (
  notes: UserModNote[] = [],
  contextOverrides: Partial<UserModerationContext> = {},
) => ({
  context: makeContext(contextOverrides),
  notes,
  page_info: { has_next_page: false },
})

describe('UserModNotesPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Loading..." initially', () => {
    // Never resolves -- stays in loading state
    mockGetUserModerationContext.mockReturnValueOnce(new Promise(() => {}))
    render(<UserModNotesPanel targetUserId='user-abc' />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows error message when API fails', async () => {
    mockGetUserModerationContext.mockRejectedValueOnce(new Error('Network error'))
    render(<UserModNotesPanel targetUserId='user-abc' />)
    expect(await screen.findByText('Failed to load.')).toBeInTheDocument()
  })

  it('shows "No notes yet." when notes array is empty', async () => {
    mockGetUserModerationContext.mockResolvedValueOnce(makeContextResponse([]))
    render(<UserModNotesPanel targetUserId='user-abc' />)
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
  })

  it('shows a note item when notes are present', async () => {
    mockGetUserModerationContext.mockResolvedValueOnce(
      makeContextResponse([makeNote({ body: 'This is a mod note' })]),
    )
    render(<UserModNotesPanel targetUserId='user-abc' />)
    expect(await screen.findByText('This is a mod note')).toBeInTheDocument()
  })

  it('shows account age from context', async () => {
    mockGetUserModerationContext.mockResolvedValueOnce(
      makeContextResponse([], { account_age_ms: 86_400_000 }),
    )
    render(<UserModNotesPanel targetUserId='user-abc' />)
    expect(await screen.findByText('Account age:')).toBeInTheDocument()
    expect(screen.getByText('1 day')).toBeInTheDocument()
  })

  it('renders the add-note form with textarea and submit button', async () => {
    mockGetUserModerationContext.mockResolvedValueOnce(makeContextResponse([]))
    render(<UserModNotesPanel targetUserId='user-abc' />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
    expect(screen.getByPlaceholderText('Add a moderator note…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add note/i })).toBeInTheDocument()
  })

  it('calls deleteUserModNote when delete button is clicked', async () => {
    mockGetUserModerationContext.mockResolvedValueOnce(
      makeContextResponse([makeNote({ id: 'note-del', body: 'Note to delete' })]),
    )
    mockDeleteUserModNote.mockResolvedValueOnce({ ok: true })
    render(<UserModNotesPanel targetUserId='user-abc' />)
    const deleteBtn = await screen.findByRole('button', { name: /delete note/i })
    fireEvent.click(deleteBtn)
    await waitFor(() => expect(mockDeleteUserModNote).toHaveBeenCalledWith('user-abc', 'note-del'))
  })

  it('calls deleteUserModNote error path via onError', async () => {
    mockGetUserModerationContext.mockResolvedValueOnce(
      makeContextResponse([makeNote({ id: 'note-fail', body: 'Note fail' })]),
    )
    mockDeleteUserModNote.mockRejectedValueOnce(new Error('Delete failed'))
    render(<UserModNotesPanel targetUserId='user-abc' />)
    const deleteBtn = await screen.findByRole('button', { name: /delete note/i })
    fireEvent.click(deleteBtn)
    await waitFor(() => expect(mockOnError).toHaveBeenCalled())
  })

  it('calls createUserModNote when form is submitted with text', async () => {
    mockGetUserModerationContext.mockResolvedValueOnce(makeContextResponse([]))
    mockCreateUserModNote.mockResolvedValueOnce({
      note: makeNote({ id: 'note-new', body: 'Submitted note' }),
    })
    render(<UserModNotesPanel targetUserId='user-abc' />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Add a moderator note…'), {
      target: { value: 'Submitted note' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /add note/i }).closest('form')!)
    await waitFor(() =>
      expect(mockCreateUserModNote).toHaveBeenCalledWith('user-abc', {
        body: 'Submitted note',
        community_id: null,
      }),
    )
  })

  it('calls onError when createUserModNote fails', async () => {
    mockGetUserModerationContext.mockResolvedValueOnce(makeContextResponse([]))
    mockCreateUserModNote.mockRejectedValueOnce(new Error('Create failed'))
    render(<UserModNotesPanel targetUserId='user-abc' />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Add a moderator note…'), {
      target: { value: 'Some note' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /add note/i }).closest('form')!)
    await waitFor(() => expect(mockOnError).toHaveBeenCalled())
  })
})

describe('fmtAge', () => {
  it('returns "less than a day" for 0ms', () => {
    expect(fmtAge(0)).toBe('less than a day')
  })

  it('returns "1 day" for exactly 86400000ms', () => {
    expect(fmtAge(86_400_000)).toBe('1 day')
  })

  it('returns plural days for multiple days', () => {
    expect(fmtAge(2 * 86_400_000)).toBe('2 days')
  })

  it('returns months for 360 days (not "0 years")', () => {
    const result = fmtAge(360 * 86_400_000)
    expect(result).not.toBe('0 years')
    expect(result).toMatch(/month/)
  })

  it('returns years for 365+ days', () => {
    expect(fmtAge(365 * 86_400_000)).toBe('1 year')
    expect(fmtAge(730 * 86_400_000)).toBe('2 years')
  })
})

describe('panelReducer', () => {
  it('transitions loading to ready on "loaded" action', () => {
    const context = makeContext()
    const notes: UserModNote[] = []
    const next = panelReducer({ status: 'loading' }, { type: 'loaded', context, notes })
    expect(next).toEqual({ status: 'ready', context, notes })
  })

  it('transitions loading to error on "error" action', () => {
    const next = panelReducer({ status: 'loading' }, { type: 'error' })
    expect(next).toEqual({ status: 'error' })
  })

  it('prepends a note on "add" action when ready', () => {
    const context = makeContext()
    const existing = makeNote({ id: 'note-old', body: 'Old note' })
    const newNote = makeNote({ id: 'note-new', body: 'New note' })
    const state = { status: 'ready' as const, context, notes: [existing] }
    const next = panelReducer(state, { type: 'add', note: newNote })
    expect(next).toEqual({ status: 'ready', context, notes: [newNote, existing] })
  })

  it('removes a note by id on "remove" action when ready', () => {
    const context = makeContext()
    const note1 = makeNote({ id: 'note-1', body: 'Note 1' })
    const note2 = makeNote({ id: 'note-2', body: 'Note 2' })
    const state = { status: 'ready' as const, context, notes: [note1, note2] }
    const next = panelReducer(state, { type: 'remove', noteId: 'note-1' })
    expect(next).toEqual({ status: 'ready', context, notes: [note2] })
  })

  it('ignores "add" action when not ready', () => {
    const state = { status: 'loading' as const }
    const note = makeNote()
    const next = panelReducer(state, { type: 'add', note })
    expect(next).toEqual({ status: 'loading' })
  })
})
