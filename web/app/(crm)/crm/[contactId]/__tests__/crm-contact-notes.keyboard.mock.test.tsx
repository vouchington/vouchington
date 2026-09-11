import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, it, vi } from 'vitest'
import { expectTextareaCmdEnterSubmits } from '@/test-helpers/form-keyboard'
import { CrmContactNotes } from '../crm-contact-notes'
import { createCrmNote } from '@/lib/api/client/crm'

vi.mock(import('@/lib/api/client/crm'), () => ({
  createCrmNote: vi.fn<VitestLooseMock>(),
  deleteCrmNote: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockCreateCrmNote = vi.mocked(createCrmNote)

describe('CrmContactNotes — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCrmNote.mockResolvedValue({
      note: {
        id: 'note-1',
        body: 'Hello',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    } as Awaited<ReturnType<typeof createCrmNote>>)
  })

  it('Cmd+Enter and Ctrl+Enter on the note body textarea submit; plain Enter does not', () => {
    render(
      <CrmContactNotes
        contactId='contact-1'
        initialNotes={[]}
      />,
    )

    const textarea = screen.getByLabelText('Note body') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Hello' } })

    // Spy on the native submit event because the form's React onSubmit short-circuits
    // re-entry (saving state) between the three keydowns.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })
})
