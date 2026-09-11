import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCommunity, makeCommunityResponse } from '@/test-helpers/api-responses'
import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'
import { CreateCommunityForm } from '../create-community-form'
import { ApiError } from '@/lib/api/error'

const mockRouterPush = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: mockRouterPush,
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client'), () => ({
  createCommunity: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/my'), () => ({
  updateMyIdentity: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/availability'), () => ({
  checkAvailability: vi.fn<VitestLooseMock>(),
}))

import { createCommunity } from '@/lib/api/client'
import { updateMyIdentity } from '@/lib/api/client/my'
import { checkAvailability } from '@/lib/api/client/availability'

const mockCreateCommunity = vi.mocked(createCommunity)
const mockUpdateMyIdentity = vi.mocked(updateMyIdentity)
const mockCheckAvailability = vi.mocked(checkAvailability)

describe('CreateCommunityForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('submit button is disabled when name is empty', () => {
    render(<CreateCommunityForm />)
    expect(screen.getByRole('button', { name: 'Create Community' })).toBeDisabled()
  })

  it('submit button is disabled when name has fewer than 3 words', () => {
    render(<CreateCommunityForm />)
    fireEvent.change(screen.getByLabelText('Community Name'), {
      target: { value: 'Only Two' },
    })
    expect(screen.getByRole('button', { name: 'Create Community' })).toBeDisabled()
  })

  it('shows a validation error when name has fewer than 3 words', async () => {
    render(<CreateCommunityForm />)
    fireEvent.change(screen.getByLabelText('Community Name'), {
      target: { value: 'Only Two' },
    })
    expect(await screen.findByText('Community name must have at least 3 words')).toBeInTheDocument()
  })

  it('submit button is enabled when name has 3 or more words', () => {
    render(<CreateCommunityForm />)
    fireEvent.change(screen.getByLabelText('Community Name'), {
      target: { value: 'My New Community' },
    })
    expect(screen.getByRole('button', { name: 'Create Community' })).toBeEnabled()
  })

  it('keeps the submit button disabled after success while routing', async () => {
    mockCreateCommunity.mockResolvedValue(
      makeCommunityResponse({
        community: makeCommunity({ slug: 'my-new-community' }),
      }),
    )

    render(<CreateCommunityForm />)

    fireEvent.change(screen.getByLabelText('Community Name'), {
      target: { value: 'My New Community' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Community' }))

    await waitFor(() => {
      expect(mockCreateCommunity).toHaveBeenCalled()
      expect(mockRouterPush).toHaveBeenCalledWith('/communities/my-new-community')
    })

    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled()
  })

  it('slug field is an optional manual override (no auto-population from name)', () => {
    render(<CreateCommunityForm />)
    fireEvent.change(screen.getByLabelText('Community Name'), {
      target: { value: 'My New Community' },
    })
    // Slug field should remain empty — auto-generation has been removed
    expect(screen.getByLabelText('Slug')).toHaveValue('')
  })

  it('shows an error message when creation fails', async () => {
    mockCreateCommunity.mockRejectedValue(new Error('Slug "foo" is already taken'))

    render(<CreateCommunityForm />)

    fireEvent.change(screen.getByLabelText('Community Name'), {
      target: { value: 'My New Community' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Community' }))

    await waitFor(() => {
      expect(screen.getByText('Slug "foo" is already taken')).toBeInTheDocument()
    })
  })

  it('opens the username dialog instead of showing a banner on IDENTITY_REQUIRED', async () => {
    mockCreateCommunity.mockRejectedValueOnce(
      new ApiError('A username is required to create a community', 403, {
        code: 'IDENTITY_REQUIRED',
        message: 'A username is required to create a community',
      }),
    )

    render(<CreateCommunityForm />)

    fireEvent.change(screen.getByLabelText('Community Name'), {
      target: { value: 'My New Community' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Community' }))

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /create a username to create a community/i }),
      ).toBeInTheDocument()
    })

    // Submit button should stay disabled while dialog is open (aria-hidden under the dialog overlay)
    expect(screen.getByRole('button', { name: 'Creating...', hidden: true })).toBeDisabled()

    // No error banner should appear for IDENTITY_REQUIRED
    expect(
      screen.queryByText(/a username is required to create a community/i, { selector: 'div' }),
    ).toBeNull()
  })

  it('retries community creation after username is set via the dialog', async () => {
    mockCreateCommunity
      .mockRejectedValueOnce(
        new ApiError('A username is required to create a community', 403, {
          code: 'IDENTITY_REQUIRED',
          message: 'A username is required to create a community',
        }),
      )
      .mockResolvedValueOnce(
        makeCommunityResponse({
          community: makeCommunity({ slug: 'my-new-community' }),
        }),
      )

    mockUpdateMyIdentity.mockResolvedValueOnce({} as never)

    render(<CreateCommunityForm />)

    fireEvent.change(screen.getByLabelText('Community Name'), {
      target: { value: 'My New Community' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Community' }))

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /create a username to create a community/i }),
      ).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Username' }), {
      target: { value: 'newusername' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create username & community/i }))

    await waitFor(() => {
      expect(mockUpdateMyIdentity).toHaveBeenCalledWith({ username: 'newusername' })
      expect(mockCreateCommunity).toHaveBeenCalledTimes(2)
      expect(mockRouterPush).toHaveBeenCalledWith('/communities/my-new-community')
    })
  })

  it('submits when Enter is pressed in the name input', async () => {
    mockCreateCommunity.mockResolvedValue(
      makeCommunityResponse({
        community: makeCommunity({ slug: 'my-new-community' }),
      }),
    )

    render(<CreateCommunityForm />)
    const input = screen.getByLabelText('Community Name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'My New Community' } })
    void expectInputEnterSubmits({ input, onSubmit: mockCreateCommunity })
    await waitFor(() => expect(mockCreateCommunity).toHaveBeenCalled())
  })

  it('Cmd+Enter and Ctrl+Enter submit from the description textarea; plain Enter does not', () => {
    render(<CreateCommunityForm />)
    fireEvent.change(screen.getByLabelText('Community Name'), {
      target: { value: 'My New Community' },
    })
    const textarea = screen.getByLabelText('Description') as HTMLTextAreaElement
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })

  it('re-enables the submit button when the username dialog is dismissed', async () => {
    mockCreateCommunity.mockRejectedValueOnce(
      new ApiError('A username is required to create a community', 403, {
        code: 'IDENTITY_REQUIRED',
        message: 'A username is required to create a community',
      }),
    )

    render(<CreateCommunityForm />)

    fireEvent.change(screen.getByLabelText('Community Name'), {
      target: { value: 'My New Community' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Community' }))

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /create a username to create a community/i }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Community' })).not.toBeDisabled()
    })
  })

  it('renders the slug input', () => {
    render(<CreateCommunityForm />)
    expect(document.querySelector('[data-pw="create-community-slug-input"]')).not.toBeNull()
  })

  it('checks slug availability on blur and shows the taken indicator with a link', async () => {
    mockCheckAvailability.mockResolvedValue({
      available: false,
      conflict: { kind: 'community', id: 'c1', slug: 'my-club', name: 'My Club' },
    })
    render(<CreateCommunityForm />)

    const slug = screen.getByPlaceholderText('my-awesome-community')
    fireEvent.change(slug, { target: { value: 'my-club' } })
    fireEvent.blur(slug)

    await waitFor(() => {
      expect(mockCheckAvailability).toHaveBeenCalledWith(
        'community-slug',
        'my-club',
        expect.any(Object),
      )
    })
    expect(await screen.findByRole('link', { name: 'My Club' })).toHaveAttribute(
      'href',
      '/communities/my-club',
    )
  })

  it('does not check availability on blur when the slug is empty', () => {
    render(<CreateCommunityForm />)
    fireEvent.blur(screen.getByPlaceholderText('my-awesome-community'))
    expect(mockCheckAvailability).not.toHaveBeenCalled()
  })
})
