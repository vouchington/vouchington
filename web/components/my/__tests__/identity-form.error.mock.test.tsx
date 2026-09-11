import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock(import('@/lib/api/client'), () => ({
  updateMyIdentity: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/image-upload-button'), () => ({
  ImageUploadButton: ({ onUploaded }: { onUploaded?: (id: string) => void }) => (
    <button
      type='button'
      onClick={() => onUploaded?.('img-1')}
    >
      Upload image
    </button>
  ),
}))

vi.mock(import('@/components/shared/user-avatar'), () => ({
  UserAvatar: () => <div />,
}))

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
          aria-label='display-name-source'
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

import { IdentityForm } from '../identity-form'
import { updateMyIdentity } from '@/lib/api/client'

const mockUpdateMyIdentity = vi.mocked(updateMyIdentity)

const baseProps = {
  initialUsername: 'olduser',
  initialProfileImageId: 'img-0',
  initialUseDisplayNameFrom: 'username' as const,
  initialFacebookAccount: null,
  hasOAuthAccount: false,
}

describe('IdentityForm error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects UUID usernames via skipSentry onError fallback', async () => {
    render(<IdentityForm {...baseProps} />)
    const input = screen.getByLabelText('Username') as HTMLInputElement
    fireEvent.change(input, { target: { value: '550e8400-e29b-41d4-a716-446655440000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save username' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Username cannot be a UUID')
    })
  })

  it('reports username update failures via onError fallback', async () => {
    mockUpdateMyIdentity.mockRejectedValueOnce(new Error('Update failed'))

    render(<IdentityForm {...baseProps} />)
    const input = screen.getByLabelText('Username') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'newuser' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save username' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update username')
    })
  })

  it('reports remove-image failures via onError fallback', async () => {
    mockUpdateMyIdentity.mockRejectedValueOnce(new Error('Remove failed'))

    render(<IdentityForm {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /remove image/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to remove profile image')
    })
  })

  it('reports image upload failures via onError fallback', async () => {
    mockUpdateMyIdentity.mockRejectedValueOnce(new Error('Upload failed'))

    render(<IdentityForm {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update profile image')
    })
  })

  it('emits onSuccess on successful image upload', async () => {
    mockUpdateMyIdentity.mockResolvedValueOnce({} as never)

    render(<IdentityForm {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Upload image' }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Profile image updated')
    })
  })

  it('emits onSuccess on successful remove image', async () => {
    mockUpdateMyIdentity.mockResolvedValueOnce({} as never)

    render(<IdentityForm {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /remove image/i }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Profile image removed')
    })
  })

  it('emits onSuccess on display-name-source change', async () => {
    mockUpdateMyIdentity.mockResolvedValueOnce({} as never)

    render(
      <IdentityForm
        {...baseProps}
        initialFacebookAccount={{ id: 'fb-1', display_name: 'Test', email: null } as never}
      />,
    )
    const select = screen.getByLabelText('display-name-source') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'facebook' } })

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Display name source updated')
    })
  })

  it('reports display-name-source update failures via onError fallback', async () => {
    mockUpdateMyIdentity.mockRejectedValueOnce(new Error('Source failed'))

    render(
      <IdentityForm
        {...baseProps}
        initialFacebookAccount={{ id: 'fb-1', display_name: 'Test', email: null } as never}
      />,
    )
    const select = screen.getByLabelText('display-name-source') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'facebook' } })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update display name source')
    })
  })
})
