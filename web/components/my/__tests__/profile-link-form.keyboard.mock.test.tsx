import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { ApiError } from '@/lib/api/error'
import { ProfileLinkForm } from '../profile-link-form'

const mockToastError = vi.hoisted(() => vi.fn<VitestLooseMock>())

const mockToastSuccess = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        error: mockToastError,
        success: mockToastSuccess,
      },
    }) as unknown as typeof import('sonner'),
)

describe('ProfileLinkForm keyboard submit', () => {
  const onSubmit = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
  const onCancel = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Enter on the URL input triggers the onSubmit callback', async () => {
    render(
      <ProfileLinkForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        loading={false}
      />,
    )
    const input = screen.getByLabelText('URL') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    void expectInputEnterSubmits({ input, onSubmit })
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        link_type: 'url',
        url: 'https://example.com',
        name: undefined,
      })
    })
  })

  it('shows the API error message when the submit callback rejects', async () => {
    onSubmit.mockRejectedValueOnce(new ApiError('Handle already exists', 409))

    render(
      <ProfileLinkForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        loading={false}
      />,
    )

    fireEvent.submit(screen.getByRole('button', { name: 'Add link' }).closest('form')!)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Handle already exists')
    })
  })

  it('shows a generic error message for unexpected submit callback failures', async () => {
    onSubmit.mockRejectedValueOnce(new Error('Network failed'))

    render(
      <ProfileLinkForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        loading={false}
      />,
    )

    fireEvent.submit(screen.getByRole('button', { name: 'Add link' }).closest('form')!)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to save link')
    })
  })
})
