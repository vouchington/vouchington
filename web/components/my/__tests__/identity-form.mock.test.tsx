import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdentityForm } from '../identity-form'

const { mockCheckAvailability } = vi.hoisted(() => ({
  mockCheckAvailability: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@/lib/api/client'), () => ({
  updateMyIdentity: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/availability'), () => ({
  checkAvailability: mockCheckAvailability,
}))

vi.mock(
  import('../identity-profile-image-section'),
  () =>
    ({
      IdentityProfileImageSection: () => null,
    }) as unknown as typeof import('../identity-profile-image-section'),
)

vi.mock(
  import('../identity-display-name-source-section'),
  () =>
    ({
      IdentityDisplayNameSourceSection: () => null,
    }) as unknown as typeof import('../identity-display-name-source-section'),
)

function renderForm(initialUsername: string | null = 'alice') {
  return render(
    <IdentityForm
      initialUsername={initialUsername}
      initialProfileImageId={null}
      initialUseDisplayNameFrom='username'
      initialFacebookAccount={null}
      hasOAuthAccount={false}
    />,
  )
}

describe('IdentityForm username availability', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the username input', () => {
    renderForm()
    expect(document.querySelector('[data-pw="identity-username-input"]')).not.toBeNull()
  })

  it('checks availability on blur when the username changed', async () => {
    mockCheckAvailability.mockResolvedValue({ available: true, conflict: null })
    renderForm('alice')

    const input = screen.getByLabelText('Username')
    fireEvent.change(input, { target: { value: 'bob' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(mockCheckAvailability).toHaveBeenCalledWith('username', 'bob', expect.any(Object))
    })
  })

  it('does not check availability when the username matches the initial value', () => {
    renderForm('alice')
    fireEvent.blur(screen.getByLabelText('Username'))
    expect(mockCheckAvailability).not.toHaveBeenCalled()
  })

  it('shows the taken indicator when the username is in use', async () => {
    mockCheckAvailability.mockResolvedValue({ available: false, conflict: null })
    renderForm('alice')

    const input = screen.getByLabelText('Username')
    fireEvent.change(input, { target: { value: 'taken' } })
    fireEvent.blur(input)

    expect(await screen.findByText('username is already taken')).toBeInTheDocument()
  })
})
