import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrmContactDetailClient } from '../crm-contact-detail-client'
import {
  deleteCrmContact,
  linkCrmContactToUser,
  unlinkCrmContact,
  updateCrmContact,
} from '@/lib/api/client/crm'
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

const mockUpdate = vi.mocked(updateCrmContact)
const mockDelete = vi.mocked(deleteCrmContact)
const mockLink = vi.mocked(linkCrmContactToUser)
const mockUnlink = vi.mocked(unlinkCrmContact)

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

const linkedContact: WebCrmContact = {
  ...baseContact,
  user_id: 'user-1',
} as WebCrmContact

describe('CrmContactDetailClient error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports update-contact failures via onError fallback', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Update failed'))

    render(
      <CrmContactDetailClient
        contact={baseContact}
        socialAccounts={[]}
        initialMessages={[]}
        initialNotes={[]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update contact')
    })
  })

  it('reports archive failures via onError fallback', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Archive failed'))

    render(
      <CrmContactDetailClient
        contact={baseContact}
        socialAccounts={[]}
        initialMessages={[]}
        initialNotes={[]}
      />,
    )
    // First click sets confirmArchive=true; second click triggers the API call.
    fireEvent.click(screen.getByRole('button', { name: /archive/i }))
    fireEvent.click(screen.getByRole('button', { name: /archive/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to archive contact')
    })
  })

  it('reports link-account failures via onError fallback', async () => {
    mockLink.mockRejectedValueOnce(new Error('Link failed'))

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
    fireEvent.click(screen.getByRole('button', { name: /link account/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to link account')
    })
  })

  it('reports unlink-account failures via onError fallback', async () => {
    mockUnlink.mockRejectedValueOnce(new Error('Unlink failed'))

    render(
      <CrmContactDetailClient
        contact={linkedContact}
        socialAccounts={[]}
        initialMessages={[]}
        initialNotes={[]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /unlink/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to unlink account')
    })
  })

  it('emits onSuccess on a successful archive', async () => {
    mockDelete.mockResolvedValueOnce({} as never)

    render(
      <CrmContactDetailClient
        contact={baseContact}
        socialAccounts={[]}
        initialMessages={[]}
        initialNotes={[]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /archive/i }))
    fireEvent.click(screen.getByRole('button', { name: /archive/i }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Contact archived')
    })
  })

  it('emits onSuccess on a successful unlink', async () => {
    mockUnlink.mockResolvedValueOnce({ contact: linkedContact } as never)

    render(
      <CrmContactDetailClient
        contact={linkedContact}
        socialAccounts={[]}
        initialMessages={[]}
        initialNotes={[]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /unlink/i }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Account unlinked')
    })
  })
})
