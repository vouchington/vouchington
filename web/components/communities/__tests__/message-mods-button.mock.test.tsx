import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockOpenModmailThread, mockOnError, mockPush } = vi.hoisted(() => ({
  mockOpenModmailThread: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
  mockPush: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/modmail'), () => ({
  openModmailThread: mockOpenModmailThread,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
        loading: _loading,
        ...rest
      }: {
        children: React.ReactNode
        onClick?: () => void
        disabled?: boolean
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

import MessageModsButton from '../message-mods-button'

describe('MessageModsButton', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the Message Mods button', () => {
    render(<MessageModsButton communitySlug='test-community' />)
    expect(screen.getByText('Message Mods')).toBeDefined()
  })

  it('has the message-mods-button data-pw attribute', () => {
    const { container } = render(<MessageModsButton communitySlug='test-community' />)
    expect(container.querySelector('[data-pw="message-mods-button"]')).not.toBeNull()
  })

  it('navigates to thread on success', async () => {
    mockOpenModmailThread.mockResolvedValueOnce({ thread: { id: 'thread-1' } })
    render(<MessageModsButton communitySlug='test-community' />)
    fireEvent.click(screen.getByText('Message Mods'))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/messages/modmail/test-community/thread-1')
    })
  })

  it('calls onError on failure', async () => {
    const err = new Error('fail')
    mockOpenModmailThread.mockRejectedValueOnce(err)
    render(<MessageModsButton communitySlug='test-community' />)
    fireEvent.click(screen.getByText('Message Mods'))
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ fallback: expect.any(String) }),
      )
    })
  })

  it('calls openModmailThread with the community slug', async () => {
    mockOpenModmailThread.mockResolvedValueOnce({ thread: { id: 'thread-1' } })
    render(<MessageModsButton communitySlug='my-community' />)
    fireEvent.click(screen.getByText('Message Mods'))
    await waitFor(() => {
      expect(mockOpenModmailThread).toHaveBeenCalledWith('my-community')
    })
  })
})
