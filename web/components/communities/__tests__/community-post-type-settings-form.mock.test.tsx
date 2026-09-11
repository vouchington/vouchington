import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateCommunityPostTypeSettings } from '@/lib/api/client/communities'
import { makeCommunity, makeCommunityResponse } from '@/test-helpers/api-responses'
import { CommunityPostTypeSettingsForm } from '../community-post-type-settings-form'

const { mockRefresh, mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockRefresh: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

interface MockCheckboxProps {
  checked: boolean
  'data-pw'?: string
  id?: string
  onCheckedChange: (checked: boolean) => void
}

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/client/communities'), () => ({
  updateCommunityPostTypeSettings: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))
vi.mock(
  import('@/components/ui/checkbox'),
  () =>
    ({
      Checkbox: ({ checked, id, onCheckedChange, 'data-pw': dataPw }: MockCheckboxProps) => (
        <input
          type='checkbox'
          id={id}
          aria-label={id}
          checked={checked}
          data-pw={dataPw}
          onChange={event => onCheckedChange(event.currentTarget.checked)}
        />
      ),
    }) as unknown as typeof import('@/components/ui/checkbox'),
)

const mockUpdateCommunityPostTypeSettings = vi.mocked(updateCommunityPostTypeSettings)

describe('CommunityPostTypeSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves the selected community post type flags', async () => {
    mockUpdateCommunityPostTypeSettings.mockResolvedValue(
      makeCommunityResponse({
        community: makeCommunity({ id: 'community-1' }),
      }),
    )
    render(
      <CommunityPostTypeSettingsForm
        community={{
          slug: 'rewards',
          allow_review_posts: false,
          allow_data_point_posts: true,
        }}
      />,
    )

    fireEvent.click(screen.getByLabelText('Allow reviews'))
    fireEvent.click(screen.getByLabelText('Allow data points'))
    fireEvent.click(screen.getByText('Save Post Types'))

    await waitFor(() => {
      expect(mockUpdateCommunityPostTypeSettings).toHaveBeenCalledWith('rewards', {
        allow_review_posts: true,
        allow_data_point_posts: false,
      })
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Post type settings saved')
    expect(mockRefresh).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByText('Save Post Types')).not.toBeDisabled()
    })
  })

  it('reports save failures', async () => {
    const error = new Error('save failed')
    mockUpdateCommunityPostTypeSettings.mockRejectedValue(error)
    render(
      <CommunityPostTypeSettingsForm
        community={{
          slug: 'rewards',
          allow_review_posts: false,
          allow_data_point_posts: false,
        }}
      />,
    )

    fireEvent.click(screen.getByText('Save Post Types'))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(error, {
        fallback: 'Could not save post type settings.',
        tags: { form: 'community-post-type-settings' },
      })
    })
  })
})
