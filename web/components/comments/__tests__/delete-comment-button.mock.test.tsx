import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { deletePost } from '@/lib/api/client/posts'
import { DeleteCommentButton } from '../delete-comment-button'

vi.mock(import('@/lib/api/client/posts'), () => ({
  deletePost: vi.fn<VitestLooseMock>(),
}))

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

const mockedDeletePost = vi.mocked(deletePost)

describe('DeleteCommentButton', () => {
  it('renders the Delete trigger button with data-pw attribute', () => {
    render(
      <DeleteCommentButton
        commentId='comment-1'
        onDeleted={vi.fn<VitestLooseMock>()}
      />,
    )
    const trigger = screen.getByRole('button', { name: /Delete/i })
    expect(trigger).toBeDefined()
    expect(trigger.getAttribute('data-pw')).toBe('delete-comment-button')
  })

  it('opens the confirm dialog when the trigger is clicked', async () => {
    render(
      <DeleteCommentButton
        commentId='comment-1'
        onDeleted={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }))
    expect(await screen.findByText('Delete this comment?')).toBeDefined()
    expect(screen.getByText('This cannot be undone.')).toBeDefined()
  })

  it('shows Cancel button inside the dialog', async () => {
    render(
      <DeleteCommentButton
        commentId='comment-1'
        onDeleted={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }))
    await screen.findByText('Delete this comment?')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()
  })

  it('shows success toast and calls onDeleted on successful delete', async () => {
    mockedDeletePost.mockResolvedValueOnce(undefined)
    const onDeleted = vi.fn<VitestLooseMock>()

    render(
      <DeleteCommentButton
        commentId='comment-1'
        onDeleted={onDeleted}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }))
    await screen.findByText('Delete this comment?')
    const buttons = screen.getAllByRole('button', { name: /Delete/i })
    fireEvent.click(buttons.at(-1)!)

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Comment deleted')
      expect(onDeleted).toHaveBeenCalled()
    })
  })

  it('reports delete failures via onError fallback', async () => {
    mockedDeletePost.mockRejectedValueOnce(new Error('Delete failed'))

    render(
      <DeleteCommentButton
        commentId='comment-1'
        onDeleted={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }))
    await screen.findByText('Delete this comment?')
    const buttons = screen.getAllByRole('button', { name: /Delete/i })
    fireEvent.click(buttons.at(-1)!)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to delete comment')
    })
  })
})
