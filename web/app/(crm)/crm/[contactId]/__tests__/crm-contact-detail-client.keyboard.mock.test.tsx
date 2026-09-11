import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'
import { CrmContactDetailClient } from '../crm-contact-detail-client'
import { updateCrmContact, linkCrmContactToUser } from '@/lib/api/client/crm'
import type { WebCrmContact } from '@/types/crm'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/crm'), () => ({
  updateCrmContact: vi.fn<VitestLooseMock>(),
  deleteCrmContact: vi.fn<VitestLooseMock>(),
  linkCrmContactToUser: vi.fn<VitestLooseMock>(),
  unlinkCrmContact: vi.fn<VitestLooseMock>(),
  generateCrmEmailDraft: vi.fn<VitestLooseMock>(),
  sendCrmEmail: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/users/user-autocomplete'),
  () =>
    ({
      UserAutocomplete: ({
        label: _label,
        value,
        onChange,
      }: {
        label: string
        value: string | null
        onChange: (id: string) => void
      }) => (
        <input
          aria-label='Search users'
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      ),
    }) as unknown as typeof import('@/components/users/user-autocomplete'),
)

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: ReactNode
        onValueChange?: (value: string) => void
        value?: string
      }) => (
        <select
          aria-label='select-mock'
          value={value}
          onChange={event => onValueChange?.(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockUpdateCrmContact = vi.mocked(updateCrmContact)
const mockLinkCrmContactToUser = vi.mocked(linkCrmContactToUser)

const baseContact: WebCrmContact = {
  id: 'contact-1',
  name: 'Alice',
  email: 'tests+alice@voucha.ai',
  phone: null,
  vertical: null,
  follower_count: null,
  notes: null,
  user_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  status: 'new',
  status_changed_at: null,
} as unknown as WebCrmContact

describe('CrmContactDetailClient — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateCrmContact.mockResolvedValue({ contact: baseContact } as Awaited<
      ReturnType<typeof updateCrmContact>
    >)
    mockLinkCrmContactToUser.mockResolvedValue({ contact: baseContact } as Awaited<
      ReturnType<typeof linkCrmContactToUser>
    >)
  })

  it('Enter on the link-user input submits via linkCrmContactToUser', async () => {
    render(
      <CrmContactDetailClient
        contact={baseContact}
        socialAccounts={[]}
        initialMessages={[]}
        initialNotes={[]}
      />,
    )

    const input = screen.getByLabelText('Search users') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'user-42' } })

    void expectInputEnterSubmits({ input, onSubmit: mockLinkCrmContactToUser })

    await waitFor(() => {
      expect(mockLinkCrmContactToUser).toHaveBeenCalledWith('contact-1', 'user-42')
    })
  })

  it('Cmd+Enter and Ctrl+Enter on the notes textarea submit; plain Enter does not', async () => {
    render(
      <CrmContactDetailClient
        contact={baseContact}
        socialAccounts={[]}
        initialMessages={[]}
        initialNotes={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const textarea = (await screen.findByLabelText('Notes')) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Updated note' } })

    // Spy on the native submit event because the form's React onSubmit can short-circuit
    // re-entry (saving state) between the three keydowns.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })
})
