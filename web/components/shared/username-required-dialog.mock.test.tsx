import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UsernameRequiredDialog } from './username-required-dialog'
import { ApiError } from '@/lib/api/error'
import { updateMyIdentity } from '@/lib/api/client/my'
import { toast } from 'sonner'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'

vi.mock(import('@/lib/api/client/my'), () => ({
  updateMyIdentity: vi.fn<VitestLooseMock>(),
}))

const { mockAvailabilityReset, mockAvailabilityOnBlur } = vi.hoisted(() => ({
  mockAvailabilityReset: vi.fn<VitestLooseMock>(),
  mockAvailabilityOnBlur: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-availability-check'), () => ({
  useAvailabilityCheck: vi.fn<VitestLooseMock>(() => ({
    state: { status: 'idle', conflict: null },
    reset: mockAvailabilityReset,
    onBlur: mockAvailabilityOnBlur,
  })),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockUpdateMyIdentity = vi.mocked(updateMyIdentity)
const mockToastError = vi.mocked(toast.error)

const MIN_USERNAME = 'abc'

describe('UsernameRequiredDialog', () => {
  const onUsernameSet = vi.fn<VitestLooseMock>()
  const onClose = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderDialog(
    open = true,
    overrides?: Partial<React.ComponentProps<typeof UsernameRequiredDialog>>,
  ) {
    return render(
      <UsernameRequiredDialog
        open={open}
        onUsernameSet={onUsernameSet}
        onClose={onClose}
        {...overrides}
      />,
    )
  }

  function getInput() {
    return screen.getByRole('textbox')
  }

  it('renders default title and description when open', () => {
    renderDialog()
    expect(
      screen.getByRole('heading', { name: /create a username to continue posting/i }),
    ).toBeDefined()
    expect(screen.getByText(/a username is required to post/i)).toBeDefined()
  })

  it('renders custom title, description, and submitLabel when provided', () => {
    renderDialog(true, {
      title: 'Create a username to create a community',
      description: 'A username is required to create a community. Choose a username to continue.',
      submitLabel: 'Create username & community',
    })
    expect(
      screen.getByRole('heading', { name: /create a username to create a community/i }),
    ).toBeDefined()
    expect(screen.getByText(/a username is required to create a community/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /create username & community/i })).toBeDefined()
  })

  it('does not render content when closed', () => {
    renderDialog(false)
    expect(
      screen.queryByRole('heading', { name: /create a username to continue posting/i }),
    ).toBeNull()
  })

  it('submit button is disabled until username meets minimum length', () => {
    renderDialog()
    const submitBtn = screen.getByRole('button', { name: /create username & post/i })
    expect(submitBtn).toHaveProperty('disabled', true)

    fireEvent.change(getInput(), { target: { value: MIN_USERNAME } })
    expect(submitBtn).toHaveProperty('disabled', false)
  })

  it('calls onUsernameSet after a successful update', async () => {
    mockUpdateMyIdentity.mockResolvedValueOnce({} as never)
    renderDialog()

    const input = getInput()
    fireEvent.change(input, { target: { value: 'myusername' } })
    mockAvailabilityReset.mockClear()
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockUpdateMyIdentity).toHaveBeenCalledWith({ username: 'myusername' })
      expect(mockAvailabilityReset).toHaveBeenCalledTimes(1)
      expect(onUsernameSet).toHaveBeenCalledTimes(1)
    })
  })

  it('shows error toast and does not call onUsernameSet on ApiError', async () => {
    mockUpdateMyIdentity.mockRejectedValueOnce(
      new ApiError('Username already taken', 409, {
        code: 'CONFLICT',
        message: 'Username already taken',
      }),
    )
    renderDialog()

    const input = getInput()
    fireEvent.change(input, { target: { value: 'takenname' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Username already taken')
      expect(onUsernameSet).not.toHaveBeenCalled()
    })
  })

  it('shows fallback error toast on unknown error', async () => {
    mockUpdateMyIdentity.mockRejectedValueOnce(new Error('network error'))
    renderDialog()

    const input = getInput()
    fireEvent.change(input, { target: { value: 'myusername' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to create username')
    })
  })

  it('submits via Enter on the username input through the API client', async () => {
    mockUpdateMyIdentity.mockResolvedValueOnce({} as never)
    renderDialog()

    const input = getInput() as HTMLInputElement
    fireEvent.change(input, { target: { value: 'enteruser' } })
    void expectInputEnterSubmits({ input, onSubmit: mockUpdateMyIdentity })

    await waitFor(() => {
      expect(mockUpdateMyIdentity).toHaveBeenCalledWith({ username: 'enteruser' })
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    renderDialog()
    fireEvent.change(getInput(), { target: { value: 'testuser' } })
    mockAvailabilityReset.mockClear()

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mockAvailabilityReset).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls availability check hooks on change and blur', () => {
    renderDialog()
    const input = getInput()

    fireEvent.change(input, { target: { value: 'testuser' } })
    expect(mockAvailabilityReset).toHaveBeenCalled()

    fireEvent.blur(input)
    expect(mockAvailabilityOnBlur).toHaveBeenCalledWith('testuser')
  })

  it('does not check availability for invalid usernames', () => {
    renderDialog()
    const input = getInput()

    fireEvent.change(input, { target: { value: 'abc@' } })
    fireEvent.blur(input)
    fireEvent.change(input, { target: { value: '123' } })
    fireEvent.blur(input)

    expect(mockAvailabilityOnBlur).not.toHaveBeenCalled()
  })
})
