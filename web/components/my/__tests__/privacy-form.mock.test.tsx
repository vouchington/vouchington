import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivacyForm } from '../privacy-form'
import { updateMyUser } from '@/lib/api/client/users'
import type { User } from '@/types/user'

const defaultUser = { id: 'user-1' } as User

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/users'), () => ({
  updateMyUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

vi.mock(
  import('../privacy-form/visibility-sections'),
  () =>
    ({
      ActivityVisibilitySection: ({
        onChange,
        settings,
      }: {
        onChange: (field: string, value: string) => void
        settings: { follows_visibility: string }
      }) => (
        <div>
          <span>Follows visibility: {settings.follows_visibility}</span>
          <button
            type='button'
            onClick={() => onChange('follows_visibility', 'nobody')}
          >
            Change follows visibility
          </button>
        </div>
      ),
      ProfileVisibilitySection: () => <section>Profile visibility</section>,
      MessagingSection: () => <section>Messaging</section>,
    }) as unknown as typeof import('../privacy-form/visibility-sections'),
)

vi.mock(import('../privacy-form/post-defaults-section'), () => ({
  PostDefaultsSection: () => <section>Post defaults</section>,
}))

vi.mock(import('../privacy-form/privacy-toggles'), () => ({
  PrivacyToggles: ({
    onMarketingChange,
    onRestrictProcessingChange,
  }: {
    onMarketingChange: (enabled: boolean) => void
    onRestrictProcessingChange: (enabled: boolean) => void
  }) => (
    <div>
      <button
        type='button'
        onClick={() => onMarketingChange(true)}
      >
        Enable marketing
      </button>
      <button
        type='button'
        onClick={() => onRestrictProcessingChange(true)}
      >
        Restrict processing
      </button>
    </div>
  ),
}))

describe('PrivacyForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnError.mockReturnValue('Failed to update privacy setting')
    vi.mocked(updateMyUser).mockResolvedValue({ user: { id: 'user-1', roles: [] } })
  })

  it('updates string privacy settings for the current user', async () => {
    render(<PrivacyForm initialUser={defaultUser} />)

    fireEvent.click(screen.getByRole('button', { name: 'Change follows visibility' }))

    await waitFor(() =>
      expect(updateMyUser).toHaveBeenCalledWith('user-1', { follows_visibility: 'nobody' }),
    )
    expect(mockOnSuccess).toHaveBeenCalledWith('Privacy setting updated')
  })

  it('updates marketing and processing toggles for the current user', async () => {
    render(<PrivacyForm initialUser={defaultUser} />)

    fireEvent.click(screen.getByRole('button', { name: 'Enable marketing' }))
    await waitFor(() =>
      expect(updateMyUser).toHaveBeenCalledWith('user-1', { third_party_marketing: true }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restrict processing' }))
    await waitFor(() =>
      expect(updateMyUser).toHaveBeenCalledWith('user-1', { processing_restricted_at: true }),
    )
  })

  it('reports and rolls back failed privacy setting updates', async () => {
    const user = { id: 'user-1', follows_visibility: 'everyone' } as User
    vi.mocked(updateMyUser).mockRejectedValueOnce(new Error('network'))
    render(<PrivacyForm initialUser={user} />)

    fireEvent.click(screen.getByRole('button', { name: 'Change follows visibility' }))

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to update privacy setting',
        tags: { form: 'my-privacy', field: 'follows_visibility' },
      }),
    )
    expect(screen.getByText('Follows visibility: everyone')).toBeInTheDocument()
  })

  it('reports failed marketing consent updates', async () => {
    vi.mocked(updateMyUser).mockRejectedValueOnce(new Error('network'))
    render(<PrivacyForm initialUser={defaultUser} />)

    fireEvent.click(screen.getByRole('button', { name: 'Enable marketing' }))

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to update privacy setting',
        tags: { form: 'my-privacy', field: 'third_party_marketing' },
      }),
    )
  })

  it('reports failed restrict processing updates', async () => {
    vi.mocked(updateMyUser).mockRejectedValueOnce(new Error('network'))
    render(<PrivacyForm initialUser={defaultUser} />)

    fireEvent.click(screen.getByRole('button', { name: 'Restrict processing' }))

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to update privacy setting',
        tags: { form: 'my-privacy', field: 'processing_restricted_at' },
      }),
    )
  })
})
