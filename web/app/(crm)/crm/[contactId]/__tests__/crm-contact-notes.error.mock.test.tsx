import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { CrmContactNotes } from '../crm-contact-notes'
import { createCrmNote, deleteCrmNote } from '@/lib/api/client/crm'

vi.mock(import('@/lib/api/client/crm'), () => ({
  createCrmNote: vi.fn<VitestLooseMock>(),
  deleteCrmNote: vi.fn<VitestLooseMock>(),
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockCreate = vi.mocked(createCrmNote)
const mockDelete = vi.mocked(deleteCrmNote)

describe('CrmContactNotes error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports add-note failures via onError fallback', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Add failed'))

    render(
      <CrmContactNotes
        contactId='contact-1'
        initialNotes={[]}
      />,
    )
    const textarea = screen.getByLabelText('Note body') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'New note' } })
    fireEvent.click(screen.getByRole('button', { name: /add note/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to add note')
    })
  })

  it('reports delete-note failures via onError fallback', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))

    render(
      <CrmContactNotes
        contactId='contact-1'
        initialNotes={[
          {
            id: 'note-1',
            body: 'Existing',
            created_at: '2026-01-01T00:00:00.000Z',
          } as never,
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete note/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to delete note')
    })
  })

  it('emits onSuccess on a successful delete', async () => {
    mockDelete.mockResolvedValueOnce({} as never)

    render(
      <CrmContactNotes
        contactId='contact-1'
        initialNotes={[
          {
            id: 'note-1',
            body: 'Existing',
            created_at: '2026-01-01T00:00:00.000Z',
          } as never,
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete note/i }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Note deleted')
    })
  })
})
