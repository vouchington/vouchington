import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateDirectConversation,
  mockSendDirectMessage,
  mockPrependConversation,
  mockPush,
  mockOnError,
} = vi.hoisted(() => ({
  mockCreateDirectConversation: vi.fn<VitestLooseMock>(),
  mockSendDirectMessage: vi.fn<VitestLooseMock>(),
  mockPrependConversation: vi.fn<VitestLooseMock>(),
  mockPush: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/messages'), () => ({
  createDirectConversation: mockCreateDirectConversation,
  sendDirectMessage: mockSendDirectMessage,
}))

vi.mock(
  import('@/lib/messages-sidebar-context'),
  () =>
    ({
      useOptionalMessagesSidebar: () => ({ prependConversation: mockPrependConversation }),
    }) as unknown as typeof import('@/lib/messages-sidebar-context'),
)

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/navigation/use-resolved-breadcrumbs'), () => ({
  useResolvedBreadcrumbs: vi.fn<VitestLooseMock>().mockReturnValue([]),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav />,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
        type: _type,
        loading: _loading,
        ...rest
      }: {
        children: React.ReactNode
        onClick?: () => void
        disabled?: boolean
        type?: string
        loading?: boolean
        [k: string]: unknown
      }) => (
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
          {...rest}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(
  import('@/components/ui/textarea'),
  () =>
    ({
      Textarea: ({
        value,
        onChange,
        disabled,
        ...rest
      }: {
        value?: string
        onChange?: React.ChangeEventHandler<HTMLTextAreaElement>
        disabled?: boolean
        [k: string]: unknown
      }) => (
        <textarea
          value={value}
          onChange={onChange}
          disabled={disabled}
          {...rest}
        />
      ),
    }) as unknown as typeof import('@/components/ui/textarea'),
)

vi.mock(
  import('@/components/messages/recipient-picker'),
  () =>
    ({
      RecipientPicker: ({
        onAdd,
        disabled,
      }: {
        onAdd: (u: { id: string; username?: string; roles: string[] }) => void
        disabled?: boolean
        [k: string]: unknown
      }) => (
        <button
          type='button'
          data-testid='add-recipient'
          disabled={disabled}
          onClick={() => onAdd({ id: 'u-2', username: 'alice', roles: [] })}
        >
          Add
        </button>
      ),
    }) as unknown as typeof import('@/components/messages/recipient-picker'),
)

vi.mock(import('@/components/shared/page-header'), () => ({
  PageHeader: () => <header />,
}))

import { NewMessageClient } from './new-message-client'

describe('NewMessageClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the new-message-form', () => {
    const { container } = render(<NewMessageClient currentUserId='u-1' />)
    expect(container.querySelector('[data-pw="new-message-form"]')).not.toBeNull()
  })

  it('disables submit when no recipients (initial state)', () => {
    const { container } = render(<NewMessageClient currentUserId='u-1' />)
    const submit = container.querySelector(
      '[data-pw="new-message-submit-button"]',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('calls createDirectConversation and sendDirectMessage and navigates on submit', async () => {
    mockCreateDirectConversation.mockResolvedValueOnce({
      conversation: {
        id: 'conv-new',
        channel_type: 'direct_message',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    })
    mockSendDirectMessage.mockResolvedValueOnce({})

    const { container } = render(<NewMessageClient currentUserId='u-1' />)

    fireEvent.click(screen.getByTestId('add-recipient'))

    const textarea = container.querySelector(
      '[data-pw="new-message-body-input"]',
    ) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Hello group!' } })

    const form = container.querySelector('[data-pw="new-message-form"]') as HTMLFormElement
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockCreateDirectConversation).toHaveBeenCalledWith(['u-2'])
      expect(mockSendDirectMessage).toHaveBeenCalledWith('conv-new', 'Hello group!')
      expect(mockPrependConversation).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'conv-new' }),
      )
      expect(mockPush).toHaveBeenCalledWith('/messages/conv-new')
    })
  })

  it('calls onError when handleSubmit throws', async () => {
    const err = new Error('create failed')
    mockCreateDirectConversation.mockRejectedValueOnce(err)

    const { container } = render(<NewMessageClient currentUserId='u-1' />)

    fireEvent.click(screen.getByTestId('add-recipient'))

    const textarea = container.querySelector(
      '[data-pw="new-message-body-input"]',
    ) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Hello!' } })

    fireEvent.submit(container.querySelector('[data-pw="new-message-form"]') as HTMLFormElement)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(err, { fallback: 'Failed to create conversation' })
    })
  })
})
